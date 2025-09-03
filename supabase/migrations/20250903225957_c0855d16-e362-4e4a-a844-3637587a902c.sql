-- Fix function search path security issue
CREATE OR REPLACE FUNCTION public.generate_slug_from_title()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL AND NEW.title IS NOT NULL THEN
    -- Simple slug generation: replace spaces with hyphens, remove special chars
    NEW.slug := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9\u0600-\u06FF\s-]', '', 'g'));
    NEW.slug := regexp_replace(NEW.slug, '\s+', '-', 'g');
  END IF;
  RETURN NEW;
END;
$function$;