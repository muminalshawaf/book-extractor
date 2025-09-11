import { supabase } from "@/integrations/supabase/client";

export interface RAGContext {
  pageId: string;
  pageNumber: number;
  title?: string;
  content: string;
  summary?: string;
  similarity: number;
}

export interface RAGOptions {
  enabled: boolean;
  maxContextPages: number;
  similarityThreshold: number;
  maxContextLength: number;
}

export const DEFAULT_RAG_OPTIONS: RAGOptions = {
  enabled: false, // Start disabled for safe rollout
  maxContextPages: 5,
  similarityThreshold: 0.3,
  maxContextLength: 4000 // Characters limit for context
};

/**
 * Generate text embedding using Google's text-embedding-004 model
 */
export async function generateTextEmbedding(text: string): Promise<number[]> {
  // Call the embedding generation via edge function for consistency
  try {
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: { text: text.slice(0, 20000) } // Limit input length
    });

    if (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }

    return data.embedding;
  } catch (error) {
    console.error('Error in generateTextEmbedding:', error);
    throw error;
  }
}

/**
 * Retrieve relevant context from previous pages using RAG
 */
export async function retrieveRAGContext(
  bookId: string,
  currentPageNumber: number,
  queryText: string,
  options: Partial<RAGOptions> = {}
): Promise<RAGContext[]> {
  const config = { ...DEFAULT_RAG_OPTIONS, ...options };
  
  if (!config.enabled) {
    return [];
  }

  try {
    // Generate embedding for the query text
    const queryEmbedding = await generateTextEmbedding(queryText);

    // Call the database function to find similar pages
    const { data, error } = await supabase.rpc('match_pages_for_book', {
      target_book_id: bookId,
      query_embedding: `[${queryEmbedding.join(',')}]` as any,
      match_threshold: config.similarityThreshold,
      match_count: config.maxContextPages,
      current_page_number: currentPageNumber
    });

    if (error) {
      console.error('Error retrieving RAG context:', error);
      return []; // Fail gracefully
    }

    // Transform the results
    return (data || []).map((row: any) => ({
      pageId: row.page_id,
      pageNumber: row.page_number,
      title: row.title,
      content: row.ocr_text,
      summary: row.summary_md,
      similarity: row.similarity
    }));

  } catch (error) {
    console.error('Error in retrieveRAGContext:', error);
    return []; // Fail gracefully - don't break processing
  }
}

/**
 * Build RAG-enhanced prompt with context from previous pages
 */
export function buildRAGPrompt(
  originalPrompt: string,
  currentPageText: string,
  ragContext: RAGContext[],
  options: Partial<RAGOptions> = {}
): string {
  const config = { ...DEFAULT_RAG_OPTIONS, ...options };

  if (!config.enabled || ragContext.length === 0) {
    return originalPrompt;
  }

  // Build context section with length limits
  let contextSection = "Context from previous pages in the book:\n---\n";
  let totalLength = contextSection.length;
  
  for (const context of ragContext) {
    const pageContext = `Page ${context.pageNumber}${context.title ? ` (${context.title})` : ''}:\n${context.content}\n\n`;
    
    if (totalLength + pageContext.length > config.maxContextLength) {
      // Truncate to fit within limits
      const remainingLength = config.maxContextLength - totalLength - 20; // Buffer for truncation message
      if (remainingLength > 100) { // Only add if there's meaningful space
        contextSection += pageContext.slice(0, remainingLength) + "...\n\n";
      }
      break;
    }
    
    contextSection += pageContext;
    totalLength += pageContext.length;
  }
  
  contextSection += "---\n\n";

  // Enhance the original prompt
  const enhancedPrompt = `${contextSection}Full text of the current page:\n---\n${currentPageText}\n---\n\n${originalPrompt}`;

  return enhancedPrompt;
}

/**
 * Check if a page should have its embedding generated
 */
export function shouldGenerateEmbedding(ocrText: string): boolean {
  if (!ocrText || ocrText.trim().length < 50) {
    return false; // Too short to be meaningful
  }

  // Check for non-content pages
  const lowerText = ocrText.toLowerCase();
  const nonContentPatterns = [
    /^(table of contents|contents|index|bibliography|references)$/i,
    /^\s*(page\s+)?\d+\s*$/i, // Just page numbers
    /^(front matter|back matter|title page|copyright)$/i
  ];

  return !nonContentPatterns.some(pattern => pattern.test(lowerText.trim()));
}