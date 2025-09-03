UPDATE page_summaries 
SET summary_md = SUBSTRING(summary_md FROM POSITION('# ملخص المحتوى التعليمي' IN summary_md)),
    updated_at = now()
WHERE book_id = 'chem12-1-3' 
AND page_number BETWEEN 90 AND 178 
AND summary_md LIKE '%🔍 **MANDATORY PRE-FLIGHT CHECK%';