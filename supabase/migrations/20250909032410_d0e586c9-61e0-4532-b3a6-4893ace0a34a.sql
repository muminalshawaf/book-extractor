-- Generate a test embedding vector for "hello world" and insert it into page 10
-- We'll create a proper 768-dimensional vector using the vector extension

-- First, let's create a sample embedding vector (normally this would come from the Google API)
-- For this test, we'll use a simple pattern to create a 768-dimensional vector

WITH embedding_data AS (
  SELECT '[' || array_to_string(
    ARRAY(
      SELECT (sin(i::float * 0.01) * 0.5 + 0.5)::real
      FROM generate_series(1, 768) AS i
    ), 
    ','
  ) || ']' AS embedding_text
)
UPDATE page_summaries 
SET 
  embedding = embedding_data.embedding_text::vector(768),
  embedding_model = 'text-embedding-004',
  embedding_updated_at = now()
FROM embedding_data
WHERE book_id = 'artificialintelligence12-1' 
  AND page_number = 10;