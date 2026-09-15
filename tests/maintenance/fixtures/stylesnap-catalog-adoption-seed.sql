-- Synthetic catalog fixture only. Never run against an application database.
RESET ROLE;
    DROP TRIGGER IF EXISTS fail_catalog_binding ON public.stylesnap_media_bindings;
    DROP FUNCTION IF EXISTS public.fail_catalog_binding();
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=false,manifest_sha=NULL;
    TRUNCATE stylesnap_archive.catalog_adoptions,stylesnap_archive.upload_receipts,stylesnap_archive.binding_members,
      stylesnap_archive.binding_publications,stylesnap_archive.binding_versions,public.stylesnap_media_bindings,
      stylesnap_archive.reservations,storage.objects,storage.buckets,public.clothes,public.catalog_items,public.users CASCADE;
    UPDATE stylesnap_archive.control SET writes_enabled=true,manifest_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',checkpoint_sha=repeat('b',64),
      manifest_retained=true,headroom_verified_at=now(),egress_verified_at=now(),other_organization_storage_bytes=0,
      approved_egress_bytes=4000000000,max_database_bytes=450000000,max_storage_bytes=800000000,checkpoint_pool_remaining=0;
    UPDATE stylesnap_archive.upload_control SET uploads_enabled=false,catalog_policy=NULL,catalog_adoptions_enabled=true;
    INSERT INTO stylesnap_archive.binding_publications(plan_sha,manifest_sha,copy_checkpoint_sha,expected_batches,expected_count,complete)
      VALUES(repeat('c',64),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',repeat('b',64),'[]',0,true);
    INSERT INTO storage.buckets VALUES('stylesnap-media-archive',false);
    INSERT INTO storage.objects VALUES('stylesnap-media-archive','sha256/dd/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','{"size":50}');
    INSERT INTO public.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    INSERT INTO public.catalog_items(id,name,category,clothing_type,image_url,thumbnail_url,privacy,is_active,brand,size,primary_color,secondary_colors,style)
      VALUES('00000000-0000-4000-8000-000000000003','Retained jacket','outerwear','Outwear','https://fixture.invalid/image','https://fixture.invalid/thumb',
        'public',true,'Retained brand','M','blue',ARRAY['white'],ARRAY['casual']),
        ('00000000-0000-4000-8000-000000000004','Another jacket','outerwear','Outwear','https://fixture.invalid/second','https://fixture.invalid/thumb2',
        'public',true,'Second brand','L','black',NULL,ARRAY['formal']);
    INSERT INTO public.stylesnap_media_bindings(source_table,source_id,source_column,source_url,manifest_sha,content_sha256,object_path,content_bytes,mime_type)
      SELECT 'catalog_items',id,col,url,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','sha256/dd/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',50,'image/png'
      FROM public.catalog_items CROSS JOIN LATERAL (VALUES('image_url',image_url),('thumbnail_url',thumbnail_url)) AS fields(col,url);
    UPDATE public.stylesnap_media_delivery_control SET reads_enabled=true,manifest_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
