-- Set stable search_path for functions to satisfy linter
ALTER FUNCTION public.validate_page_summaries_confidence() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;