-- Prepared only: migration does not create a bucket, enable writes or copy data.
CREATE SCHEMA IF NOT EXISTS stylesnap_archive;
REVOKE ALL ON SCHEMA stylesnap_archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA stylesnap_archive TO service_role;

CREATE TABLE stylesnap_archive.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  writes_enabled boolean NOT NULL DEFAULT false,
  max_storage_bytes bigint NOT NULL DEFAULT 800000000 CHECK (max_storage_bytes BETWEEN 1 AND 800000000),
  max_database_bytes bigint NOT NULL DEFAULT 450000000 CHECK (max_database_bytes BETWEEN 1 AND 450000000),
  other_organization_storage_bytes bigint CHECK (other_organization_storage_bytes >= 0),
  headroom_verified_at timestamptz,
  approved_egress_bytes bigint CHECK (approved_egress_bytes BETWEEN 0 AND 4000000000),
  egress_verified_at timestamptz,
  manifest_sha text CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  checkpoint_sha text CHECK (checkpoint_sha ~ '^[0-9a-f]{64}$'),
  plan_sha text CHECK (plan_sha ~ '^[0-9a-f]{64}$'),
  manifest_retained boolean NOT NULL DEFAULT false,
  checkpoint_pool_remaining bigint NOT NULL DEFAULT 0 CHECK (checkpoint_pool_remaining >= 0),
  lease_owner uuid,
  lease_expires_at timestamptz
);
INSERT INTO stylesnap_archive.control(singleton) VALUES (true);

CREATE TABLE stylesnap_archive.reservations (
  kind text NOT NULL CHECK (kind IN ('storage', 'egress')),
  operation_sha text NOT NULL CHECK (operation_sha ~ '^[0-9a-f]{64}$'),
  manifest_sha text NOT NULL CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  maximum_bytes bigint NOT NULL CHECK (maximum_bytes >= 0),
  object_path text,
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, operation_sha),
  CHECK (NOT settled OR (kind = 'storage' AND object_path IS NOT NULL))
);
ALTER TABLE stylesnap_archive.control ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylesnap_archive.reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stylesnap_archive.control, stylesnap_archive.reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON stylesnap_archive.control, stylesnap_archive.reservations TO service_role;

CREATE FUNCTION public.stylesnap_archive_control(action text, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  settings stylesnap_archive.control%ROWTYPE;
  existing stylesnap_archive.reservations%ROWTYPE;
  owner_id uuid := (payload->>'owner')::uuid;
  manifest text := payload->>'manifest_sha';
  operation text := payload->>'operation_sha';
  amount bigint := (payload->>'maximum_bytes')::bigint;
  reservation_kind text;
  current_storage bigint;
  pending_storage bigint;
  reserved_egress bigint;
  object_size bigint;
  object_name text := payload->>'object_path';
  next_checkpoint text := payload->>'checkpoint_sha';
  next_plan text := payload->>'plan_sha';
  checkpoint_pool bigint := (payload->>'checkpoint_pool_bytes')::bigint;
  plan_total bigint;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF owner_id IS NULL OR manifest IS NULL OR manifest !~ '^[0-9a-f]{64}$'
     OR action NOT IN ('claim','check','reserve_plan','reserve_storage','reserve_egress','settle_storage','commit_checkpoint')
     OR action IS NULL THEN
    RAISE EXCEPTION 'invalid_control_request';
  END IF;
  -- One row lock serializes claims, capacity reservations and checkpoint CAS.
  SELECT * INTO STRICT settings FROM stylesnap_archive.control WHERE singleton FOR UPDATE;
  IF NOT settings.writes_enabled THEN RAISE EXCEPTION 'archive_writes_disabled'; END IF;
  IF settings.headroom_verified_at IS NULL
     OR settings.headroom_verified_at < clock_timestamp() - interval '1 hour'
     OR settings.headroom_verified_at > clock_timestamp() + interval '1 minute'
     OR settings.other_organization_storage_bytes IS NULL THEN
    RAISE EXCEPTION 'storage_headroom_unverified';
  END IF;
  IF settings.egress_verified_at IS NULL
     OR settings.egress_verified_at < clock_timestamp() - interval '1 hour'
     OR settings.egress_verified_at > clock_timestamp() + interval '1 minute'
     OR settings.approved_egress_bytes IS NULL THEN
    RAISE EXCEPTION 'egress_headroom_unverified';
  END IF;
  IF pg_catalog.pg_database_size(pg_catalog.current_database()) > settings.max_database_bytes THEN
    RAISE EXCEPTION 'database_capacity_limit';
  END IF;
  IF settings.manifest_sha IS NOT NULL AND settings.manifest_sha <> manifest THEN
    RAISE EXCEPTION 'manifest_conflict';
  END IF;
  IF action = 'claim' THEN
    IF settings.lease_owner IS NOT NULL AND settings.lease_owner <> owner_id
       AND settings.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'lease_busy';
    END IF;
    UPDATE stylesnap_archive.control SET lease_owner = owner_id,
      lease_expires_at = clock_timestamp() + interval '5 minutes', manifest_sha = manifest WHERE singleton;
    -- Expired leases never delete reservations or release uncertain uploaded bytes.
    RETURN jsonb_build_object('checkpoint_sha', settings.checkpoint_sha);
  END IF;
  IF settings.lease_owner IS DISTINCT FROM owner_id OR settings.lease_expires_at IS NULL
     OR settings.lease_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'lease_lost'; END IF;
  UPDATE stylesnap_archive.control SET lease_expires_at = clock_timestamp() + interval '5 minutes' WHERE singleton;
  IF action = 'check' THEN RETURN jsonb_build_object('checkpoint_sha', settings.checkpoint_sha); END IF;

  IF action = 'reserve_plan' THEN
    IF next_plan IS NULL OR next_plan !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(payload->'reservations') IS DISTINCT FROM 'array'
       OR checkpoint_pool IS NULL OR checkpoint_pool < 0 OR checkpoint_pool > 800000000 THEN
      RAISE EXCEPTION 'invalid_reservation_plan';
    END IF;
    IF jsonb_array_length(payload->'reservations') NOT BETWEEN 1 AND 40001 THEN
      RAISE EXCEPTION 'invalid_reservation_plan';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'reservations') item
        WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
          OR item->>'operation_sha' IS NULL OR item->>'operation_sha' !~ '^[0-9a-f]{64}$'
          OR jsonb_typeof(item->'maximum_bytes') IS DISTINCT FROM 'number'
          OR item->>'maximum_bytes' !~ '^[0-9]{1,8}$'
          OR (item->>'maximum_bytes')::bigint NOT BETWEEN 1 AND 8000000)
       OR (SELECT count(*) <> count(DISTINCT item->>'operation_sha') FROM jsonb_array_elements(payload->'reservations') item) THEN
      RAISE EXCEPTION 'invalid_reservation_plan';
    END IF;
    IF settings.plan_sha IS NOT NULL THEN
      IF settings.plan_sha <> next_plan THEN RAISE EXCEPTION 'reservation_plan_conflict'; END IF;
      -- A replay never replenishes a partially consumed checkpoint pool.
      RETURN jsonb_build_object('reserved',true);
    END IF;
    IF EXISTS(SELECT 1 FROM stylesnap_archive.reservations WHERE kind='storage') THEN
      RAISE EXCEPTION 'unreconciled_prior_reservations';
    END IF;
    IF EXISTS(SELECT 1 FROM storage.objects WHERE metadata->>'size' IS NULL
        OR metadata->>'size' !~ '^[0-9]{1,15}$') THEN RAISE EXCEPTION 'storage_size_metadata_missing'; END IF;
    SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO current_storage FROM storage.objects;
    SELECT sum((item->>'maximum_bytes')::bigint) + checkpoint_pool INTO plan_total
      FROM jsonb_array_elements(payload->'reservations') item;
    IF current_storage + plan_total > settings.max_storage_bytes
       OR current_storage + plan_total + settings.other_organization_storage_bytes > settings.max_storage_bytes THEN
      RAISE EXCEPTION 'storage_capacity_limit';
    END IF;
    INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
      SELECT 'storage',item->>'operation_sha',manifest,(item->>'maximum_bytes')::bigint
      FROM jsonb_array_elements(payload->'reservations') item;
    UPDATE stylesnap_archive.control SET plan_sha=next_plan,checkpoint_pool_remaining=checkpoint_pool WHERE singleton;
    RETURN jsonb_build_object('reserved',true);
  END IF;

  IF action IN ('reserve_storage', 'reserve_egress') THEN
    IF operation IS NULL OR operation !~ '^[0-9a-f]{64}$' OR amount IS NULL
       OR amount < 0 OR amount > 25000000 THEN RAISE EXCEPTION 'invalid_reservation'; END IF;
    reservation_kind := CASE WHEN action = 'reserve_storage' THEN 'storage' ELSE 'egress' END;
    IF reservation_kind='storage' THEN
      IF settings.plan_sha IS NULL THEN RAISE EXCEPTION 'reservation_plan_required'; END IF;
      IF NOT settings.manifest_retained THEN RAISE EXCEPTION 'private_manifest_required'; END IF;
      IF EXISTS(SELECT 1 FROM storage.objects WHERE metadata->>'size' IS NULL
          OR metadata->>'size' !~ '^[0-9]{1,15}$') THEN RAISE EXCEPTION 'storage_size_metadata_missing'; END IF;
      SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO current_storage FROM storage.objects;
      SELECT coalesce(sum(maximum_bytes),0) INTO pending_storage FROM stylesnap_archive.reservations
        WHERE kind='storage' AND NOT settled;
      IF current_storage + pending_storage + settings.checkpoint_pool_remaining > settings.max_storage_bytes
         OR current_storage + pending_storage + settings.checkpoint_pool_remaining + settings.other_organization_storage_bytes > settings.max_storage_bytes THEN
        RAISE EXCEPTION 'storage_capacity_limit';
      END IF;
    END IF;
    SELECT * INTO existing FROM stylesnap_archive.reservations
      WHERE kind = reservation_kind AND operation_sha = operation;
    IF FOUND THEN
      IF existing.manifest_sha <> manifest OR existing.maximum_bytes <> amount THEN
        RAISE EXCEPTION 'reservation_conflict';
      END IF;
      RETURN jsonb_build_object('reserved', true);
    END IF;
    IF reservation_kind = 'storage' THEN
      IF payload->'checkpoint_allocation' IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'unplanned_storage_operation';
      END IF;
      IF amount > settings.checkpoint_pool_remaining THEN RAISE EXCEPTION 'storage_capacity_limit'; END IF;
      IF EXISTS(SELECT 1 FROM storage.objects WHERE metadata->>'size' IS NULL
                  OR metadata->>'size' !~ '^[0-9]{1,15}$') THEN
        RAISE EXCEPTION 'storage_size_metadata_missing';
      END IF;
      SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO current_storage FROM storage.objects;
      SELECT coalesce(sum(maximum_bytes),0) INTO pending_storage FROM stylesnap_archive.reservations
        WHERE kind = 'storage' AND NOT settled;
      -- The checkpoint bytes were already reserved by the complete plan.
      IF current_storage + pending_storage + settings.checkpoint_pool_remaining > settings.max_storage_bytes
         OR current_storage + pending_storage + settings.checkpoint_pool_remaining + settings.other_organization_storage_bytes > settings.max_storage_bytes THEN
        RAISE EXCEPTION 'storage_capacity_limit';
      END IF;
      UPDATE stylesnap_archive.control SET checkpoint_pool_remaining=checkpoint_pool_remaining-amount WHERE singleton;
    ELSE
      -- Transfer reservations remain charged; uncertain retries cannot reuse them.
      SELECT coalesce(sum(maximum_bytes),0) INTO reserved_egress FROM stylesnap_archive.reservations WHERE kind = 'egress';
      IF reserved_egress + amount > settings.approved_egress_bytes THEN RAISE EXCEPTION 'egress_capacity_limit'; END IF;
    END IF;
    INSERT INTO stylesnap_archive.reservations(kind,operation_sha,manifest_sha,maximum_bytes)
      VALUES (reservation_kind,operation,manifest,amount);
    RETURN jsonb_build_object('reserved', true);
  END IF;

  IF action = 'settle_storage' THEN
    IF operation IS NULL OR operation !~ '^[0-9a-f]{64}$' OR object_name IS NULL
       OR object_name !~ '^(sha256/[0-9a-f]{2}/[0-9a-f]{64}|(manifests|checkpoints)/[0-9a-f]{64}[.]json[.]gz)$' THEN
      RAISE EXCEPTION 'invalid_storage_settlement';
    END IF;
    SELECT * INTO STRICT existing FROM stylesnap_archive.reservations WHERE kind='storage' AND operation_sha=operation;
    SELECT (metadata->>'size')::bigint INTO object_size FROM storage.objects
      WHERE bucket_id='stylesnap-media-archive' AND name=object_name;
    IF object_size IS NULL OR payload->>'observed_bytes' IS NULL
       OR object_size <> (payload->>'observed_bytes')::bigint
       OR object_size > existing.maximum_bytes OR existing.manifest_sha <> manifest THEN
      RAISE EXCEPTION 'storage_settlement_unverified';
    END IF;
    IF existing.settled AND existing.object_path <> object_name THEN RAISE EXCEPTION 'reservation_conflict'; END IF;
    UPDATE stylesnap_archive.reservations SET settled=true,object_path=object_name
      WHERE kind='storage' AND operation_sha=operation;
    IF object_name='manifests/' || manifest || '.json.gz' THEN
      UPDATE stylesnap_archive.control SET manifest_retained=true WHERE singleton;
    END IF;
    -- Bytes stay charged in storage.objects. Only the duplicate pending reserve is removed.
    RETURN jsonb_build_object('settled', true);
  END IF;

  IF next_checkpoint IS NULL OR next_checkpoint !~ '^[0-9a-f]{64}$'
     OR settings.checkpoint_sha IS DISTINCT FROM (payload->>'previous_sha') THEN
    RAISE EXCEPTION 'stale_checkpoint';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='stylesnap-media-archive'
      AND name='checkpoints/' || next_checkpoint || '.json.gz') THEN
    RAISE EXCEPTION 'checkpoint_missing';
  END IF;
  UPDATE stylesnap_archive.control SET checkpoint_sha=next_checkpoint WHERE singleton;
  RETURN jsonb_build_object('checkpoint_sha', next_checkpoint);
END;
$function$;

REVOKE ALL ON FUNCTION public.stylesnap_archive_control(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_archive_control(text,jsonb) TO service_role;
