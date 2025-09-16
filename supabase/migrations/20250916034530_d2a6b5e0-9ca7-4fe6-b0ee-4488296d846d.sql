-- Add structured OCR data column to page_summaries table
ALTER TABLE public.page_summaries 
ADD COLUMN ocr_structured JSONB;

-- Add index for better performance when querying structured OCR data
CREATE INDEX idx_page_summaries_ocr_structured 
ON public.page_summaries USING GIN (ocr_structured);

-- Add comment for documentation
COMMENT ON COLUMN public.page_summaries.ocr_structured IS 'Structured OCR data with sections, classifications, and visual elements from enhanced OCR processing';