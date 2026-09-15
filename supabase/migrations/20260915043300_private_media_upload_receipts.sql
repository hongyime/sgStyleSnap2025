-- Prepared trusted upload journal. It creates no bucket, performs no media
-- copy, and enables no upload or delivery switch. Catalog policy is unset.
BEGIN;
CREATE TABLE stylesnap_archive.upload_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  uploads_enabled boolean NOT NULL DEFAULT false,
  catalog_policy text CHECK (catalog_policy IN ('opt_in','public_only','legacy')),
  CHECK (NOT uploads_enabled OR catalog_policy IS NOT NULL)
);
INSERT INTO stylesnap_archive.upload_control(singleton) VALUES (true);
ALTER TABLE stylesnap_archive.upload_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylesnap_archive.upload_control FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON stylesnap_archive.upload_control TO service_role;

CREATE TABLE stylesnap_archive.upload_receipts (
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_sha text NOT NULL CHECK (request_sha ~ '^[0-9a-f]{64}$'),
  request_payload jsonb NOT NULL,
  manifest_sha text NOT NULL CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  catalog_policy text NOT NULL CHECK (catalog_policy IN ('opt_in','public_only','legacy')),
  source_id uuid NOT NULL,
  prior_source jsonb,
  original_path text NOT NULL,
  processed_path text NOT NULL,
  thumbnail_path text NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','stored','published')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  worker_id uuid,
  lease_expires_at timestamptz,
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,request_id),
  CHECK ((state='published') = (receipt IS NOT NULL))
);
CREATE INDEX stylesnap_upload_pending_owner_idx ON stylesnap_archive.upload_receipts(owner_id,created_at)
  WHERE state <> 'published';
ALTER TABLE stylesnap_archive.upload_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylesnap_archive.upload_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON stylesnap_archive.upload_receipts TO service_role;
GRANT UPDATE(state,attempt,worker_id,lease_expires_at,receipt) ON stylesnap_archive.upload_receipts TO service_role;

-- The existing quota/category triggers also run inside an empty-search-path
-- RPC. Qualify their dependencies without changing the legacy trigger rules.
CREATE OR REPLACE FUNCTION public.check_item_quota(user_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT count(*)::integer FROM public.clothes
  WHERE owner_id=user_id AND removed_at IS NULL AND catalog_item_id IS NULL;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_item_quota()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.catalog_item_id IS NULL AND public.check_item_quota(NEW.owner_id)>=50 THEN
    RAISE EXCEPTION 'Item upload quota exceeded. You can upload up to 50 items. Please delete some items to upload new ones.';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_set_category_from_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.clothing_type IS NOT NULL AND NEW.category IS NULL THEN
    NEW.category := public.get_category_from_clothing_type(NEW.clothing_type);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION stylesnap_archive.validate_upload_intent(intent jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE field record; fields jsonb := intent->'fields'; maximum integer;
BEGIN
  IF jsonb_typeof(intent) IS DISTINCT FROM 'object' OR jsonb_typeof(fields) IS DISTINCT FROM 'object'
      OR intent->>'mode' IS NULL OR intent->>'mode' NOT IN ('create','update')
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(intent) key WHERE key NOT IN ('mode','source_id','fields','catalog_consent','catalog_policy'))
      OR (intent ? 'catalog_policy' AND (intent->>'catalog_policy' IS NULL OR intent->>'catalog_policy' NOT IN ('opt_in','public_only','legacy')))
      OR (intent ? 'catalog_consent' AND jsonb_typeof(intent->'catalog_consent') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'invalid_upload_intent';
  END IF;
  IF intent->>'mode'='create' AND (fields->>'name' IS NULL OR length(trim(fields->>'name'))=0 OR intent ? 'source_id') THEN
    RAISE EXCEPTION 'invalid_upload_name';
  END IF;
  FOR field IN SELECT * FROM jsonb_each(fields) LOOP
    maximum := CASE field.key WHEN 'name' THEN 255 WHEN 'category' THEN 50 WHEN 'clothing_type' THEN 50
      WHEN 'brand' THEN 100 WHEN 'size' THEN 20 WHEN 'privacy' THEN 20 WHEN 'primary_color' THEN 50 END;
    IF maximum IS NOT NULL THEN
      IF jsonb_typeof(field.value) NOT IN ('null','string') OR length(field.value#>>'{}')>maximum
          OR (field.key='name' AND coalesce(length(trim(field.value#>>'{}')),0)=0)
          OR (field.key='privacy' AND (field.value#>>'{}' IS NULL OR field.value#>>'{}' NOT IN ('private','friends','public'))) THEN
        RAISE EXCEPTION 'invalid_upload_fields';
      END IF;
    ELSIF field.key='is_favorite' THEN
      IF jsonb_typeof(field.value) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_upload_fields'; END IF;
    ELSIF field.key IN ('style_tags','secondary_colors') THEN
      IF jsonb_typeof(field.value) <> 'null' THEN
        IF jsonb_typeof(field.value) IS DISTINCT FROM 'array'
            OR jsonb_array_length(field.value) > (CASE WHEN field.key='secondary_colors' THEN 3 ELSE 20 END)
            OR EXISTS(SELECT 1 FROM jsonb_array_elements(field.value) value WHERE jsonb_typeof(value)<>'string' OR length(value#>>'{}')>64) THEN
          RAISE EXCEPTION 'invalid_upload_fields';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid_upload_fields';
    END IF;
  END LOOP;
  -- Match the retained source table's constraints before allocating storage.
  -- The table constraints still independently protect final publication.
  IF (fields->>'category' IS NOT NULL AND fields->>'category' NOT IN
      ('top','bottom','outerwear','shoes','accessory','blazer','blouse','body','dress','hat','hoodie','longsleeve',
       'not-sure','other','pants','polo','shirt','shorts','skip','skirt','t-shirt','undershirt'))
      OR (fields->>'clothing_type' IS NOT NULL AND fields->>'clothing_type' NOT IN
      ('Blazer','Blouse','Body','Dress','Hat','Hoodie','Longsleeve','Not sure','Other','Outwear','Pants','Polo',
       'Shirt','Shoes','Shorts','Skip','Skirt','T-Shirt','Top','Undershirt'))
      OR (fields->>'primary_color' IS NOT NULL AND fields->>'primary_color' NOT IN
      ('black','white','gray','beige','brown','red','blue','yellow','green','orange','purple','pink','navy','teal','maroon','olive','gold','silver')) THEN
    RAISE EXCEPTION 'invalid_upload_fields';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.validate_upload_intent(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.validate_upload_intent(jsonb) TO service_role;

CREATE FUNCTION stylesnap_archive.publish_upload(actor uuid, request uuid, worker uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  operation stylesnap_archive.upload_receipts%ROWTYPE;
  current_source public.clothes%ROWTYPE;
  proposed public.clothes%ROWTYPE;
  committed public.clothes%ROWTYPE;
  policy text;
  catalog_id uuid;
  contributing boolean;
  target record;
  part text;
  descriptor jsonb;
  source_url text;
  object_name text;
  next_image_url text;
  next_thumbnail_url text;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO STRICT operation FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND request_id=request FOR UPDATE;
  IF operation.state <> 'stored' OR operation.worker_id IS DISTINCT FROM worker OR operation.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'verified_upload_required';
  END IF;
  SELECT catalog_policy INTO STRICT policy FROM stylesnap_archive.upload_control WHERE singleton AND uploads_enabled;
  IF policy IS DISTINCT FROM operation.catalog_policy THEN RAISE EXCEPTION 'upload_catalog_policy_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='stylesnap-media-archive' AND name=operation.original_path
      AND metadata->>'size' ~ '^[0-9]{1,8}$' AND (metadata->>'size')::bigint=(operation.request_payload->'original'->>'bytes')::bigint) THEN
    RAISE EXCEPTION 'verified_upload_object_missing';
  END IF;
  PERFORM stylesnap_archive.validate_upload_intent(operation.request_payload->'intent');
  next_image_url := 'stylesnap-private://'||operation.source_id::text||'/'||request::text||'/image';
  next_thumbnail_url := 'stylesnap-private://'||operation.source_id::text||'/'||request::text||'/thumbnail';
  IF operation.request_payload->'intent'->>'mode'='update' THEN
    SELECT * INTO current_source FROM public.clothes WHERE id=operation.source_id AND owner_id=actor AND removed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR to_jsonb(current_source) IS DISTINCT FROM operation.prior_source THEN RAISE EXCEPTION 'upload_source_changed'; END IF;
    proposed := jsonb_populate_record(current_source,operation.request_payload->'intent'->'fields');
    UPDATE public.clothes SET name=proposed.name,category=proposed.category,clothing_type=proposed.clothing_type,
      brand=proposed.brand,size=proposed.size,privacy=proposed.privacy,is_favorite=proposed.is_favorite,
      style_tags=proposed.style_tags,primary_color=proposed.primary_color,secondary_colors=proposed.secondary_colors,
      image_url=next_image_url,thumbnail_url=next_thumbnail_url,updated_at=now()
      WHERE id=operation.source_id RETURNING * INTO committed;
  ELSE
    proposed := jsonb_populate_record(NULL::public.clothes,operation.request_payload->'intent'->'fields');
    -- A NULL thumbnail prevents the unchanged legacy AFTER INSERT trigger from
    -- auto-contributing. Its final URL and any chosen catalog contribution are
    -- committed below in this same transaction; no partial row is visible.
    INSERT INTO public.clothes(id,owner_id,name,category,clothing_type,brand,size,privacy,is_favorite,style_tags,
      primary_color,secondary_colors,image_url,thumbnail_url)
    VALUES(operation.source_id,actor,proposed.name,proposed.category,proposed.clothing_type,proposed.brand,proposed.size,
      coalesce(proposed.privacy,'friends'),coalesce(proposed.is_favorite,false),proposed.style_tags,
      proposed.primary_color,proposed.secondary_colors,next_image_url,NULL);
    UPDATE public.clothes SET thumbnail_url=next_thumbnail_url WHERE id=operation.source_id RETURNING * INTO committed;
    contributing := policy='legacy' OR (policy='public_only' AND committed.privacy='public')
      OR (policy='opt_in' AND operation.request_payload->'intent'->'catalog_consent'='true'::jsonb);
    IF contributing THEN
      INSERT INTO public.catalog_items(name,category,image_url,thumbnail_url,tags,brand,color,season,style,privacy,is_active)
      VALUES(committed.name,committed.category,next_image_url,next_thumbnail_url,committed.style_tags,committed.brand,
        committed.primary_color,'all-season',committed.style_tags,'public',true) RETURNING id INTO catalog_id;
    END IF;
  END IF;
  FOR target IN SELECT 'clothes'::text AS source_table,operation.source_id AS source_id
    UNION ALL SELECT 'catalog_items',catalog_id WHERE catalog_id IS NOT NULL LOOP
    FOREACH part IN ARRAY ARRAY['processed','thumbnail'] LOOP
      descriptor := operation.request_payload->part;
      source_url := CASE part WHEN 'processed' THEN next_image_url ELSE next_thumbnail_url END;
      object_name := CASE part WHEN 'processed' THEN operation.processed_path ELSE operation.thumbnail_path END;
      IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='stylesnap-media-archive' AND name=object_name
          AND metadata->>'size' ~ '^[0-9]{1,8}$' AND (metadata->>'size')::bigint=(descriptor->>'bytes')::bigint) THEN
        RAISE EXCEPTION 'verified_upload_object_missing';
      END IF;
      INSERT INTO public.stylesnap_media_bindings(source_table,source_id,source_column,source_url,manifest_sha,
        content_sha256,object_path,content_bytes,mime_type)
      VALUES(target.source_table,target.source_id,CASE part WHEN 'processed' THEN 'image_url' ELSE 'thumbnail_url' END,
        source_url,operation.manifest_sha,descriptor->>'sha256',object_name,(descriptor->>'bytes')::bigint,descriptor->>'mime_type')
      ON CONFLICT(source_table,source_id,source_column,manifest_sha) DO UPDATE SET
        source_url=EXCLUDED.source_url,content_sha256=EXCLUDED.content_sha256,object_path=EXCLUDED.object_path,
        content_bytes=EXCLUDED.content_bytes,mime_type=EXCLUDED.mime_type;
    END LOOP;
  END LOOP;
  UPDATE stylesnap_archive.upload_receipts SET state='published',receipt=jsonb_build_object(
    'request_id',request,'item',to_jsonb(committed),'catalog_item_id',catalog_id)
    WHERE owner_id=actor AND request_id=request;
END;
$function$;
REVOKE ALL ON FUNCTION stylesnap_archive.publish_upload(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION stylesnap_archive.publish_upload(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.stylesnap_media_upload(action text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  actor uuid := (payload->>'owner_id')::uuid;
  request uuid := (payload->>'request_id')::uuid;
  worker uuid := (payload->>'worker_id')::uuid;
  incoming jsonb := payload->'request';
  incoming_sha text;
  settings stylesnap_archive.control%ROWTYPE;
  uploads stylesnap_archive.upload_control%ROWTYPE;
  current_receipt stylesnap_archive.upload_receipts%ROWTYPE;
  source public.clothes%ROWTYPE;
  delivery public.stylesnap_media_delivery_control%ROWTYPE;
  part text;
  descriptor jsonb;
  object_name text;
  reservation_sha text;
  storage_bytes bigint;
  pending_bytes bigint;
  egress_bytes bigint;
  attempt_bytes bigint := 524288;
  source_id uuid;
  known boolean;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF action IS NULL OR action NOT IN ('inspect','prepare','verified','publish') OR actor IS NULL
      OR request IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
      OR octet_length(payload::text)>32768 THEN RAISE EXCEPTION 'invalid_upload_request'; END IF;
  -- Preserve the archive lock ordering and account for both migration and
  -- application reservations in the same capacity ledger.
  SELECT * INTO STRICT settings FROM stylesnap_archive.control WHERE singleton FOR UPDATE;
  SELECT * INTO STRICT uploads FROM stylesnap_archive.upload_control WHERE singleton FOR UPDATE;
  PERFORM id FROM public.users WHERE id=actor AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload_owner_unavailable'; END IF;
  SELECT * INTO current_receipt FROM stylesnap_archive.upload_receipts
    WHERE owner_id=actor AND request_id=request FOR UPDATE;
  known := FOUND;
  IF action='inspect' THEN
    RETURN CASE WHEN known THEN jsonb_build_object('state',current_receipt.state,'receipt',current_receipt.receipt)
      ELSE jsonb_build_object('state','missing') END;
  END IF;
  IF worker IS NULL THEN RAISE EXCEPTION 'upload_worker_required'; END IF;
  IF jsonb_typeof(incoming) IS DISTINCT FROM 'object' OR
      jsonb_typeof(incoming->'intent') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_upload_payload';
  END IF;
  incoming_sha := encode(sha256(convert_to(incoming::text,'UTF8')),'hex');
  IF known AND current_receipt.request_sha <> incoming_sha THEN RAISE EXCEPTION 'upload_request_conflict'; END IF;
  -- A lost successful response is readable without acquiring another budget or
  -- enabling new writes. The caller still has to prove the same authenticated owner.
  IF known AND current_receipt.state='published' THEN
    RETURN jsonb_build_object('state','published','receipt',current_receipt.receipt);
  END IF;
  IF NOT uploads.uploads_enabled THEN RAISE EXCEPTION 'media_uploads_disabled'; END IF;
  IF NOT settings.writes_enabled THEN RAISE EXCEPTION 'archive_writes_disabled'; END IF;
  IF settings.headroom_verified_at IS NULL OR settings.headroom_verified_at < clock_timestamp()-interval '1 hour'
      OR settings.headroom_verified_at > clock_timestamp()+interval '1 minute'
      OR settings.other_organization_storage_bytes IS NULL THEN RAISE EXCEPTION 'storage_headroom_unverified'; END IF;
  IF settings.egress_verified_at IS NULL OR settings.egress_verified_at < clock_timestamp()-interval '1 hour'
      OR settings.egress_verified_at > clock_timestamp()+interval '1 minute'
      OR settings.approved_egress_bytes IS NULL THEN RAISE EXCEPTION 'egress_headroom_unverified'; END IF;
  IF settings.manifest_sha IS NULL OR NOT settings.manifest_retained THEN RAISE EXCEPTION 'retained_manifest_required'; END IF;
  SELECT * INTO STRICT delivery FROM public.stylesnap_media_delivery_control WHERE singleton;
  IF NOT delivery.reads_enabled OR delivery.manifest_sha IS DISTINCT FROM settings.manifest_sha THEN
    RAISE EXCEPTION 'verified_private_delivery_required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='stylesnap-media-archive' AND public=false) THEN
    RAISE EXCEPTION 'private_media_bucket_required';
  END IF;
  IF pg_database_size(current_database()) > settings.max_database_bytes THEN RAISE EXCEPTION 'database_capacity_limit'; END IF;
  IF known AND current_receipt.manifest_sha <> settings.manifest_sha THEN RAISE EXCEPTION 'upload_manifest_changed'; END IF;
  IF known AND current_receipt.catalog_policy IS DISTINCT FROM uploads.catalog_policy THEN RAISE EXCEPTION 'upload_catalog_policy_changed'; END IF;
  IF NOT known AND action <> 'prepare' THEN RAISE EXCEPTION 'upload_reservation_missing'; END IF;

  IF action='prepare' THEN
    PERFORM stylesnap_archive.validate_upload_intent(incoming->'intent');
    IF incoming->'intent' ? 'catalog_policy' AND incoming->'intent'->>'catalog_policy' IS DISTINCT FROM uploads.catalog_policy THEN
      RAISE EXCEPTION 'upload_catalog_policy_changed';
    END IF;
    IF incoming->'intent'->>'mode' IS NULL OR incoming->'intent'->>'mode' NOT IN ('create','update')
        OR jsonb_typeof(incoming->'intent'->'fields') IS DISTINCT FROM 'object'
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(incoming) key WHERE key NOT IN ('intent','original','processed','thumbnail')) THEN
      RAISE EXCEPTION 'invalid_upload_intent';
    END IF;
    FOREACH part IN ARRAY ARRAY['original','processed','thumbnail'] LOOP
      descriptor := incoming->part;
      IF jsonb_typeof(descriptor) IS DISTINCT FROM 'object' OR descriptor->>'sha256' IS NULL
          OR descriptor->>'sha256' !~ '^[0-9a-f]{64}$' OR descriptor->>'bytes' IS NULL
          OR descriptor->>'bytes' !~ '^[0-9]{1,8}$'
          OR (descriptor->>'bytes')::bigint NOT BETWEEN 1 AND (CASE WHEN part='thumbnail' THEN 1048576 ELSE 4194304 END)
          OR descriptor->>'mime_type' IS NULL OR descriptor->>'mime_type' NOT IN ('image/jpeg','image/png','image/webp','image/gif','image/avif') THEN
        RAISE EXCEPTION 'invalid_upload_descriptor';
      END IF;
      attempt_bytes := attempt_bytes+(descriptor->>'bytes')::bigint;
    END LOOP;
    IF known AND current_receipt.worker_id IS DISTINCT FROM worker AND current_receipt.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'upload_in_progress';
    END IF;
    IF NOT known THEN
      IF (SELECT count(*) FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND state<>'published') >= 5 THEN
        RAISE EXCEPTION 'pending_upload_limit';
      END IF;
      IF (SELECT count(*) FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND created_at>clock_timestamp()-interval '1 day') >= 100 THEN
        RAISE EXCEPTION 'daily_upload_limit';
      END IF;
      IF incoming->'intent'->>'mode'='update' THEN
        source_id := (incoming->'intent'->>'source_id')::uuid;
        SELECT * INTO source FROM public.clothes WHERE id=source_id AND owner_id=actor AND removed_at IS NULL FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'upload_source_unavailable'; END IF;
      ELSE
        source_id := gen_random_uuid();
        IF (SELECT count(*) FROM public.clothes WHERE owner_id=actor AND removed_at IS NULL AND catalog_item_id IS NULL)
          +(SELECT count(*) FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND state<>'published' AND request_payload->'intent'->>'mode'='create') >= 50 THEN
          RAISE EXCEPTION 'item_upload_quota';
        END IF;
      END IF;
      INSERT INTO stylesnap_archive.upload_receipts(owner_id,request_id,request_sha,request_payload,manifest_sha,catalog_policy,source_id,
        prior_source,original_path,processed_path,thumbnail_path)
      VALUES(actor,request,incoming_sha,incoming,settings.manifest_sha,uploads.catalog_policy,source_id,
        CASE WHEN incoming->'intent'->>'mode'='update' THEN to_jsonb(source) ELSE NULL END,
        'originals/'||actor::text||'/'||(incoming->'original'->>'sha256'),
        'sha256/'||substr(incoming->'processed'->>'sha256',1,2)||'/'||(incoming->'processed'->>'sha256'),
        'sha256/'||substr(incoming->'thumbnail'->>'sha256',1,2)||'/'||(incoming->'thumbnail'->>'sha256'));
      FOREACH part IN ARRAY ARRAY['original','processed','thumbnail'] LOOP
        reservation_sha := encode(sha256(convert_to('upload:'||actor::text||':'||request::text||':'||part,'UTF8')),'hex');
        INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
          VALUES('storage',reservation_sha,settings.manifest_sha,(incoming->part->>'bytes')::bigint);
      END LOOP;
      SELECT * INTO STRICT current_receipt FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND request_id=request;
    END IF;
    IF current_receipt.worker_id IS DISTINCT FROM worker OR current_receipt.lease_expires_at <= clock_timestamp() THEN
      IF current_receipt.attempt >= 3 THEN RAISE EXCEPTION 'upload_retry_limit'; END IF;
      IF current_receipt.state='stored' THEN attempt_bytes := 524288; END IF;
      SELECT coalesce(sum(maximum_bytes),0) INTO egress_bytes FROM stylesnap_archive.reservations WHERE kind='egress';
      IF egress_bytes+attempt_bytes > settings.approved_egress_bytes THEN RAISE EXCEPTION 'egress_capacity_limit'; END IF;
      reservation_sha := encode(sha256(convert_to('upload:'||actor::text||':'||request::text||':attempt:'||(current_receipt.attempt+1)::text,'UTF8')),'hex');
      INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
        VALUES('egress',reservation_sha,settings.manifest_sha,attempt_bytes);
      UPDATE stylesnap_archive.upload_receipts SET worker_id=worker,lease_expires_at=clock_timestamp()+interval '2 minutes',attempt=attempt+1
        WHERE owner_id=actor AND request_id=request;
    END IF;
  ELSIF action='publish' THEN
    PERFORM stylesnap_archive.publish_upload(actor,request,worker);
  ELSE
    IF current_receipt.worker_id IS DISTINCT FROM worker OR current_receipt.lease_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'upload_lease_lost';
    END IF;
    FOREACH part IN ARRAY ARRAY['original','processed','thumbnail'] LOOP
      object_name := CASE part WHEN 'original' THEN current_receipt.original_path WHEN 'processed' THEN current_receipt.processed_path ELSE current_receipt.thumbnail_path END;
      IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='stylesnap-media-archive' AND name=object_name
          AND metadata->>'size' ~ '^[0-9]{1,8}$' AND (metadata->>'size')::bigint=(incoming->part->>'bytes')::bigint) THEN
        RAISE EXCEPTION 'verified_upload_object_missing';
      END IF;
      reservation_sha := encode(sha256(convert_to('upload:'||actor::text||':'||request::text||':'||part,'UTF8')),'hex');
      UPDATE stylesnap_archive.reservations SET settled=true,object_path=object_name
        WHERE kind='storage' AND operation_sha=reservation_sha AND manifest_sha=current_receipt.manifest_sha;
      IF NOT FOUND THEN RAISE EXCEPTION 'upload_reservation_missing'; END IF;
    END LOOP;
    UPDATE stylesnap_archive.upload_receipts SET state='stored' WHERE owner_id=actor AND request_id=request;
  END IF;
  -- Uncertain uploads stay reserved, even when some object bytes already exist.
  -- A failed check rolls back this request; it never deletes source or objects.
  IF EXISTS(SELECT 1 FROM storage.objects WHERE metadata->>'size' IS NULL OR metadata->>'size' !~ '^[0-9]{1,15}$') THEN
    RAISE EXCEPTION 'storage_size_metadata_missing';
  END IF;
  SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO storage_bytes FROM storage.objects;
  SELECT coalesce(sum(maximum_bytes),0) INTO pending_bytes FROM stylesnap_archive.reservations WHERE kind='storage' AND NOT settled;
  IF storage_bytes+pending_bytes+settings.checkpoint_pool_remaining+settings.other_organization_storage_bytes > settings.max_storage_bytes THEN
    RAISE EXCEPTION 'storage_capacity_limit';
  END IF;
  IF pg_database_size(current_database()) > settings.max_database_bytes THEN RAISE EXCEPTION 'database_capacity_limit'; END IF;
  SELECT * INTO STRICT current_receipt FROM stylesnap_archive.upload_receipts WHERE owner_id=actor AND request_id=request;
  IF current_receipt.state='published' THEN RETURN jsonb_build_object('state','published','receipt',current_receipt.receipt); END IF;
  RETURN jsonb_build_object('state',current_receipt.state,'source_id',current_receipt.source_id,
    'original_path',current_receipt.original_path,'processed_path',current_receipt.processed_path,
    'thumbnail_path',current_receipt.thumbnail_path,'attempt',current_receipt.attempt);
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_media_upload(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_media_upload(text,jsonb) TO service_role;
COMMIT;
