-- Preserve immutable private versions while keeping the public reader shape.
-- This migration grants no replacement writer, creates no bucket, and leaves
-- delivery/upload switches unchanged. A trusted atomic upload endpoint is still
-- required before any production image replacement can use this preparation.
BEGIN;
LOCK TABLE public.stylesnap_media_bindings, stylesnap_archive.binding_members,
  stylesnap_archive.binding_publications IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION stylesnap_archive.media_binding_version(binding public.stylesnap_media_bindings)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $function$
  SELECT encode(sha256(convert_to(jsonb_build_array(
    binding.source_table, binding.source_id, binding.source_column,
    binding.source_url, binding.manifest_sha, binding.content_sha256,
    binding.object_path, binding.content_bytes, binding.mime_type
  )::text, 'UTF8')), 'hex');
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.media_binding_version(public.stylesnap_media_bindings) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.media_binding_version(public.stylesnap_media_bindings) TO service_role;

CREATE TABLE stylesnap_archive.binding_versions (
  LIKE public.stylesnap_media_bindings INCLUDING CONSTRAINTS,
  version_sha text PRIMARY KEY CHECK (version_sha ~ '^[0-9a-f]{64}$'),
  retained_at timestamptz NOT NULL DEFAULT now(),
  CHECK (version_sha = stylesnap_archive.media_binding_version(ROW(
    source_table, source_id, source_column, source_url, manifest_sha,
    content_sha256, object_path, content_bytes, mime_type
  )::public.stylesnap_media_bindings))
);
CREATE INDEX stylesnap_binding_version_source_idx ON stylesnap_archive.binding_versions
  (source_table, source_id, source_column, manifest_sha);
ALTER TABLE stylesnap_archive.binding_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylesnap_archive.binding_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON stylesnap_archive.binding_versions TO service_role;

-- Existing active mappings are copied before memberships or write behavior
-- change. A failed migration rolls back the backfill and all schema changes.
INSERT INTO stylesnap_archive.binding_versions (
  source_table, source_id, source_column, source_url, manifest_sha,
  content_sha256, object_path, content_bytes, mime_type, version_sha
)
SELECT binding.*, stylesnap_archive.media_binding_version(binding)
FROM public.stylesnap_media_bindings binding;

CREATE FUNCTION stylesnap_archive.retain_media_binding_version()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.source_table,NEW.source_id,NEW.source_column,NEW.manifest_sha)
      IS DISTINCT FROM ROW(OLD.source_table,OLD.source_id,OLD.source_column,OLD.manifest_sha) THEN
    RAISE EXCEPTION 'binding_identity_is_immutable';
  END IF;
  INSERT INTO stylesnap_archive.binding_versions (
    source_table, source_id, source_column, source_url, manifest_sha,
    content_sha256, object_path, content_bytes, mime_type, version_sha
  ) VALUES (
    NEW.source_table, NEW.source_id, NEW.source_column, NEW.source_url, NEW.manifest_sha,
    NEW.content_sha256, NEW.object_path, NEW.content_bytes, NEW.mime_type,
    stylesnap_archive.media_binding_version(NEW)
  ) ON CONFLICT (version_sha) DO NOTHING;
  IF pg_catalog.pg_database_size(pg_catalog.current_database()) >
      (SELECT max_database_bytes FROM stylesnap_archive.control WHERE singleton) THEN
    RAISE EXCEPTION 'database_capacity_limit';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.retain_media_binding_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.retain_media_binding_version() TO service_role;
CREATE TRIGGER stylesnap_retain_media_binding_version
  BEFORE INSERT OR UPDATE ON public.stylesnap_media_bindings
  FOR EACH ROW EXECUTE FUNCTION stylesnap_archive.retain_media_binding_version();

ALTER TABLE stylesnap_archive.binding_members ADD COLUMN binding_version_sha text;
UPDATE stylesnap_archive.binding_members member SET binding_version_sha = version.version_sha
FROM stylesnap_archive.binding_versions version, stylesnap_archive.binding_publications publication
WHERE publication.plan_sha = member.plan_sha AND version.manifest_sha = publication.manifest_sha
  AND version.source_table = member.source_table AND version.source_id = member.source_id
  AND version.source_column = member.source_column;
ALTER TABLE stylesnap_archive.binding_members ALTER COLUMN binding_version_sha SET NOT NULL;
ALTER TABLE stylesnap_archive.binding_members ADD CONSTRAINT stylesnap_member_retained_version_fk
  FOREIGN KEY (binding_version_sha) REFERENCES stylesnap_archive.binding_versions(version_sha);
CREATE INDEX stylesnap_member_retained_version_idx ON stylesnap_archive.binding_members(binding_version_sha);

CREATE FUNCTION stylesnap_archive.retain_binding_plan_member()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  observed_version text;
BEGIN
  SELECT stylesnap_archive.media_binding_version(binding) INTO STRICT observed_version
  FROM public.stylesnap_media_bindings binding
  JOIN stylesnap_archive.binding_publications publication ON publication.manifest_sha = binding.manifest_sha
  WHERE publication.plan_sha = NEW.plan_sha AND binding.source_table = NEW.source_table
    AND binding.source_id = NEW.source_id AND binding.source_column = NEW.source_column;
  IF NEW.binding_version_sha IS NOT NULL AND NEW.binding_version_sha <> observed_version THEN
    RAISE EXCEPTION 'binding_plan_version_mismatch';
  END IF;
  NEW.binding_version_sha := observed_version;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.retain_binding_plan_member() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.retain_binding_plan_member() TO service_role;
CREATE TRIGGER stylesnap_retain_binding_plan_member BEFORE INSERT ON stylesnap_archive.binding_members
  FOR EACH ROW EXECUTE FUNCTION stylesnap_archive.retain_binding_plan_member();

CREATE FUNCTION stylesnap_archive.binding_plan_is_retained(plan text, manifest text, expected_count integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT (SELECT count(*) FROM stylesnap_archive.binding_members member WHERE member.plan_sha = plan) = expected_count
    AND NOT EXISTS (
      SELECT 1 FROM stylesnap_archive.binding_members member
      LEFT JOIN stylesnap_archive.binding_versions version ON version.version_sha = member.binding_version_sha
      LEFT JOIN public.stylesnap_media_bindings active ON active.manifest_sha = manifest
        AND active.source_table = member.source_table AND active.source_id = member.source_id
        AND active.source_column = member.source_column
      WHERE member.plan_sha = plan AND (
        version.manifest_sha IS DISTINCT FROM manifest
        OR version.source_table IS DISTINCT FROM member.source_table
        OR version.source_id IS DISTINCT FROM member.source_id
        OR version.source_column IS DISTINCT FROM member.source_column
        OR active.source_id IS NULL
      )
    );
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.binding_plan_is_retained(text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.binding_plan_is_retained(text,text,integer) TO service_role;

-- Initial import receipts remain tied to immutable versions. Later active
-- bindings do not change the original inventory or its completion count.
CREATE OR REPLACE FUNCTION public.stylesnap_publish_media_bindings(action text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  plan text := payload->>'plan_sha';
  manifest text := payload->>'manifest_sha';
  checkpoint text := payload->>'copy_checkpoint_sha';
  settings stylesnap_archive.control%ROWTYPE;
  publication stylesnap_archive.binding_publications%ROWTYPE;
  delivery public.stylesnap_media_delivery_control%ROWTYPE;
  expected jsonb := payload->'expected_batches';
  batch_number integer;
  rows_text text := payload->>'rows_json';
  rows_value jsonb;
  row_value jsonb;
  binding public.stylesnap_media_bindings%ROWTYPE;
  existing public.stylesnap_media_bindings%ROWTYPE;
  observed_url text;
  batch_sha text;
  row_count integer;
  plan_bytes bigint;
  current_storage bigint;
  pending_storage bigint;
  operation text;
  held_reservation stylesnap_archive.reservations%ROWTYPE;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF action IS NULL OR action NOT IN ('reserve','start','inspect','append','finish')
      OR plan IS NULL OR plan !~ '^[0-9a-f]{64}$'
      OR manifest IS NULL OR manifest !~ '^[0-9a-f]{64}$'
      OR checkpoint IS NULL OR checkpoint !~ '^[0-9a-f]{64}$'
      OR octet_length(payload::text) > 512000 THEN
    RAISE EXCEPTION 'invalid_binding_publication_request';
  END IF;
  -- Reuse the existing lease, freshness and capacity checks. Lock order is
  -- archive control -> delivery control -> publication, with no external calls.
  PERFORM public.stylesnap_archive_control('check', jsonb_build_object(
    'owner',payload->>'owner','manifest_sha',manifest));
  SELECT * INTO STRICT settings FROM stylesnap_archive.control WHERE singleton;
  IF settings.checkpoint_sha IS DISTINCT FROM checkpoint OR NOT settings.manifest_retained THEN
    RAISE EXCEPTION 'binding_copy_checkpoint_changed';
  END IF;
  SELECT * INTO STRICT delivery FROM public.stylesnap_media_delivery_control WHERE singleton FOR UPDATE;
  IF delivery.reads_enabled THEN RAISE EXCEPTION 'binding_publication_requires_disabled_reads'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='stylesnap-media-archive' AND public=false) THEN
    RAISE EXCEPTION 'private_media_bucket_required';
  END IF;
  IF action = 'reserve' THEN
    IF settings.plan_sha IS NULL OR payload->>'maximum_bytes' IS NULL
        OR payload->>'maximum_bytes' !~ '^[0-9]{1,7}$'
        OR (payload->>'maximum_bytes')::bigint NOT BETWEEN 1 AND 8000000 THEN
      RAISE EXCEPTION 'invalid_binding_plan_reservation';
    END IF;
    plan_bytes := (payload->>'maximum_bytes')::bigint;
    operation := encode(sha256(convert_to(manifest || ':binding_plan:' || plan,'UTF8')),'hex');
    IF EXISTS(SELECT 1 FROM storage.objects WHERE metadata->>'size' IS NULL
        OR metadata->>'size' !~ '^[0-9]{1,15}$') THEN RAISE EXCEPTION 'storage_size_metadata_missing'; END IF;
    SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO current_storage FROM storage.objects;
    SELECT coalesce(sum(maximum_bytes),0) INTO pending_storage FROM stylesnap_archive.reservations
      WHERE kind='storage' AND NOT settled;
    SELECT * INTO held_reservation FROM stylesnap_archive.reservations WHERE kind='storage' AND operation_sha=operation;
    IF FOUND THEN
      IF held_reservation.manifest_sha <> manifest OR held_reservation.maximum_bytes <> plan_bytes THEN
        RAISE EXCEPTION 'reservation_conflict';
      END IF;
      -- Existing reservations (including uncertain uploads) remain charged.
      plan_bytes := 0;
    END IF;
    IF current_storage + pending_storage + settings.checkpoint_pool_remaining
        + settings.other_organization_storage_bytes + plan_bytes > settings.max_storage_bytes THEN
      RAISE EXCEPTION 'storage_capacity_limit';
    END IF;
    IF plan_bytes > 0 THEN
      INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
        VALUES('storage',operation,manifest,plan_bytes);
    END IF;
    RETURN jsonb_build_object('reserved',true);
  END IF;
  IF action = 'start' THEN
    IF jsonb_typeof(expected) IS DISTINCT FROM 'array' OR jsonb_array_length(expected) > 100000
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) item
          WHERE jsonb_typeof(item) IS DISTINCT FROM 'object' OR item->>'sha256' IS NULL
            OR item->>'sha256' !~ '^[0-9a-f]{64}$' OR item->>'count' IS NULL
            OR item->>'count' !~ '^[0-9]{1,3}$' OR (item->>'count')::integer NOT BETWEEN 1 AND 100) THEN
      RAISE EXCEPTION 'invalid_binding_batch_inventory';
    END IF;
    SELECT coalesce(sum((item->>'count')::integer),0) INTO row_count FROM jsonb_array_elements(expected) item;
    IF row_count > 100000 OR payload->>'expected_count' IS NULL
        OR payload->>'expected_count' !~ '^[0-9]{1,6}$'
        OR row_count <> (payload->>'expected_count')::integer THEN
      RAISE EXCEPTION 'binding_count_mismatch';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM stylesnap_archive.reservations reservation
        JOIN storage.objects object ON object.bucket_id='stylesnap-media-archive' AND object.name=reservation.object_path
        WHERE reservation.kind='storage' AND reservation.settled AND reservation.manifest_sha=manifest
          AND object.name='manifests/' || plan || '.json.gz'
          AND (object.metadata->>'size')::bigint > 0
          AND (object.metadata->>'size')::bigint <= reservation.maximum_bytes) THEN
      RAISE EXCEPTION 'binding_plan_not_retained';
    END IF;
    INSERT INTO stylesnap_archive.binding_publications(plan_sha,manifest_sha,copy_checkpoint_sha,expected_batches,expected_count)
      VALUES (plan,manifest,checkpoint,expected,row_count) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO STRICT publication FROM stylesnap_archive.binding_publications WHERE plan_sha=plan FOR UPDATE;
  IF publication.manifest_sha <> manifest OR publication.copy_checkpoint_sha <> checkpoint
      OR (action='start' AND (publication.expected_batches <> expected OR publication.expected_count <> row_count)) THEN
    RAISE EXCEPTION 'binding_publication_conflict';
  END IF;
  IF action='append' THEN
    IF payload->>'batch_index' IS NULL OR payload->>'batch_index' !~ '^[0-9]{1,6}$'
        OR rows_text IS NULL OR octet_length(rows_text) > 256000 THEN
      RAISE EXCEPTION 'binding_batch_limit';
    END IF;
    batch_number := (payload->>'batch_index')::integer;
    rows_value := rows_text::jsonb;
    IF jsonb_typeof(rows_value) <> 'array' OR jsonb_array_length(rows_value) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'binding_batch_limit';
    END IF;
    batch_sha := encode(sha256(convert_to(rows_text,'UTF8')),'hex');
    IF batch_number >= jsonb_array_length(publication.expected_batches)
        OR batch_sha IS DISTINCT FROM (publication.expected_batches->batch_number->>'sha256')
        OR jsonb_array_length(rows_value) <> (publication.expected_batches->batch_number->>'count')::integer
        OR batch_number > publication.next_batch THEN
      RAISE EXCEPTION 'binding_batch_content_mismatch';
    END IF;
    -- Exact retries of committed batches return the durable progress receipt.
    IF batch_number = publication.next_batch THEN
      IF publication.complete THEN RAISE EXCEPTION 'binding_publication_complete'; END IF;
      FOR row_value IN SELECT value FROM jsonb_array_elements(rows_value) LOOP
        IF jsonb_typeof(row_value) <> 'object' THEN RAISE EXCEPTION 'invalid_binding_row'; END IF;
        SELECT * INTO binding FROM jsonb_populate_record(NULL::public.stylesnap_media_bindings,row_value);
        IF binding.manifest_sha IS DISTINCT FROM manifest THEN RAISE EXCEPTION 'binding_manifest_mismatch'; END IF;
        observed_url := NULL;
        CASE binding.source_table
          WHEN 'clothes' THEN SELECT CASE binding.source_column WHEN 'image_url' THEN image_url WHEN 'thumbnail_url' THEN thumbnail_url END
            INTO observed_url FROM public.clothes WHERE id=binding.source_id;
          WHEN 'catalog_items' THEN SELECT CASE binding.source_column WHEN 'image_url' THEN image_url WHEN 'thumbnail_url' THEN thumbnail_url END
            INTO observed_url FROM public.catalog_items WHERE id=binding.source_id;
          WHEN 'users' THEN SELECT avatar_url INTO observed_url FROM public.users WHERE id=binding.source_id AND binding.source_column='avatar_url';
          WHEN 'outfit_collections' THEN SELECT cover_image_url INTO observed_url FROM public.outfit_collections WHERE id=binding.source_id AND binding.source_column='cover_image_url';
          WHEN 'outfit_history' THEN SELECT photo_url INTO observed_url FROM public.outfit_history WHERE id=binding.source_id AND binding.source_column='photo_url';
          ELSE RAISE EXCEPTION 'invalid_binding_source';
        END CASE;
        IF observed_url IS NULL OR observed_url IS DISTINCT FROM binding.source_url THEN
          RAISE EXCEPTION 'binding_source_changed';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='stylesnap-media-archive'
            AND name=binding.object_path AND (metadata->>'size')::bigint=binding.content_bytes) THEN
          RAISE EXCEPTION 'binding_object_size_mismatch';
        END IF;
        SELECT * INTO existing FROM public.stylesnap_media_bindings WHERE source_table=binding.source_table
          AND source_id=binding.source_id AND source_column=binding.source_column AND manifest_sha=manifest;
        IF FOUND THEN
          IF existing IS DISTINCT FROM binding THEN RAISE EXCEPTION 'retained_binding_conflict'; END IF;
        ELSE
          INSERT INTO public.stylesnap_media_bindings SELECT binding.*;
        END IF;
        -- The key prevents duplicate source fields within/across plan batches.
        INSERT INTO stylesnap_archive.binding_members VALUES(plan,binding.source_table,binding.source_id,binding.source_column);
      END LOOP;
      UPDATE stylesnap_archive.binding_publications SET next_batch=next_batch+1,
        published_count=published_count+jsonb_array_length(rows_value) WHERE plan_sha=plan;
      IF pg_catalog.pg_database_size(pg_catalog.current_database()) > settings.max_database_bytes THEN
        RAISE EXCEPTION 'database_capacity_limit';
      END IF;
    END IF;
  ELSIF action='finish' THEN
    IF publication.next_batch <> jsonb_array_length(publication.expected_batches)
        OR publication.published_count <> publication.expected_count
        OR (SELECT count(*) FROM stylesnap_archive.binding_members WHERE plan_sha=plan) <> publication.expected_count
        OR NOT stylesnap_archive.binding_plan_is_retained(plan,manifest,publication.expected_count) THEN
      RAISE EXCEPTION 'binding_publication_incomplete';
    END IF;
    UPDATE stylesnap_archive.binding_publications SET complete=true WHERE plan_sha=plan;
  END IF;
  SELECT * INTO STRICT publication FROM stylesnap_archive.binding_publications WHERE plan_sha=plan;
  RETURN jsonb_build_object('next_batch',publication.next_batch,'published_count',publication.published_count,'complete',publication.complete);
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_publish_media_bindings(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_publish_media_bindings(text,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.stylesnap_require_complete_bindings()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF NEW.reads_enabled AND NOT EXISTS(
    SELECT 1 FROM stylesnap_archive.binding_publications publication
      JOIN stylesnap_archive.control control ON control.singleton
    WHERE publication.manifest_sha=NEW.manifest_sha AND publication.complete
      AND publication.copy_checkpoint_sha=control.checkpoint_sha
      AND publication.manifest_sha=control.manifest_sha
      AND stylesnap_archive.binding_plan_is_retained(publication.plan_sha,NEW.manifest_sha,publication.expected_count)
  ) THEN RAISE EXCEPTION 'complete_binding_publication_required'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_require_complete_bindings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_require_complete_bindings() TO service_role;

DO $block$
BEGIN
  IF pg_catalog.pg_database_size(pg_catalog.current_database()) >
      (SELECT max_database_bytes FROM stylesnap_archive.control WHERE singleton) THEN
    RAISE EXCEPTION 'database_capacity_limit';
  END IF;
END;
$block$;
COMMIT;
