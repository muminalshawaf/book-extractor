-- Add confidence columns and triggers to page_summaries
-- 1) Columns
ALTER TABLE public.page_summaries
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric,
  ADD COLUMN IF NOT EXISTS confidence_meta jsonb;

-- 2) Validation trigger function (0-1 range for numeric confidences)
CREATE OR REPLACE FUNCTION public.validate_page_summaries_confidence()
RETURNS trigger AS $$
BEGIN
  IF NEW.confidence IS NOT NULL AND (NEW.confidence < 0 OR NEW.confidence > 1) THEN
    RAISE EXCEPTION 'confidence must be between 0 and 1 inclusive';
  END IF;
  IF NEW.ocr_confidence IS NOT NULL AND (NEW.ocr_confidence < 0 OR NEW.ocr_confidence > 1) THEN
    RAISE EXCEPTION 'ocr_confidence must be between 0 and 1 inclusive';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Attach validation trigger
DROP TRIGGER IF EXISTS trg_validate_page_summaries_confidence ON public.page_summaries;
CREATE TRIGGER trg_validate_page_summaries_confidence
BEFORE INSERT OR UPDATE ON public.page_summaries
FOR EACH ROW
EXECUTE FUNCTION public.validate_page_summaries_confidence();

-- 4) Ensure updated_at auto-updates on changes using existing set_updated_at()
DROP TRIGGER IF EXISTS trg_set_updated_at_page_summaries ON public.page_summaries;
CREATE TRIGGER trg_set_updated_at_page_summaries
BEFORE UPDATE ON public.page_summaries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
