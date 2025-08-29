-- Allow anonymous read access to page_summaries for SEO indexing
DROP POLICY IF EXISTS "Authenticated users can read page summaries" ON public.page_summaries;

CREATE POLICY "Anonymous users can read page summaries for SEO" 
ON public.page_summaries 
FOR SELECT 
USING (true);

-- Keep existing restrictive policies for write operations
-- The "No public insert/update/delete" policies already exist and will remain