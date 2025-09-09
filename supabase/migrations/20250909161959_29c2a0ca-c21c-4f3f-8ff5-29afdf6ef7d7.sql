-- Add column to track RAG context pages sent to AI
ALTER TABLE public.page_summaries 
ADD COLUMN rag_pages_sent INTEGER DEFAULT 0;