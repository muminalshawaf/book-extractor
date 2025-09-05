
-- Add a JSONB column to store structured summary alongside the existing summary_md
ALTER TABLE public.page_summaries
ADD COLUMN IF NOT EXISTS summary_json jsonb;
