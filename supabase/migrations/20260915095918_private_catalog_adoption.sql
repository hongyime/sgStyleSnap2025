-- Source preparation only: no live data copy, bucket or private-mode activation.
BEGIN;
ALTER TABLE stylesnap_archive.upload_control
  ADD COLUMN catalog_adoptions_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE stylesnap_archive.catalog_adoptions (
  item_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  manifest_sha text NOT NULL CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  catalog_snapshot jsonb NOT NULL CHECK (octet_length(catalog_snapshot::text) <= 32768),
  binding_snapshot jsonb NOT NULL CHECK (octet_length(binding_snapshot::text) <= 16384),
  item_snapshot jsonb NOT NULL CHECK (octet_length(item_snapshot::text) <= 32768),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No cascading source foreign keys: later source removal cannot erase provenance.
ALTER TABLE stylesnap_archive.catalog_adoptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylesnap_archive.catalog_adoptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON stylesnap_archive.catalog_adoptions TO service_role;
CREATE INDEX stylesnap_catalog_adoption_owner_idx ON stylesnap_archive.catalog_adoptions(owner_id,catalog_item_id);
-- Existing duplicates remain intact. The shared control/owner lock serializes new writes.
CREATE INDEX stylesnap_catalog_owned_lookup_idx ON public.clothes(owner_id,catalog_item_id,created_at,id)
  WHERE removed_at IS NULL AND catalog_item_id IS NOT NULL;

CREATE FUNCTION public.stylesnap_require_catalog_media_writer()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF NEW.catalog_item_id IS NOT NULL AND current_user <> 'service_role'
      AND EXISTS(SELECT 1 FROM public.stylesnap_media_delivery_control WHERE singleton AND reads_enabled)
      AND (TG_OP='INSERT' OR ROW(NEW.catalog_item_id,NEW.image_url,NEW.thumbnail_url)
        IS DISTINCT FROM ROW(OLD.catalog_item_id,OLD.image_url,OLD.thumbnail_url)) THEN
    RAISE EXCEPTION 'verified_catalog_writer_required';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_require_catalog_media_writer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_require_catalog_media_writer() TO service_role;
CREATE TRIGGER stylesnap_require_catalog_media_writer
  BEFORE INSERT OR UPDATE ON public.clothes FOR EACH ROW
  EXECUTE FUNCTION public.stylesnap_require_catalog_media_writer();

CREATE FUNCTION public.stylesnap_adopt_catalog_item(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  actor uuid;
  catalog_id uuid;
  privacy text;
  settings stylesnap_archive.control%ROWTYPE;
  source public.catalog_items%ROWTYPE;
  item public.clothes%ROWTYPE;
  binding public.stylesnap_media_bindings%ROWTYPE;
  bindings jsonb := '[]'::jsonb;
  delivery public.stylesnap_media_delivery_control%ROWTYPE;
  field text;
  expected_url text;
  egress_bytes bigint;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>1024
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) key WHERE key NOT IN ('owner_id','catalog_item_id','privacy')) THEN
    RAISE EXCEPTION 'invalid_catalog_request';
  END IF;
  actor := (payload->>'owner_id')::uuid;
  catalog_id := (payload->>'catalog_item_id')::uuid;
  privacy := payload->>'privacy';
  IF actor IS NULL OR catalog_id IS NULL OR privacy IS NULL OR privacy NOT IN ('private','friends','public') THEN
    RAISE EXCEPTION 'invalid_catalog_request';
  END IF;
  -- Match archive/upload lock order. No HTTP or object copy occurs in this transaction.
  SELECT * INTO STRICT settings FROM stylesnap_archive.control WHERE singleton FOR UPDATE;
  PERFORM singleton FROM stylesnap_archive.upload_control WHERE singleton FOR UPDATE;
  PERFORM id FROM public.users WHERE id=actor AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_owner_unavailable'; END IF;
  SELECT * INTO item FROM public.clothes
    WHERE owner_id=actor AND catalog_item_id=catalog_id AND removed_at IS NULL
    ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    -- A lost response or another tab must not insert again or overwrite privacy.
    RETURN jsonb_build_object('created',false,'item',jsonb_build_object(
      'id',item.id,'owner_id',actor,'catalog_item_id',catalog_id,'privacy',item.privacy));
  END IF;
  IF NOT (SELECT catalog_adoptions_enabled FROM stylesnap_archive.upload_control WHERE singleton) THEN
    RAISE EXCEPTION 'catalog_adoptions_disabled';
  END IF;
  IF NOT settings.writes_enabled THEN RAISE EXCEPTION 'archive_writes_disabled'; END IF;
  IF settings.headroom_verified_at IS NULL OR settings.headroom_verified_at < clock_timestamp()-interval '1 hour'
      OR settings.headroom_verified_at > clock_timestamp()+interval '1 minute'
      OR settings.other_organization_storage_bytes IS NULL THEN RAISE EXCEPTION 'storage_headroom_unverified'; END IF;
  IF settings.egress_verified_at IS NULL OR settings.egress_verified_at < clock_timestamp()-interval '1 hour'
      OR settings.egress_verified_at > clock_timestamp()+interval '1 minute'
      OR settings.approved_egress_bytes IS NULL THEN RAISE EXCEPTION 'egress_headroom_unverified'; END IF;
  IF settings.manifest_sha IS NULL OR NOT settings.manifest_retained THEN RAISE EXCEPTION 'retained_manifest_required'; END IF;
  SELECT * INTO STRICT delivery FROM public.stylesnap_media_delivery_control WHERE singleton FOR SHARE;
  IF NOT delivery.reads_enabled OR delivery.manifest_sha IS DISTINCT FROM settings.manifest_sha THEN
    RAISE EXCEPTION 'verified_private_delivery_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='stylesnap-media-archive' AND public=false) THEN
    RAISE EXCEPTION 'private_media_bucket_required';
  END IF;
  IF pg_database_size(current_database())+262144 > settings.max_database_bytes THEN
    RAISE EXCEPTION 'database_capacity_limit';
  END IF;
  SELECT * INTO source FROM public.catalog_items catalog WHERE catalog.id=catalog_id AND catalog.is_active AND catalog.privacy='public' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_source_unavailable'; END IF;
  IF octet_length(to_jsonb(source)::text)>32768 THEN RAISE EXCEPTION 'catalog_source_too_large'; END IF;
  FOREACH field IN ARRAY ARRAY['image_url','thumbnail_url'] LOOP
    expected_url := CASE field WHEN 'image_url' THEN source.image_url ELSE source.thumbnail_url END;
    SELECT * INTO binding FROM public.stylesnap_media_bindings
      WHERE source_table='catalog_items' AND source_id=catalog_id AND source_column=field
        AND source_url=expected_url AND manifest_sha=settings.manifest_sha FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'verified_catalog_binding_required'; END IF;
    PERFORM name FROM storage.objects WHERE bucket_id='stylesnap-media-archive' AND name=binding.object_path
      AND metadata->>'size' ~ '^[0-9]{1,8}$' AND (metadata->>'size')::bigint=binding.content_bytes;
    IF NOT FOUND THEN RAISE EXCEPTION 'verified_catalog_object_required'; END IF;
    IF NOT EXISTS(SELECT 1 FROM stylesnap_archive.binding_versions
      WHERE version_sha=stylesnap_archive.media_binding_version(binding)) THEN
      RAISE EXCEPTION 'retained_catalog_binding_required';
    END IF;
    bindings := bindings || jsonb_build_array(to_jsonb(binding));
  END LOOP;
  SELECT coalesce(sum(maximum_bytes),0) INTO egress_bytes FROM stylesnap_archive.reservations WHERE kind='egress';
  -- Covers bounded Auth/RPC/Edge response bodies. Existing media is referenced,
  -- not downloaded, re-uploaded or charged another Storage reservation.
  IF egress_bytes+262144 > settings.approved_egress_bytes THEN RAISE EXCEPTION 'egress_capacity_limit'; END IF;
  INSERT INTO public.clothes(owner_id,catalog_item_id,name,category,clothing_type,image_url,thumbnail_url,
    style_tags,privacy,brand,size,primary_color,secondary_colors)
  VALUES(actor,catalog_id,source.name,source.category,source.clothing_type,source.image_url,source.thumbnail_url,
    source.style,privacy,source.brand,source.size,source.primary_color,source.secondary_colors)
  RETURNING * INTO item;
  FOR binding IN SELECT * FROM jsonb_populate_recordset(NULL::public.stylesnap_media_bindings,bindings) LOOP
    INSERT INTO public.stylesnap_media_bindings(source_table,source_id,source_column,source_url,manifest_sha,
      content_sha256,object_path,content_bytes,mime_type)
    VALUES('clothes',item.id,binding.source_column,binding.source_url,binding.manifest_sha,
      binding.content_sha256,binding.object_path,binding.content_bytes,binding.mime_type);
  END LOOP;
  INSERT INTO stylesnap_archive.catalog_adoptions(item_id,owner_id,catalog_item_id,manifest_sha,catalog_snapshot,binding_snapshot,item_snapshot)
    VALUES(item.id,actor,catalog_id,settings.manifest_sha,to_jsonb(source),bindings,to_jsonb(item));
  INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
    VALUES('egress',encode(sha256(convert_to('catalog-adoption:'||item.id::text,'UTF8')),'hex'),settings.manifest_sha,262144);
  IF pg_database_size(current_database()) > settings.max_database_bytes THEN RAISE EXCEPTION 'database_capacity_limit'; END IF;
  RETURN jsonb_build_object('created',true,'item',jsonb_build_object(
    'id',item.id,'owner_id',actor,'catalog_item_id',catalog_id,'privacy',item.privacy));
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_adopt_catalog_item(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_adopt_catalog_item(jsonb) TO service_role;
COMMIT;
