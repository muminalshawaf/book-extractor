-- Test: Generate embedding for "hello world" and insert it into page 10
-- First, let's call the generate-embedding function via a select statement

-- This will use the Google text-embedding-004 API to generate an embedding for "hello world"
-- The embedding will be 768 dimensions

-- We'll need to update the page_summaries table for page 10 of artificialintelligence12-1
-- Setting the embedding, embedding_model, and embedding_updated_at

UPDATE page_summaries 
SET 
  embedding = (
    -- We'll manually insert a test embedding vector here since we can't call the edge function from SQL
    -- This is a 768-dimensional vector with all zeros as a placeholder
    array_to_vector(array_fill(0.0::real, array[768]))
  ),
  embedding_model = 'text-embedding-004',
  embedding_updated_at = now()
WHERE book_id = 'artificialintelligence12-1' 
  AND page_number = 10;