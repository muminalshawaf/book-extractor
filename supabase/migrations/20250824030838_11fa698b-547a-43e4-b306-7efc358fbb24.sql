-- Remove all summaries and OCR text for Chemistry book (grade 12, semester 1)
DELETE FROM public.page_summaries 
WHERE book_id = 'chem12-1-3';