-- Remove pre-flight check sections by finding the first main heading and keeping everything from there
UPDATE page_summaries 
SET summary_md = SUBSTRING(summary_md FROM POSITION('# ' IN summary_md))
WHERE book_id = 'chem12-1-3' 
  AND page_number = 120 
  AND summary_md LIKE '%PRE-FLIGHT CHECK%';