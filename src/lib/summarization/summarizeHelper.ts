import { supabase } from "@/integrations/supabase/client";
import { callFunction } from "@/lib/functionsClient";
import { retrieveRAGContext, buildRAGPrompt } from "@/lib/rag/ragUtils";

export interface SummarizeOptions {
  useRAG?: boolean;
  includeOcrData?: boolean;
  force?: boolean;
  strictMode?: boolean;
  maxRetries?: number;
  timeout?: number;
}

export interface SummarizeResult {
  summary: string;
  confidence: number;
  ragPagesUsed: number;
  ragPagesFound: number;
  ragContextChars: number;
  ocrConfidence?: number;
  success: boolean;
  error?: string;
}

export async function centralizeSummarize(
  bookId: string,
  pageNumber: number,
  title: string = "Page",
  options: SummarizeOptions = {}
): Promise<SummarizeResult> {
  const {
    useRAG = false,
    includeOcrData = true,
    force = false,
    strictMode = false,
    maxRetries = 2,
    timeout = 120000
  } = options;

  console.log(`📝 Starting centralized summarization for ${bookId} page ${pageNumber}`, {
    useRAG,
    includeOcrData,
    force,
    strictMode
  });

  // Step 1: Fetch OCR text from database
  const { data: pageData, error: fetchError } = await supabase
    .from('page_summaries')
    .select('ocr_text, summary_md, ocr_confidence')
    .eq('book_id', bookId)
    .eq('page_number', pageNumber)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch page data: ${fetchError.message}`);
  }

  if (!pageData?.ocr_text) {
    throw new Error(`No OCR text found for page ${pageNumber}`);
  }

  // Step 2: Check if summary already exists (unless force)
  if (!force && pageData.summary_md?.trim()) {
    console.log(`📚 Page ${pageNumber}: Using existing summary`);
    return {
      summary: pageData.summary_md,
      confidence: 0.8,
      ragPagesUsed: 0,
      ragPagesFound: 0,
      ragContextChars: 0,
      ocrConfidence: pageData.ocr_confidence || 0.8,
      success: true
    };
  }

  const ocrText = pageData.ocr_text;
  let enhancedText = ocrText;
  let ragPagesFound = 0;
  let ragPagesSent = 0;
  let ragContextChars = 0;
  let ragPagesIncluded: Array<{pageNumber: number; title?: string; similarity: number}> = [];

  // Step 3: RAG Context Retrieval (if enabled)
  if (useRAG) {
    console.log(`🔍 Page ${pageNumber}: Retrieving RAG context...`);
    try {
      const ragContext = await retrieveRAGContext(
        bookId,
        pageNumber,
        ocrText,
        {
          enabled: true,
          maxContextPages: strictMode ? 5 : 3,
          similarityThreshold: strictMode ? 0.3 : 0.4,
          maxContextLength: strictMode ? 10000 : 8000
        }
      );

      ragPagesFound = ragContext.length;

      if (ragContext.length > 0) {
        enhancedText = buildRAGPrompt(ocrText, ocrText, ragContext, {
          enabled: true,
          maxContextLength: strictMode ? 10000 : 8000
        });

        ragPagesSent = ragContext.length;
        ragContextChars = ragContext.reduce((total, ctx) => total + (ctx.content?.length || 0), 0);
        ragPagesIncluded = ragContext.map(ctx => ({
          pageNumber: ctx.pageNumber,
          title: ctx.title || null,
          similarity: ctx.similarity
        }));

        console.log(`✅ Page ${pageNumber}: RAG found ${ragPagesFound} pages, sent ${ragPagesSent} pages (${ragContextChars} chars)`);
      } else {
        console.log(`ℹ️ Page ${pageNumber}: No relevant RAG context found`);
      }
    } catch (ragError) {
      console.log(`⚠️ Page ${pageNumber}: RAG context retrieval failed: ${ragError.message}`);
    }
  }

  // Step 4: Build OCR data context (if enabled)
  let ocrData = null;
  if (includeOcrData) {
    const hasFormulas = /[∫∑∏√∂∇∆λπθΩαβγδεζηκμνξρστφχψω]|[=+\-×÷<>≤≥≠]|\d+\s*[×÷]\s*\d+|[a-zA-Z]\s*=\s*[a-zA-Z0-9]/.test(ocrText);
    const hasQuestions = /\d+\.\s/.test(ocrText) || /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(ocrText);
    const hasExamples = /مثال|example/i.test(ocrText);

    ocrData = {
      pageContext: {
        page_title: title,
        page_type: 'content',
        has_formulas: hasFormulas,
        has_questions: hasQuestions,
        has_examples: hasExamples
      }
    };
  }

  // Step 5: Call summarize function with retries
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 Page ${pageNumber}: Summarization attempt ${attempt}/${maxRetries}`);
      
      const summaryResult = await callFunction('summarize', {
        text: ocrText, // Use original text, not enhanced (RAG handled by edge function)
        lang: 'ar',
        page: pageNumber,
        title: title,
        ocrData: ocrData,
        ragContext: useRAG && ragPagesFound > 0 ? ragPagesIncluded.map(p => ({
          pageNumber: p.pageNumber,
          title: p.title,
          content: '', // Content will be retrieved by summarize function
          similarity: p.similarity
        })) : []
      }, { 
        timeout: strictMode ? timeout * 1.5 : timeout, 
        retries: 1 
      });

      if (!summaryResult?.summary) {
        throw new Error('No summary generated');
      }

      console.log(`✅ Page ${pageNumber}: Summary generated successfully (${summaryResult.summary.length} chars)`);

      // Step 6: Save to database
      await callFunction('save-page-summary', {
        book_id: bookId,
        page_number: pageNumber,
        summary_md: summaryResult.summary,
        confidence: summaryResult.confidence || 0.8,
        rag_pages_sent: ragPagesSent,
        rag_pages_found: ragPagesFound,
        rag_context_chars: ragContextChars,
        rag_metadata: {
          ragEnabled: useRAG,
          ragPagesUsed: ragPagesSent,
          ragPagesIncluded: ragPagesIncluded,
          ragThreshold: strictMode ? 0.3 : 0.4,
          ragMaxPages: strictMode ? 5 : 3
        }
      });

      return {
        summary: summaryResult.summary,
        confidence: summaryResult.confidence || 0.8,
        ragPagesUsed: ragPagesSent,
        ragPagesFound: ragPagesFound,
        ragContextChars: ragContextChars,
        ocrConfidence: pageData.ocr_confidence || 0.8,
        success: true
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Page ${pageNumber}: Attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        console.log(`🔄 Page ${pageNumber}: Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // All attempts failed
  console.error(`💥 Page ${pageNumber}: All summarization attempts failed`);
  return {
    summary: '',
    confidence: 0,
    ragPagesUsed: 0,
    ragPagesFound: 0,
    ragContextChars: 0,
    ocrConfidence: pageData.ocr_confidence || 0.8,
    success: false,
    error: lastError?.message || 'Unknown error'
  };
}