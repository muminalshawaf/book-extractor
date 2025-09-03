-- Fix remaining pages with pre-flight check sections
UPDATE page_summaries 
SET summary_md = SUBSTRING(summary_md FROM POSITION('# ' IN summary_md))
WHERE book_id = 'chem12-1-3' 
  AND page_number IN (159, 173) 
  AND summary_md LIKE '%PRE-FLIGHT CHECK%';