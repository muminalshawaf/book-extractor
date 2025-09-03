UPDATE page_summaries 
SET summary_md = TRIM(LEADING FROM SUBSTRING(summary_md FROM POSITION('# ملخص المحتوى التعليمي' IN summary_md)))
WHERE book_id = 'chem12-1-3' AND page_number = 106;