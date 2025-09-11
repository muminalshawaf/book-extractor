-- Update match_pages_for_book function to include proximity weighting
CREATE OR REPLACE FUNCTION public.match_pages_for_book(
  target_book_id text, 
  query_embedding vector, 
  match_threshold double precision DEFAULT 0.6, -- Increased default threshold
  match_count integer DEFAULT 5, 
  current_page_number integer DEFAULT NULL::integer,
  max_page_distance integer DEFAULT 10 -- New parameter for proximity constraint
)
RETURNS TABLE(
  page_id uuid, 
  book_id text, 
  page_number integer, 
  title text, 
  ocr_text text, 
  summary_md text, 
  similarity double precision,
  proximity_score double precision -- New proximity score
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    (1 - (ps.embedding <=> query_embedding)) as similarity,
    -- Proximity score: closer pages get higher scores (1.0 for same page, decreasing with distance)
    CASE 
      WHEN current_page_number IS NULL THEN 1.0
      ELSE GREATEST(0.0, 1.0 - (CAST(ABS(current_page_number - ps.page_number) AS DOUBLE PRECISION) / CAST(max_page_distance AS DOUBLE PRECISION)))
    END as proximity_score
  FROM public.page_summaries ps
  WHERE 
    ps.book_id = target_book_id
    AND ps.embedding IS NOT NULL
    AND ps.ocr_text IS NOT NULL
    -- Only consider pages before current page
    AND (current_page_number IS NULL OR ps.page_number < current_page_number)
    -- Proximity constraint: only pages within max_page_distance
    AND (current_page_number IS NULL OR ps.page_number >= (current_page_number - max_page_distance))
    -- Similarity threshold
    AND (1 - (ps.embedding <=> query_embedding)) > match_threshold
  -- Order by combined similarity and proximity score
  ORDER BY 
    ((1 - (ps.embedding <=> query_embedding)) * 0.7 + 
     CASE 
       WHEN current_page_number IS NULL THEN 0.3
       ELSE (GREATEST(0.0, 1.0 - (CAST(ABS(current_page_number - ps.page_number) AS DOUBLE PRECISION) / CAST(max_page_distance AS DOUBLE PRECISION))) * 0.3)
     END) DESC
  LIMIT match_count;
END;
$function$;