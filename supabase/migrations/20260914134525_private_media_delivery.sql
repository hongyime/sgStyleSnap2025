-- Prepared access layer only. Reads start disabled; no bucket, media copy,
-- application pointer update, upload permission or delete permission is created.
CREATE TABLE public.stylesnap_media_delivery_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  reads_enabled boolean NOT NULL DEFAULT false,
  manifest_sha text CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  CHECK (NOT reads_enabled OR manifest_sha IS NOT NULL)
);
INSERT INTO public.stylesnap_media_delivery_control(singleton) VALUES (true);
ALTER TABLE public.stylesnap_media_delivery_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylesnap_media_delivery_control FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stylesnap_media_delivery_control TO anon, authenticated;
GRANT SELECT, UPDATE ON public.stylesnap_media_delivery_control TO service_role;
CREATE POLICY "Read media delivery availability"
  ON public.stylesnap_media_delivery_control FOR SELECT TO anon, authenticated USING (true);

-- One verified source-field binding per manifest. Source URLs and old manifests
-- remain available for rollback; clients cannot manufacture or overwrite bindings.
CREATE TABLE public.stylesnap_media_bindings (
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  source_column text NOT NULL,
  source_url text NOT NULL CHECK (length(source_url) BETWEEN 1 AND 4096),
  manifest_sha text NOT NULL CHECK (manifest_sha ~ '^[0-9a-f]{64}$'),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  object_path text NOT NULL,
  content_bytes bigint NOT NULL CHECK (content_bytes BETWEEN 1 AND 50000000),
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
  )),
  PRIMARY KEY (source_table, source_id, source_column, manifest_sha),
  CHECK (object_path = 'sha256/' || substr(content_sha256, 1, 2) || '/' || content_sha256),
  CHECK (
    (source_table IN ('clothes', 'catalog_items') AND source_column IN ('image_url', 'thumbnail_url'))
    OR (source_table = 'users' AND source_column = 'avatar_url')
    OR (source_table = 'outfit_collections' AND source_column = 'cover_image_url')
    OR (source_table = 'outfit_history' AND source_column = 'photo_url')
  )
);
CREATE INDEX stylesnap_media_binding_object_idx ON public.stylesnap_media_bindings(object_path);
ALTER TABLE public.stylesnap_media_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stylesnap_media_bindings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stylesnap_media_bindings TO anon, authenticated;
GRANT SELECT, INSERT ON public.stylesnap_media_bindings TO service_role;

-- These subqueries run with the reader's permissions and the source tables' RLS.
-- A source-field edit immediately invalidates its old binding. A shared content
-- hash grants access only through a source row that this reader can still see.
CREATE POLICY "Read verified media through visible source rows"
  ON public.stylesnap_media_bindings FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stylesnap_media_delivery_control control
      WHERE control.singleton AND control.reads_enabled
        AND control.manifest_sha = stylesnap_media_bindings.manifest_sha
    )
    AND CASE source_table
      WHEN 'clothes' THEN EXISTS (
        SELECT 1 FROM public.clothes source WHERE source.id = source_id
          AND CASE source_column WHEN 'image_url' THEN source.image_url ELSE source.thumbnail_url END = source_url
      )
      WHEN 'catalog_items' THEN EXISTS (
        SELECT 1 FROM public.catalog_items source WHERE source.id = source_id
          AND CASE source_column WHEN 'image_url' THEN source.image_url ELSE source.thumbnail_url END = source_url
      )
      WHEN 'users' THEN EXISTS (
        SELECT 1 FROM public.users source WHERE source.id = source_id AND source.avatar_url = source_url
      )
      WHEN 'outfit_collections' THEN EXISTS (
        SELECT 1 FROM public.outfit_collections source WHERE source.id = source_id AND source.cover_image_url = source_url
      )
      WHEN 'outfit_history' THEN EXISTS (
        SELECT 1 FROM public.outfit_history source WHERE source.id = source_id AND source.photo_url = source_url
      )
      ELSE false
    END
  );

-- Only authenticated object GET/info operations can use this policy. Listing,
-- signing, writes and archive provenance have no new access path.
CREATE POLICY "Download visible StyleSnap media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'stylesnap-media-archive'
    AND storage.allow_any_operation(ARRAY['object.get_authenticated', 'object.get_authenticated_info'])
    AND EXISTS (
      SELECT 1 FROM public.stylesnap_media_bindings binding
      WHERE binding.object_path = storage.objects.name
    )
  );

CREATE FUNCTION public.stylesnap_check_private_delivery_bucket()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF NEW.reads_enabled AND NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'stylesnap-media-archive' AND public = false
  ) THEN
    RAISE EXCEPTION 'private_media_bucket_required';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.stylesnap_check_private_delivery_bucket() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylesnap_check_private_delivery_bucket() TO service_role;
CREATE TRIGGER stylesnap_require_private_delivery_bucket
  BEFORE UPDATE ON public.stylesnap_media_delivery_control
  FOR EACH ROW EXECUTE FUNCTION public.stylesnap_check_private_delivery_bucket();
