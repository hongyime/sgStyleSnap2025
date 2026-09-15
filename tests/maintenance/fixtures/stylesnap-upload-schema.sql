-- Synthetic upload fixture with live source columns, constraints and trigger definitions.
-- Metadata checked 15 September 2026; contains no application records.
DO $$ DECLARE p record; BEGIN FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('clothes','catalog_items') LOOP EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP; END $$;
ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
ALTER TABLE public.catalog_items ALTER COLUMN id TYPE uuid;
ALTER TABLE public.catalog_items ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.catalog_items ALTER COLUMN id SET DEFAULT extensions.uuid_generate_v4();
ALTER TABLE public.catalog_items ADD COLUMN name character varying(255);
ALTER TABLE public.catalog_items ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.catalog_items ADD COLUMN category character varying(50);
ALTER TABLE public.catalog_items ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.catalog_items ALTER COLUMN image_url TYPE text;
ALTER TABLE public.catalog_items ALTER COLUMN image_url SET NOT NULL;
ALTER TABLE public.catalog_items ALTER COLUMN thumbnail_url TYPE text;
ALTER TABLE public.catalog_items ALTER COLUMN thumbnail_url SET NOT NULL;
ALTER TABLE public.catalog_items ADD COLUMN tags text[];
ALTER TABLE public.catalog_items ADD COLUMN brand character varying(100);
ALTER TABLE public.catalog_items ADD COLUMN color character varying(50);
ALTER TABLE public.catalog_items ADD COLUMN season character varying(20);
ALTER TABLE public.catalog_items ADD COLUMN style text[];
ALTER TABLE public.catalog_items ADD COLUMN description text;
ALTER TABLE public.catalog_items ALTER COLUMN is_active TYPE boolean;
ALTER TABLE public.catalog_items ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE public.catalog_items ADD COLUMN created_at timestamp with time zone;
ALTER TABLE public.catalog_items ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.catalog_items ADD COLUMN updated_at timestamp with time zone;
ALTER TABLE public.catalog_items ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.catalog_items ADD COLUMN search_vector tsvector;
ALTER TABLE public.catalog_items ADD COLUMN primary_color character varying(50);
ALTER TABLE public.catalog_items ADD COLUMN secondary_colors character varying(50)[];
ALTER TABLE public.catalog_items ADD COLUMN clothing_type character varying(50);
ALTER TABLE public.catalog_items ADD COLUMN size character varying(20);
ALTER TABLE public.catalog_items ADD COLUMN cloudinary_public_id text;
ALTER TABLE public.catalog_items ALTER COLUMN privacy TYPE character varying(20);
ALTER TABLE public.catalog_items ALTER COLUMN privacy SET DEFAULT 'public'::character varying;
ALTER TABLE public.clothes ALTER COLUMN id TYPE uuid;
ALTER TABLE public.clothes ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.clothes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.clothes ALTER COLUMN owner_id TYPE uuid;
ALTER TABLE public.clothes ADD COLUMN name character varying(255);
ALTER TABLE public.clothes ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.clothes ADD COLUMN category character varying(50);
ALTER TABLE public.clothes ALTER COLUMN image_url TYPE text;
ALTER TABLE public.clothes ALTER COLUMN image_url SET NOT NULL;
ALTER TABLE public.clothes ALTER COLUMN thumbnail_url TYPE text;
ALTER TABLE public.clothes ADD COLUMN style_tags text[];
ALTER TABLE public.clothes ALTER COLUMN privacy TYPE character varying(20);
ALTER TABLE public.clothes ALTER COLUMN privacy SET DEFAULT 'friends'::character varying;
ALTER TABLE public.clothes ADD COLUMN size character varying(20);
ALTER TABLE public.clothes ADD COLUMN brand character varying(100);
ALTER TABLE public.clothes ADD COLUMN is_favorite boolean;
ALTER TABLE public.clothes ALTER COLUMN is_favorite SET DEFAULT false;
ALTER TABLE public.clothes ALTER COLUMN removed_at TYPE timestamp with time zone;
ALTER TABLE public.clothes ADD COLUMN created_at timestamp with time zone;
ALTER TABLE public.clothes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.clothes ADD COLUMN updated_at timestamp with time zone;
ALTER TABLE public.clothes ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.clothes ADD COLUMN catalog_item_id uuid;
ALTER TABLE public.clothes ADD COLUMN primary_color character varying(50);
ALTER TABLE public.clothes ADD COLUMN secondary_colors character varying(50)[];
ALTER TABLE public.clothes ADD COLUMN likes_count integer;
ALTER TABLE public.clothes ALTER COLUMN likes_count SET DEFAULT 0;
ALTER TABLE public.clothes ADD COLUMN clothing_type character varying(50);
ALTER TABLE public.clothes ADD CONSTRAINT check_primary_color CHECK (((primary_color IS NULL) OR ((primary_color)::text = ANY ((ARRAY['black'::character varying, 'white'::character varying, 'gray'::character varying, 'beige'::character varying, 'brown'::character varying, 'red'::character varying, 'blue'::character varying, 'yellow'::character varying, 'green'::character varying, 'orange'::character varying, 'purple'::character varying, 'pink'::character varying, 'navy'::character varying, 'teal'::character varying, 'maroon'::character varying, 'olive'::character varying, 'gold'::character varying, 'silver'::character varying])::text[]))));
ALTER TABLE public.clothes ADD CONSTRAINT check_secondary_colors CHECK (((secondary_colors IS NULL) OR (array_length(secondary_colors, 1) IS NULL) OR (array_length(secondary_colors, 1) <= 3)));
ALTER TABLE public.clothes ADD CONSTRAINT clothes_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id);
ALTER TABLE public.clothes ADD CONSTRAINT clothes_category_check CHECK (((category)::text = ANY ((ARRAY['top'::character varying, 'bottom'::character varying, 'outerwear'::character varying, 'shoes'::character varying, 'accessory'::character varying, 'blazer'::character varying, 'blouse'::character varying, 'body'::character varying, 'dress'::character varying, 'hat'::character varying, 'hoodie'::character varying, 'longsleeve'::character varying, 'not-sure'::character varying, 'other'::character varying, 'pants'::character varying, 'polo'::character varying, 'shirt'::character varying, 'shorts'::character varying, 'skip'::character varying, 'skirt'::character varying, 't-shirt'::character varying, 'undershirt'::character varying])::text[])));
ALTER TABLE public.clothes ADD CONSTRAINT clothes_clothing_type_check CHECK (((clothing_type)::text = ANY ((ARRAY['Blazer'::character varying, 'Blouse'::character varying, 'Body'::character varying, 'Dress'::character varying, 'Hat'::character varying, 'Hoodie'::character varying, 'Longsleeve'::character varying, 'Not sure'::character varying, 'Other'::character varying, 'Outwear'::character varying, 'Pants'::character varying, 'Polo'::character varying, 'Shirt'::character varying, 'Shoes'::character varying, 'Shorts'::character varying, 'Skip'::character varying, 'Skirt'::character varying, 'T-Shirt'::character varying, 'Top'::character varying, 'Undershirt'::character varying])::text[])));
ALTER TABLE public.clothes ADD CONSTRAINT clothes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.clothes ADD CONSTRAINT clothes_privacy_check CHECK (((privacy)::text = ANY ((ARRAY['private'::character varying, 'friends'::character varying, 'public'::character varying])::text[])));
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_category_check CHECK (((category)::text = ANY ((ARRAY['top'::character varying, 'bottom'::character varying, 'outerwear'::character varying, 'shoes'::character varying, 'accessory'::character varying, 'blazer'::character varying, 'blouse'::character varying, 'body'::character varying, 'dress'::character varying, 'hat'::character varying, 'hoodie'::character varying, 'longsleeve'::character varying, 'not-sure'::character varying, 'other'::character varying, 'pants'::character varying, 'polo'::character varying, 'shirt'::character varying, 'shorts'::character varying, 'skip'::character varying, 'skirt'::character varying, 't-shirt'::character varying, 'undershirt'::character varying])::text[])));
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_clothing_type_check CHECK (((clothing_type)::text = ANY ((ARRAY['Blazer'::character varying, 'Blouse'::character varying, 'Body'::character varying, 'Dress'::character varying, 'Hat'::character varying, 'Hoodie'::character varying, 'Longsleeve'::character varying, 'Not sure'::character varying, 'Other'::character varying, 'Outwear'::character varying, 'Pants'::character varying, 'Polo'::character varying, 'Shirt'::character varying, 'Shoes'::character varying, 'Shorts'::character varying, 'Skip'::character varying, 'Skirt'::character varying, 'T-Shirt'::character varying, 'Top'::character varying, 'Undershirt'::character varying])::text[])));
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_image_url_key UNIQUE (image_url);
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_privacy_check CHECK (((privacy)::text = ANY ((ARRAY['public'::character varying, 'friends'::character varying, 'private'::character varying])::text[])));
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_season_check CHECK (((season)::text = ANY ((ARRAY['spring'::character varying, 'summer'::character varying, 'fall'::character varying, 'winter'::character varying, 'all-season'::character varying])::text[])));
ALTER TABLE public.catalog_items ADD CONSTRAINT check_catalog_primary_color CHECK (((primary_color IS NULL) OR ((primary_color)::text = ANY ((ARRAY['black'::character varying, 'white'::character varying, 'gray'::character varying, 'beige'::character varying, 'brown'::character varying, 'red'::character varying, 'blue'::character varying, 'yellow'::character varying, 'green'::character varying, 'orange'::character varying, 'purple'::character varying, 'pink'::character varying, 'navy'::character varying, 'teal'::character varying, 'maroon'::character varying, 'olive'::character varying, 'gold'::character varying, 'silver'::character varying])::text[]))));
ALTER TABLE public.catalog_items ADD CONSTRAINT check_catalog_secondary_colors CHECK (((secondary_colors IS NULL) OR (array_length(secondary_colors, 1) IS NULL) OR (array_length(secondary_colors, 1) <= 3)));
CREATE OR REPLACE FUNCTION public.check_item_quota(user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
    SELECT COUNT(*)::INTEGER FROM clothes
    WHERE owner_id = user_id
      AND removed_at IS NULL
      AND catalog_item_id IS NULL; -- Only count user uploads, not catalog additions
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_item_quota()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    current_count INTEGER;
BEGIN
    -- Only enforce quota for user uploads (not catalog additions)
    IF NEW.catalog_item_id IS NULL THEN
        -- Check current item count
        SELECT check_item_quota(NEW.owner_id) INTO current_count;

        -- Enforce soft cap (50 items)
        IF current_count >= 50 THEN
            RAISE EXCEPTION 'Item upload quota exceeded. You can upload up to 50 items. Please delete some items to upload new ones.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.auto_contribute_to_catalog()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only auto-contribute if:
  -- 1. This is a new item (INSERT)
  -- 2. It's not already linked to a catalog item (catalog_item_id IS NULL)
  -- 3. It has valid image URLs
  IF (TG_OP = 'INSERT' AND
      NEW.catalog_item_id IS NULL AND
      NEW.image_url IS NOT NULL AND
      NEW.thumbnail_url IS NOT NULL) THEN

    -- Check if this exact image already exists in catalog
    -- (prevents duplicate catalog entries for same image)
    IF NOT EXISTS (
      SELECT 1 FROM catalog_items
      WHERE image_url = NEW.image_url
    ) THEN
      -- Insert into catalog (without owner_id for anonymity)
      INSERT INTO catalog_items (
        name,
        category,
        image_url,
        thumbnail_url,
        tags,
        brand,
        color,
        season,
        style,
        privacy,
        is_active
      ) VALUES (
        NEW.name,
        NEW.category,
        NEW.image_url,
        NEW.thumbnail_url,
        NEW.style_tags,
        NEW.brand,
        NEW.primary_color,
        'all-season', -- Default season
        NEW.style_tags, -- Use style_tags as style array
        'public', -- Make catalog items public by default
        true
      )
      ON CONFLICT (image_url) DO NOTHING; -- Safety: prevent duplicates
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.auto_set_category_from_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If clothing_type is provided but category is not, auto-set category
  IF NEW.clothing_type IS NOT NULL AND NEW.category IS NULL THEN
    NEW.category := get_category_from_clothing_type(NEW.clothing_type);
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_category_from_clothing_type(p_clothing_type character varying)
 RETURNS character varying
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  RETURN CASE p_clothing_type
    WHEN 'Blazer' THEN 'outerwear'
    WHEN 'Blouse' THEN 'top'
    WHEN 'Body' THEN 'top'
    WHEN 'Dress' THEN 'top'
    WHEN 'Hat' THEN 'accessory'
    WHEN 'Hoodie' THEN 'outerwear'
    WHEN 'Longsleeve' THEN 'top'
    WHEN 'Not sure' THEN 'top'
    WHEN 'Other' THEN 'accessory'
    WHEN 'Outwear' THEN 'outerwear'
    WHEN 'Pants' THEN 'bottom'
    WHEN 'Polo' THEN 'top'
    WHEN 'Shirt' THEN 'top'
    WHEN 'Shoes' THEN 'shoes'
    WHEN 'Shorts' THEN 'bottom'
    WHEN 'Skip' THEN 'top'
    WHEN 'Skirt' THEN 'bottom'
    WHEN 'T-Shirt' THEN 'top'
    WHEN 'Top' THEN 'top'
    WHEN 'Undershirt' THEN 'top'
    ELSE 'top'
  END;
END;
$function$
;
CREATE TRIGGER auto_contribute_to_catalog_trigger AFTER INSERT ON public.clothes FOR EACH ROW EXECUTE FUNCTION auto_contribute_to_catalog();
CREATE TRIGGER set_category_from_type_trigger BEFORE INSERT OR UPDATE ON public.clothes FOR EACH ROW EXECUTE FUNCTION auto_set_category_from_type();
CREATE TRIGGER trigger_enforce_item_quota BEFORE INSERT ON public.clothes FOR EACH ROW EXECUTE FUNCTION enforce_item_quota();
CREATE POLICY "Anyone can view active public catalog items" ON public.catalog_items FOR SELECT USING (((is_active = true) AND ((privacy)::text = 'public'::text)));
CREATE POLICY "Anyone can view public clothes" ON public.clothes FOR SELECT USING ((((privacy)::text = 'public'::text) AND (removed_at IS NULL)));
CREATE POLICY "Friends can view friends clothes" ON public.clothes FOR SELECT USING ((((privacy)::text = 'friends'::text) AND (removed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM friends
  WHERE ((((friends.requester_id = auth.uid()) AND (friends.receiver_id = clothes.owner_id)) OR ((friends.requester_id = clothes.owner_id) AND (friends.receiver_id = auth.uid()))) AND (friends.status = 'accepted'::text))))));
CREATE POLICY "Users can view own clothes" ON public.clothes FOR SELECT USING ((auth.uid() = owner_id));
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
CREATE POLICY "Users can insert own clothes" ON public.clothes FOR INSERT WITH CHECK (auth.uid()=owner_id);
CREATE POLICY "Users can update own clothes" ON public.clothes FOR UPDATE USING (auth.uid()=owner_id);
CREATE POLICY "Users can delete own clothes" ON public.clothes FOR DELETE USING (auth.uid()=owner_id);
