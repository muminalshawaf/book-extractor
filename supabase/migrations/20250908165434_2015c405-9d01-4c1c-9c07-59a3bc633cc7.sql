-- Create the books table
CREATE TABLE public.books (
  id TEXT PRIMARY KEY, -- book_id like "chemistry12-1", "physics12-2-3"
  title TEXT NOT NULL,
  subject TEXT NOT NULL, -- "Chemistry", "Physics", "Mathematics"
  grade INTEGER NOT NULL CHECK (grade >= 1 AND grade <= 12), -- الصف (1-12)
  semester_range TEXT NOT NULL, -- "1", "2", or "1-2" for full year
  slug TEXT UNIQUE, -- auto-generated from title
  description TEXT,
  cover_image_url TEXT,
  base_page_url TEXT, -- Base URL pattern for pages
  total_pages INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Create policies for books table
CREATE POLICY "Anyone can read books" 
ON public.books 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage books" 
ON public.books 
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Create trigger for automatic slug generation
CREATE TRIGGER books_generate_slug_trigger
BEFORE INSERT OR UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.generate_slug_from_title();

-- Create trigger for automatic updated_at
CREATE TRIGGER books_set_updated_at
BEFORE UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Backfill books table with existing book_ids from page_summaries
INSERT INTO public.books (id, title, subject, grade, semester_range)
SELECT DISTINCT 
  book_id,
  -- Generate title from components
  CASE 
    WHEN book_id LIKE 'chemistry%' THEN 
      'كتاب الكيمياء - الصف ' || 
      COALESCE(
        CAST(SUBSTRING(book_id FROM '(\d+)') AS TEXT),
        '12'
      ) || 
      ' - الفصل ' || 
      COALESCE(
        CASE 
          WHEN book_id ~ '-\d+-\d+$' THEN 
            SUBSTRING(book_id FROM '-\d+-(\d+)$')
          WHEN book_id ~ '-\d+$' THEN 
            SUBSTRING(book_id FROM '-(\d+)$')
          ELSE '1'
        END,
        '1'
      )
    WHEN book_id LIKE 'physics%' THEN 
      'كتاب الفيزياء - الصف ' || 
      COALESCE(
        CAST(SUBSTRING(book_id FROM '(\d+)') AS TEXT),
        '12'
      ) || 
      ' - الفصل ' || 
      COALESCE(
        CASE 
          WHEN book_id ~ '-\d+-\d+$' THEN 
            SUBSTRING(book_id FROM '-\d+-(\d+)$')
          WHEN book_id ~ '-\d+$' THEN 
            SUBSTRING(book_id FROM '-(\d+)$')
          ELSE '1'
        END,
        '1'
      )
    WHEN book_id LIKE 'math%' THEN 
      'كتاب الرياضيات - الصف ' || 
      COALESCE(
        CAST(SUBSTRING(book_id FROM '(\d+)') AS TEXT),
        '12'
      ) || 
      ' - الفصل ' || 
      COALESCE(
        CASE 
          WHEN book_id ~ '-\d+-\d+$' THEN 
            SUBSTRING(book_id FROM '-\d+-(\d+)$')
          WHEN book_id ~ '-\d+$' THEN 
            SUBSTRING(book_id FROM '-(\d+)$')
          ELSE '1'
        END,
        '1'
      )
    ELSE book_id
  END as title,
  -- Extract subject from book_id (before the number)
  CASE 
    WHEN book_id LIKE 'chemistry%' THEN 'Chemistry'
    WHEN book_id LIKE 'physics%' THEN 'Physics' 
    WHEN book_id LIKE 'mathematics%' THEN 'Mathematics'
    WHEN book_id LIKE 'math%' THEN 'Mathematics'
    ELSE 'Unknown'
  END as subject,
  -- Extract grade from book_id (number after subject) and cast to integer
  COALESCE(
    CAST(SUBSTRING(book_id FROM '(\d+)') AS INTEGER),
    12
  ) as grade,
  -- Extract semester from book_id (after grade)
  COALESCE(
    CASE 
      WHEN book_id ~ '-\d+-\d+$' THEN 
        SUBSTRING(book_id FROM '-\d+-(\d+)$')
      WHEN book_id ~ '-\d+$' THEN 
        SUBSTRING(book_id FROM '-(\d+)$')
      ELSE '1'
    END,
    '1'
  ) as semester_range
FROM public.page_summaries
WHERE book_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Add foreign key constraint from page_summaries to books
ALTER TABLE public.page_summaries 
ADD CONSTRAINT fk_page_summaries_book_id 
FOREIGN KEY (book_id) REFERENCES public.books(id) 
ON DELETE CASCADE;