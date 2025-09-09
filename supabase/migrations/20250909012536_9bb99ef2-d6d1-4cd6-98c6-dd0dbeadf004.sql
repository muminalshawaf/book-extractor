-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to page_summaries table (768 dimensions for text-embedding-004)
ALTER TABLE public.page_summaries 
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Add metadata columns for tracking embedding generation
ALTER TABLE public.page_summaries 
ADD COLUMN IF NOT EXISTS embedding_model text,
ADD COLUMN IF NOT EXISTS embedding_updated_at timestamp with time zone;

-- Create index for vector similarity search (using cosine distance)
CREATE INDEX IF NOT EXISTS idx_page_summaries_embedding_cosine 
ON public.page_summaries 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create function to match similar pages within a book using RAG
CREATE OR REPLACE FUNCTION public.match_pages_for_book(
  target_book_id text,
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  current_page_number int DEFAULT NULL
)
RETURNS TABLE (
  page_id uuid,
  book_id text,
  page_number int,
  title text,
  ocr_text text,
  summary_md text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF target_book_id IS NULL OR query_embedding IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    ps.id as page_id,
    ps.book_id,
    ps.page_number,
    ps.title,
    ps.ocr_text,
    ps.summary_md,
    (1 - (ps.embedding <=> query_embedding)) as similarity
  FROM public.page_summaries ps
  WHERE 
    ps.book_id = target_book_id
    AND ps.embedding IS NOT NULL
    AND ps.ocr_text IS NOT NULL
    AND (current_page_number IS NULL OR ps.page_number < current_page_number)
    AND (1 - (ps.embedding <=> query_embedding)) > match_threshold
  ORDER BY ps.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.match_pages_for_book TO service_role;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'page_summaries_book_page_unique' 
    AND table_name = 'page_summaries'
  ) THEN
    ALTER TABLE public.page_summaries 
    ADD CONSTRAINT page_summaries_book_page_unique 
    UNIQUE (book_id, page_number);
  END IF;
END $$;