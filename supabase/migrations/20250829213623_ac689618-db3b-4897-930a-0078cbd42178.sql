-- Fix RLS policies to allow the save-page-summary function to work
-- while maintaining SEO-friendly public read access

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "No public insert on page summaries" ON page_summaries;
DROP POLICY IF EXISTS "No public update on page summaries" ON page_summaries;
DROP POLICY IF EXISTS "No public delete on page summaries" ON page_summaries;

-- Allow service role (edge functions) to insert and update page summaries
CREATE POLICY "Service role can manage page summaries"
ON page_summaries
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Keep public read access for SEO
-- (The existing "Anonymous users can read page summaries for SEO" policy remains)