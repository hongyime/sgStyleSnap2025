-- Synthetic schema for executing the delivery migration under real PostgreSQL RLS.
-- Source SELECT policies match read-only metadata checked on 14 September 2026.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.users(id uuid PRIMARY KEY, avatar_url text, removed_at timestamptz);
CREATE TABLE public.clothes(id uuid PRIMARY KEY, owner_id uuid, privacy text, image_url text, thumbnail_url text, removed_at timestamptz);
CREATE TABLE public.catalog_items(id uuid PRIMARY KEY, image_url text, thumbnail_url text, privacy text, is_active boolean);
CREATE TABLE public.friends(id uuid PRIMARY KEY, requester_id uuid, receiver_id uuid, status text);
CREATE TABLE public.outfit_collections(id uuid PRIMARY KEY, user_id uuid, visibility text, cover_image_url text);
CREATE TABLE public.outfit_history(id uuid PRIMARY KEY, user_id uuid, photo_url text);
CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean NOT NULL);
CREATE TABLE storage.objects(bucket_id text, name text, PRIMARY KEY(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO service_role;
CREATE FUNCTION storage.operation() RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN current_setting('storage.operation', true); END;
$$;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.users TO anon, authenticated;
ALTER TABLE public.clothes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.clothes TO anon, authenticated;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.catalog_items TO anon, authenticated;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.friends TO anon, authenticated;
ALTER TABLE public.outfit_collections ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.outfit_collections TO anon, authenticated;
ALTER TABLE public.outfit_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.outfit_history TO anon, authenticated;
CREATE POLICY "Anyone can view active public catalog items" ON public.catalog_items FOR SELECT USING (((is_active = true) AND ((privacy)::text = 'public'::text)));
CREATE POLICY "Anyone can view public clothes" ON public.clothes FOR SELECT USING ((((privacy)::text = 'public'::text) AND (removed_at IS NULL)));
CREATE POLICY "Friends can view friends clothes" ON public.clothes FOR SELECT USING ((((privacy)::text = 'friends'::text) AND (removed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM friends
  WHERE ((((friends.requester_id = auth.uid()) AND (friends.receiver_id = clothes.owner_id)) OR ((friends.requester_id = clothes.owner_id) AND (friends.receiver_id = auth.uid()))) AND (friends.status = 'accepted'::text))))));
CREATE POLICY "Users can view own clothes" ON public.clothes FOR SELECT USING ((auth.uid() = owner_id));
CREATE POLICY "Users can view own friendships" ON public.friends FOR SELECT USING (((auth.uid() IS NOT NULL) AND ((auth.uid() = requester_id) OR (auth.uid() = receiver_id))));
CREATE POLICY "Users can view friends' collections" ON public.outfit_collections FOR SELECT USING ((((visibility)::text = 'friends'::text) AND (user_id IN ( SELECT
        CASE
            WHEN (friends.requester_id = auth.uid()) THEN friends.receiver_id
            WHEN (friends.receiver_id = auth.uid()) THEN friends.requester_id
            ELSE NULL::uuid
        END AS "case"
   FROM friends
  WHERE ((friends.status = 'accepted'::text) AND ((friends.requester_id = auth.uid()) OR (friends.receiver_id = auth.uid())))))));
CREATE POLICY "Users can view public collections" ON public.outfit_collections FOR SELECT USING (((visibility)::text = 'public'::text));
CREATE POLICY "Users can view their own collections" ON public.outfit_collections FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own outfit history" ON public.outfit_history FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY "Authenticated users can search users" ON public.users FOR SELECT USING (((auth.uid() IS NOT NULL) AND (removed_at IS NULL)));
CREATE POLICY "Friends can view each other" ON public.users FOR SELECT USING (((auth.uid() IS NOT NULL) AND (removed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM friends
  WHERE ((friends.status = 'accepted'::text) AND (((friends.requester_id = auth.uid()) AND (friends.receiver_id = friends.id)) OR ((friends.requester_id = friends.id) AND (friends.receiver_id = auth.uid()))))))));
CREATE POLICY "Users can search other users" ON public.users FOR SELECT USING (((auth.uid() IS NOT NULL) AND (removed_at IS NULL)));
CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (((auth.uid() IS NOT NULL) AND (auth.uid() = id)));
CREATE OR REPLACE FUNCTION storage.allow_any_operation(expected_operations text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$function$
;
CREATE OR REPLACE FUNCTION storage.allow_only_operation(expected_operation text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$function$
;
