-- Add SEO and content structure fields to page_summaries table
ALTER TABLE public.page_summaries 
ADD COLUMN title TEXT,
ADD COLUMN slug TEXT,
ADD COLUMN unit_number INTEGER,
ADD COLUMN chapter_number INTEGER, 
ADD COLUMN lesson_number INTEGER,
ADD COLUMN lesson_title TEXT,
ADD COLUMN arabic_keywords TEXT[],
ADD COLUMN english_keywords TEXT[],
ADD COLUMN meta_description TEXT,
ADD COLUMN content_type TEXT CHECK (content_type IN ('lesson', 'exercise', 'review', 'introduction')),
ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
ADD COLUMN estimated_read_time INTEGER; -- in minutes

-- Create index for better SEO URL lookups
CREATE INDEX idx_page_summaries_slug ON public.page_summaries(slug);
CREATE INDEX idx_page_summaries_book_unit_chapter ON public.page_summaries(book_id, unit_number, chapter_number);

-- Add trigger to auto-generate slug from title if not provided
CREATE OR REPLACE FUNCTION public.generate_slug_from_title()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.title IS NOT NULL THEN
    -- Simple slug generation: replace spaces with hyphens, remove special chars
    NEW.slug := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9\u0600-\u06FF\s-]', '', 'g'));
    NEW.slug := regexp_replace(NEW.slug, '\s+', '-', 'g');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_slug_trigger
  BEFORE INSERT OR UPDATE ON public.page_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_slug_from_title();