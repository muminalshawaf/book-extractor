import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  MANDATORY_SECTIONS, 
  TEMPLATE_FORMATS, 
  detectPageType, 
  parseQuestions, 
  convertArabicToEnglishNumber, 
  validateSummaryCompliance, 
  buildSystemPrompt, 
  createEmergencyPrompt 
} from "../_shared/templates.ts";
import { 
  callGeminiAPI, 
  callDeepSeekAPI, 
  callDeepSeekStreamingAPI, 
  handleEmergencyRegeneration 
} from "../_shared/apiClients.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to determine if content is educational
function isContentPage(text: string): boolean {
  const keywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'حل', 'مسألة', 'نظرية', 'خاصية',
    'example', 'definition', 'law', 'equation', 'solution', 'problem', 'theorem', 'property',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps'
  ];
  
  const keywordCount = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  const hasNumberedQuestions = /\d+\.\s/.test(text);
  const hasSubstantialContent = text.length > 300;
  
  return keywordCount >= 2 && hasSubstantialContent;
}

// Helper function to extract question numbers from text
function extractQuestionNumbers(text: string): number[] {
  const matches = text.match(/(\d+)\.\s/g);
  if (!matches) return [];
  
  return matches.map(match => {
    const num = parseInt(match.replace('.', '').trim());
    return num;
  }).filter(num => num > 0 && num < 100).sort((a, b) => a - b);
}

// Handle CORS preflight requests
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚨 EXTREME STRICT COMPLIANCE STREAMING FUNCTION STARTED 🚨');
    
    let text = '';
    let lang = 'ar';
    let page: number | undefined;
    let title = '';
    let ocrData = null;

    // Handle both GET and POST requests
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const encodedText = url.searchParams.get('text');
      text = encodedText ? atob(encodedText) : '';
      lang = url.searchParams.get('lang') || 'ar';
      const pageParam = url.searchParams.get('page');
      page = pageParam ? parseInt(pageParam) : undefined;
      title = url.searchParams.get('title') || '';
      // Note: ocrData not supported via GET for now
    } else {
      const body = await req.json();
      text = body.text || '';
      lang = body.lang || 'ar';
      page = body.page;
      title = body.title || '';
      ocrData = body.ocrData || null;
    }

    console.log(`Processing text: ${text.length} characters, lang: ${lang}, page: ${page}, title: ${title}`);

    if (!text) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check API keys
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    console.log('Available models:');
    console.log(`- Gemini 2.5 Pro: ${GOOGLE_API_KEY ? 'AVAILABLE (primary for streaming)' : 'UNAVAILABLE'}`);
    console.log(`- DeepSeek Chat: ${DEEPSEEK_API_KEY ? 'AVAILABLE (fallback)' : 'UNAVAILABLE'}`);

    if (!GOOGLE_API_KEY && !DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'No API keys configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Check if this is a table of contents page
    const isTableOfContents = text.toLowerCase().includes('فهرس') || 
                               text.toLowerCase().includes('contents') ||
                               text.toLowerCase().includes('جدول المحتويات');
    
    if (isTableOfContents) {
      console.log('Detected table of contents page, returning simple message');
      const simpleMessage = "### نظرة عامة\nهذه صفحة فهرس المحتويات التي تعرض تنظيم الكتاب وأقسامه الرئيسية.";
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { content: simpleMessage } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders
        }
      });
    }

    // Parse questions and detect page type using shared utilities
    const questions = parseQuestions(text);
    console.log(`Found ${questions.length} questions in OCR text`);
    
    const pageType = detectPageType(text, questions);
    const needsDetailedStructure = isContentPage(text);
    console.log(`📊 Page Analysis: Type=${pageType}, Questions=${questions.length}, DetailedStructure=${needsDetailedStructure}`);

    // Determine subject from title
    let subject = 'Science';
    if (title) {
      const t = String(title).toLowerCase();
      if (t.includes('chemistry') || t.includes('كيمياء')) {
        subject = 'Chemistry';
      } else if (t.includes('physics') || t.includes('فيزياء')) {
        subject = 'Physics';
      } else if (t.includes('رياضيات') || t.includes('mathematics') || t.includes('math')) {
        subject = 'Mathematics';
      } else if (
        t.includes('ذكاء') || t.includes('اصطناعي') || t.includes('الإصطناعي') ||
        t.includes('artificial intelligence') || t.includes('artificial-intelligence')
      ) {
        subject = 'Artificial Intelligence';
      }
    }

    // Extract page context if available from OCR data
    let contextPrompt = ''
    if (ocrData && ocrData.pageContext) {
      const ctx = ocrData.pageContext
      contextPrompt = `
**السياق من تحليل OCR:**
- عنوان الصفحة: ${ctx.page_title || 'غير محدد'}
- نوع الصفحة: ${ctx.page_type || 'غير محدد'}
- المواضيع الرئيسية: ${ctx.main_topics ? ctx.main_topics.join('، ') : 'غير محددة'}
- العناوين الموجودة: ${ctx.headers ? ctx.headers.join('، ') : 'غير محددة'}
- يحتوي على أسئلة: ${ctx.has_questions ? 'نعم' : 'لا'}
- يحتوي على صيغ: ${ctx.has_formulas ? 'نعم' : 'لا'}  
- يحتوي على أمثلة: ${ctx.has_examples ? 'نعم' : 'لا'}
- يحتوي على عناصر بصرية: ${ctx.has_visual_elements ? 'نعم' : 'لا'}

استخدم هذا السياق لفهم محتوى الصفحة بشكل أفضل وتقديم ملخصات دقيقة ومناسبة للسياق.
`
      console.log('OCR Context available:', ctx.page_type, 'Questions:', ctx.has_questions, 'Formulas:', ctx.has_formulas, 'Visuals:', ctx.has_visual_elements)
    }
    
    // Check for visual elements to include in summary
    let visualPromptAddition = '';
    if (ocrData && ocrData.rawStructuredData && ocrData.rawStructuredData.visual_elements) {
      const visuals = ocrData.rawStructuredData.visual_elements;
      if (Array.isArray(visuals) && visuals.length > 0) {
        visualPromptAddition = `\n\n**مهم:** تم اكتشاف عناصر بصرية (رسوم بيانية/مخططات/أشكال) في هذه الصفحة. يجب تضمين قسم "السياق البصري / Visual Context" في الملخص لوصف هذه العناصر وأهميتها التعليمية.`;
        console.log('Visual elements found for summarization:', visuals.length);
      }
    }

    // Create optimized prompt for question processing
    const hasMultipleChoice = questions.some(q => q.isMultipleChoice);
    console.log(`Multiple choice detected: ${hasMultipleChoice}`);

    // Build system prompt using shared utility
    const systemPrompt = buildSystemPrompt(subject, hasMultipleChoice, false, pageType);

    // Create unified prompt based on page type (using same structure as main summarize function)
    let userPrompt = '';
    
    if (pageType === 'questions-focused') {
      userPrompt = `# حل الأسئلة المختصة

**FOCUSED QUESTION-SOLVING MODE ACTIVATED**
This page contains primarily questions (${questions.length} detected: ${questions.map(q => q.number).join(', ')}).

**CRITICAL INSTRUCTION: ONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}). Do NOT include questions from other sources.**

**STRICT OUTPUT FORMAT**: Output ONLY the following section and nothing else.

${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}
Answer ONLY the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} that appear on THIS page.

Process ONLY the questions detected on this page (${questions.map(q => q.number).join(', ')}):
OCR TEXT:
${text}`;

    } else if (pageType === 'content-heavy') {
      userPrompt = `# ملخص المحتوى التعليمي المعزز

**CONTENT INTEGRATION MODE**
This page contains substantial educational content.

## ملخص المحتوى التعليمي  
[Summarize in few sentences what's on this page]

${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
Analyze content and extract key concepts:
- **[Arabic term]:** [definition]

${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}
Extract scientific terminology:
- **[Scientific term]:** [explanation]

${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}  
List formulas and equations:
| الصيغة | الوصف | المتغيرات |
|--------|--------|-----------|
| $$formula$$ | description | variables |

${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES}
List examples showing practical applications

${questions.length > 0 ? `${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}\nONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}).\n\nProcess ONLY the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')} found on this page:` : ''}
OCR TEXT:
${text}`;

    } else if (pageType === 'mixed') {
      userPrompt = `# ملخص المحتوى والأسئلة

**STRICT OUTPUT FORMAT**
Use ONLY the following sections in this exact order.

${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
- [استخرج المفاهيم والتعاريف الأساسية]

${MANDATORY_SECTIONS.CONCEPT_EXPLANATIONS}
- [شرح تفصيلي للمفاهيم الأساسية مع الأمثلة والتطبيقات]

${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}
- [سرد المصطلحات مع شرح موجز]

${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}
| الصيغة | الوصف | المتغيرات |
|--------|--------|-----------|
| $$formula$$ | description | variables |

${questions.length > 0 ? `${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}\nONLY answer questions that are explicitly numbered and present on THIS PAGE (${questions.map(q => q.number).join(', ')}).\n\nAnswer the ${questions.length} questions numbered ${questions.map(q => q.number).join(', ')}:` : ''}
OCR TEXT:
${text}`;

    } else {
      userPrompt = `# ملخص الصفحة
## نظرة عامة
هذه صفحة تحتوي على محتوى تعليمي.
OCR TEXT:
${text}`;
    }

    // Try Gemini first for streaming if available (more consistent than DeepSeek streaming)
    let streamingContent = '';
    
    if (GOOGLE_API_KEY) {
      console.log('🧠 Using Gemini 2.5 Pro for streaming summarization...');
      const geminiResponse = await callGeminiAPI(GOOGLE_API_KEY, systemPrompt + "\n\n" + userPrompt, 16000);
      
      if (geminiResponse.success) {
        streamingContent = geminiResponse.content;
        console.log(`✅ Gemini 2.5 Pro succeeded for streaming - Length: ${streamingContent.length}`);
        
        // Validate compliance for Gemini response
        const compliance = validateSummaryCompliance(streamingContent, pageType, questions.length > 0);
        console.log(`📊 GEMINI COMPLIANCE SCORE: ${compliance.score}%`);
        
        // Emergency regeneration if needed
        if (!compliance.isValid && compliance.score < 80) {
          const emergencyPrompt = createEmergencyPrompt(questions, text, pageType);
          const regeneratedSummary = await handleEmergencyRegeneration(
            streamingContent, compliance, pageType, questions, text, systemPrompt, emergencyPrompt,
            'gemini', GOOGLE_API_KEY, validateSummaryCompliance
          );
          
          if (regeneratedSummary !== streamingContent) {
            streamingContent = regeneratedSummary;
            console.log('✅ Emergency regeneration improved Gemini streaming compliance');
          }
        }

        // Enforce questions-only output for questions-focused pages
        if (pageType === 'questions-focused' && streamingContent) {
          try {
            const questionsHeader = MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS;
            const match = streamingContent.match(new RegExp(`${questionsHeader}[\\s\\S]*`));
            if (match) {
              streamingContent = match[0].trim();
            } else {
              streamingContent = streamingContent.replace(/##\s+(?!الأسئلة والحلول الكاملة)[^\n]+\n[\s\S]*?(?=(\n##\s+)|$)/g, '').trim();
            }
            console.log('✂️ Enforced questions-only output for streaming (Gemini)');
          } catch (e) {
            console.warn('Failed to enforce questions-only output for streaming:', e);
          }
        }
      } else {
        console.error('Gemini failed for streaming:', geminiResponse.error);
      }
    }
    
    // Fallback to DeepSeek streaming if Gemini failed or not available
    if (!streamingContent && DEEPSEEK_API_KEY) {
      console.log('🤖 Using DeepSeek Chat streaming as fallback...');
      
      try {
        const response = await callDeepSeekStreamingAPI(DEEPSEEK_API_KEY, systemPrompt, userPrompt, 2000);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('DeepSeek streaming API error:', response.status, errorText);
          return new Response(JSON.stringify({ error: 'DeepSeek streaming API error', details: errorText }), {
            status: response.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Create a readable stream to handle the SSE response
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
              controller.error(new Error('No response body'));
              return;
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = ''; // Track full content for validation

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                      // Before finishing, validate compliance
                      const compliance = validateSummaryCompliance(fullContent, pageType, questions.length > 0);
                      console.log(`📊 DEEPSEEK STREAMING COMPLIANCE SCORE: ${compliance.score}%`);
                      
                      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                      controller.close();
                      return;
                    }
                    
                    try {
                      const parsed = JSON.parse(data);
                      // Track content for validation
                      if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                        fullContent += parsed.choices[0].delta.content;
                      }
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`));
                    } catch (e) {
                      console.error('Error parsing SSE data:', e);
                    }
                  }
                }

                // Send a ping to keep the connection alive
                controller.enqueue(new TextEncoder().encode(': ping\n\n'));
              }
            } catch (error) {
              console.error('Stream processing error:', error);
              controller.error(error);
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('DeepSeek streaming failed:', error);
      }
    }

    // If we have content from Gemini, return it as a stream
    if (streamingContent) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Split content into chunks for streaming effect
          const words = streamingContent.split(' ');
          let currentChunk = '';
          
          const sendChunk = (index: number) => {
            if (index >= words.length) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
            
            currentChunk += (currentChunk ? ' ' : '') + words[index];
            
            // Send chunk every 10 words or at the end
            if ((index + 1) % 10 === 0 || index === words.length - 1) {
              const chunk = {
                delta: { content: currentChunk }
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              currentChunk = '';
            }
            
            // Continue with small delay for streaming effect
            setTimeout(() => sendChunk(index + 1), 50);
          };
          
          sendChunk(0);
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders
        }
      });
    }

    // If all methods failed
    console.error('🚨 All streaming methods failed');
    return new Response(JSON.stringify({ error: 'All streaming methods failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('🚨 Error in EXTREME STRICT COMPLIANCE streaming function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
