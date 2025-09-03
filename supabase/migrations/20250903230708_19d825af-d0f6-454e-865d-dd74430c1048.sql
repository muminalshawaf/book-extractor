-- Remove pre-flight check sections from chemistry book pages - updated approach
UPDATE page_summaries 
SET summary_md = REGEXP_REPLACE(
  summary_md, 
  '^🔍 \*\*MANDATORY PRE-FLIGHT CHECK.*?\n\n', 
  '', 
  'gs'
)
WHERE book_id = 'chem12-1-3' 
  AND page_number BETWEEN 108 AND 178 
  AND summary_md LIKE '%PRE-FLIGHT CHECK%';