-- Add new columns to track RAG metrics more precisely
ALTER TABLE public.page_summaries 
ADD COLUMN rag_pages_found integer DEFAULT 0,
ADD COLUMN rag_pages_sent_list jsonb DEFAULT '[]'::jsonb,
ADD COLUMN rag_context_chars integer DEFAULT 0;