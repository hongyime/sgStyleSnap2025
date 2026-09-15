-- Original live function definition, metadata only, checked 15 September 2026.
CREATE OR REPLACE FUNCTION public.add_catalog_item_to_closet(user_id_param uuid, catalog_item_id_param uuid, privacy_param character varying DEFAULT 'friends'::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_item_id UUID;
  catalog_item RECORD;
  user_item_count INTEGER;
BEGIN
  -- Check user's upload quota (50 user-uploaded items max)
  -- Catalog additions are unlimited
  SELECT COUNT(*) INTO user_item_count
  FROM clothes
  WHERE owner_id = user_id_param
    AND removed_at IS NULL
    AND catalog_item_id IS NULL; -- Only count user uploads
  -- Note: No quota check here since catalog additions are unlimited
  -- Users can add unlimited items from catalog
  -- Check if catalog item exists
  SELECT * INTO catalog_item
  FROM catalog_items
  WHERE id = catalog_item_id_param
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item not found or inactive';
  END IF;
  -- Check if user already has this item
  IF EXISTS (
    SELECT 1 FROM clothes
    WHERE owner_id = user_id_param
      AND catalog_item_id = catalog_item_id_param
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Item already in closet';
  END IF;
  -- Create new clothing item from catalog
  INSERT INTO clothes (
    owner_id,
    name,
    category,
    image_url,
    thumbnail_url,
    style_tags,
    privacy,
    catalog_item_id
  ) VALUES (
    user_id_param,
    catalog_item.name,
    catalog_item.category,
    catalog_item.image_url,
    catalog_item.thumbnail_url,
    catalog_item.style,
    privacy_param,
    catalog_item_id_param
  )
  RETURNING id INTO new_item_id;
  RETURN new_item_id;
END;
$function$
;
