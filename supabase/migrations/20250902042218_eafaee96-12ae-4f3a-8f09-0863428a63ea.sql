
-- Add columns to persist structured OCR data and validation state
ALTER TABLE public.page_summaries
  ADD COLUMN IF NOT EXISTS ocr_json jsonb,
  ADD COLUMN IF NOT EXISTS validation_meta jsonb,
  ADD COLUMN IF NOT EXISTS strict_validated boolean DEFAULT false;
