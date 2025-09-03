-- Remove all remaining pre-flight check content from pages 159 and 173
UPDATE page_summaries 
SET summary_md = REGEXP_REPLACE(
  summary_md, 
  '.*?MANDATORY PRE-FLIGHT CHECK.*?(?=# )', 
  '', 
  'gs'
)
WHERE book_id = 'chem12-1-3' 
  AND page_number IN (159, 173);