// Shared template constants for extreme strict compliance
// Used by both summarize and summarize-stream functions

export const MANDATORY_SECTIONS = {
  CONCEPTS_DEFINITIONS: '## المفاهيم والتعاريف',
  CONCEPT_EXPLANATIONS: '## شرح المفاهيم', 
  SCIENTIFIC_TERMS: '## المصطلحات العلمية',
  FORMULAS_EQUATIONS: '## الصيغ والمعادلات',
  APPLICATIONS_EXAMPLES: '## التطبيقات والأمثلة',
  QUESTIONS_SOLUTIONS: '## الأسئلة والحلول الكاملة'
} as const;

export const TEMPLATE_FORMATS = {
  QUESTION_FORMAT: '**س: [number]- [exact question text]**',
  ANSWER_FORMAT: '**ج:** [complete step-by-step solution]',
  MULTIPLE_CHOICE_FORMAT: `
- **س: [number]- [question text]**
- List answer choices if present: أ) [choice A] ب) [choice B] ج) [choice C] د) [choice D]
- **ج:** [reasoning/calculation] **الإجابة الصحيحة: [letter]**`,
  LATEX_DISPLAY: '$$formula$$',
  LATEX_INLINE: '$formula$'
} as const;

// Page type detection utilities
export function detectPageType(text: string, questions: Array<any>): 'questions-focused' | 'content-heavy' | 'mixed' | 'non-content' {
  const cleanText = text.replace(/[{}",:\[\]]/g, ' '); // Remove JSON artifacts
  const textLength = cleanText.length;
  
  // Content keywords
  const contentKeywords = [
    'مثال', 'تعريف', 'قانون', 'معادلة', 'نظرية', 'خاصية', 'مفهوم', 'شرح',
    'example', 'definition', 'law', 'equation', 'theorem', 'property', 'concept', 'explanation',
    'الأهداف', 'المفاهيم', 'التعاريف', 'الصيغ', 'الخطوات', 'المبادئ',
    'objectives', 'concepts', 'definitions', 'formulas', 'steps', 'principles'
  ];
  
  // Question indicators
  const questionKeywords = [
    'اشرح', 'وضح', 'قارن', 'حدد', 'لماذا', 'كيف', 'ماذا', 'أين', 'متى', 'احسب', 'أوجد',
    'explain', 'describe', 'compare', 'identify', 'why', 'how', 'what', 'where', 'when', 'calculate', 'find'
  ];
  
  const contentKeywordCount = contentKeywords.filter(keyword => 
    cleanText.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  const questionKeywordCount = questionKeywords.filter(keyword => 
    cleanText.toLowerCase().includes(keyword.toLowerCase())
  ).length;
  
  // Count actual numbered questions
  const questionCount = questions.length;
  const questionDensity = questionCount > 0 ? questionCount / (textLength / 1000) : 0;
  
  // Check for explanatory content vs questions
  const hasSubstantialExplanation = contentKeywordCount >= 3;
  const hasHighQuestionDensity = questionDensity > 2; // More than 2 questions per 1000 chars
  const isQuestionDominant = questionCount >= 3 && questionKeywordCount >= questionCount * 0.7;
  
  // Determine page type
  if (questionCount === 0 && contentKeywordCount < 2) {
    return 'non-content';
  } else if (isQuestionDominant && !hasSubstantialExplanation) {
    return 'questions-focused';
  } else if (hasSubstantialExplanation && questionCount <= 2) {
    return 'content-heavy';
  } else {
    return 'mixed';
  }
}

// Enhanced question parsing function
export function parseQuestions(text: string): Array<{number: string, text: string, fullMatch: string, isMultipleChoice: boolean}> {
  const questions = [];
  
  // Check if this is a multiple choice section
  const isMultipleChoiceSection = text.includes('أسئلة الاختيار من متعدد') || 
                                   text.includes('Multiple Choice') ||
                                   text.includes('اختيار من متعدد') ||
                                   /[أاب][.\)]\s*.*[ب][.\)]\s*.*[ج][.\)]\s*.*[د][.\)]/s.test(text);
  
  // First, try to parse section-based questions (more accurate for structured content)
  const sectionMatches = text.match(/--- SECTION: (\d+) ---\s*([\s\S]*?)(?=--- SECTION: \d+ ---|$)/g);
  
  if (sectionMatches && sectionMatches.length > 0) {
    console.log(`Found ${sectionMatches.length} structured sections`);
    
    // Parse the raw OCR data to identify actual exercise sections
    const ocrText = text.includes('"sections":') ? text : '';
    const actualQuestions = [];
    
    if (ocrText) {
      try {
        // Extract sections from OCR data
        const sectionsMatch = ocrText.match(/"sections":\s*\[([\s\S]*?)\]/);
        if (sectionsMatch) {
          const sectionsText = sectionsMatch[1];
          const exerciseMatches = sectionsText.match(/"type":\s*"exercise"[^}]*"title":\s*"([^"]*)"[^}]*"content":\s*"([^"]*(?:\\.[^"]*)*)"/g);
          
          if (exerciseMatches) {
            exerciseMatches.forEach((match) => {
              const titleMatch = match.match(/"title":\s*"([^"]*)"/);
              const contentMatch = match.match(/"content":\s*"([^"]*(?:\\.[^"]*)*)"/);
              
              if (titleMatch && contentMatch) {
                const questionNumber = titleMatch[1];
                let questionText = contentMatch[1]
                  .replace(/\\n/g, ' ')
                  .replace(/\\"/g, '"')
                  .trim();
                
                if (questionText.length > 10) {
                  actualQuestions.push({
                    number: questionNumber,
                    text: questionText,
                    fullMatch: match,
                    isMultipleChoice: isMultipleChoiceSection
                  });
                }
              }
            });
          }
        }
      } catch (error) {
        console.error('Error parsing OCR sections:', error);
      }
    }
    
    // If we found actual exercise questions, use those
    if (actualQuestions.length > 0) {
      console.log(`Found ${actualQuestions.length} actual exercise questions:`, 
        actualQuestions.map(q => q.number).join(', '));
      questions.push(...actualQuestions);
    } else {
      // Fallback to section-based parsing with better filtering
      sectionMatches.forEach((section, index) => {
        const sectionNumber = (index + 1).toString();
        const sectionContent = section.replace(/--- SECTION: \d+ ---\s*/, '').trim();
        
        // Skip if section is too short, contains only visual context, or is clearly not a question
        if (sectionContent.length > 20 && 
            !sectionContent.startsWith('**TABLE**') && 
            !sectionContent.startsWith('**IMAGE**') &&
            !sectionContent.includes('وزارة التعليم') &&
            !sectionContent.match(/^\d+$/) && // Skip page numbers
            !sectionContent.includes('Ministry of Education')) {
          
          // Extract the main question text (before any numbered sub-items)
          let questionText = sectionContent;
          
          // If there are numbered sub-items, get the question text before them
          const subItemMatch = sectionContent.match(/^(.*?)(?=\n\s*\d+\.)/s);
          if (subItemMatch) {
            questionText = subItemMatch[1].trim();
            // Remove "Question Text:" prefix if present
            questionText = questionText.replace(/^Question Text:\s*/, '');
          }
          
          if (questionText.length > 10) {
            questions.push({
              number: sectionNumber,
              text: questionText,
              fullMatch: section,
              isMultipleChoice: isMultipleChoiceSection
            });
          }
        }
      });
    }
    
    console.log(`Parsed ${questions.length} questions from structured sections:`, 
      questions.map(q => q.number).join(', '));
    
    return questions;
  }
  
  // Fallback to legacy parsing for non-structured content
  const questionPatterns = [
    /(\d+)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=\d+\.|$))/gm, // English numbers: 93. question text
    /([٩٠-٩٩]+[٠-٩]*)\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=[٩٠-٩٩]+[٠-٠]*\.|$))/gm, // Arabic numbers: ٩٣. question text
    /(١٠[٠-٦])\.\s*([^٠-٩\d]+(?:[^\.]*?)(?=١٠[٠-٦]\.|$))/gm, // Arabic 100-106: ١٠٠. ١٠١. etc.
  ];
  
  for (const pattern of questionPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    while ((match = pattern.exec(text)) !== null) {
      const questionNumber = match[1].trim();
      const questionText = match[2].trim();
      
      // Skip if this looks like a sub-item within a larger question
      if (questionText.length > 10 && !questionText.includes('Options:')) {
        questions.push({
          number: questionNumber,
          text: questionText,
          fullMatch: match[0],
          isMultipleChoice: isMultipleChoiceSection
        });
      }
    }
  }
  
  // Sort questions by their numeric value
  questions.sort((a, b) => {
    const aNum = convertArabicToEnglishNumber(a.number);
    const bNum = convertArabicToEnglishNumber(b.number);
    return parseInt(aNum) - parseInt(bNum);
  });
  
  // Remove duplicates
  const unique = questions.filter((question, index, self) => 
    index === self.findIndex(q => q.number === question.number)
  );
  
  console.log(`Parsed ${unique.length} questions from OCR text:`, 
    unique.map(q => q.number).join(', '));
  
  return unique;
}

export function convertArabicToEnglishNumber(arabicNum: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  
  let result = arabicNum;
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  return result;
}

// Validation function for extreme strict compliance
export function validateSummaryCompliance(summary: string, pageType: string, hasQuestions: boolean): { isValid: boolean; missing: string[]; score: number } {
  const missing: string[] = [];
  let score = 0;
  const totalSections = hasQuestions ? 6 : 5;
  
  // Check mandatory sections based on page type
  if (pageType === 'content-heavy') {
    // Content-heavy pages: Allow missing sections if not applicable
    if (summary.includes(MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS) || !summary.trim()) score++; 
    else if (summary.length > 100) missing.push('المفاهيم والتعاريف');
    
    if (summary.includes(MANDATORY_SECTIONS.CONCEPT_EXPLANATIONS) || !summary.trim()) score++; 
    else if (summary.length > 100) missing.push('شرح المفاهيم');
    
    if (summary.includes(MANDATORY_SECTIONS.SCIENTIFIC_TERMS) || !summary.trim()) score++; 
    else if (summary.length > 100) missing.push('المصطلحات العلمية');
    
    if (summary.includes(MANDATORY_SECTIONS.FORMULAS_EQUATIONS) || !summary.trim()) score++; 
    else if (summary.length > 100) missing.push('الصيغ والمعادلات');
    
    if (summary.includes(MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES) || !summary.trim()) score++; 
    else if (summary.length > 100) missing.push('التطبيقات والأمثلة');
    
    if (hasQuestions) {
      if (summary.includes(MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS)) {
        score++;
      } else {
        missing.push('الأسئلة والحلول الكاملة');
      }
    }
  } else if (pageType === 'mixed' || pageType === 'questions-focused') {
    // Mixed and question-focused pages: Strict requirements
    if (summary.includes(MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS)) score++; else missing.push('المفاهيم والتعاريف');
    if (summary.includes(MANDATORY_SECTIONS.CONCEPT_EXPLANATIONS)) score++; else missing.push('شرح المفاهيم');
    if (summary.includes(MANDATORY_SECTIONS.SCIENTIFIC_TERMS)) score++; else missing.push('المصطلحات العلمية');
    if (summary.includes(MANDATORY_SECTIONS.FORMULAS_EQUATIONS)) score++; else missing.push('الصيغ والمعادلات');
    if (summary.includes(MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES)) score++; else missing.push('التطبيقات والأمثلة');
    
    if (hasQuestions) {
      if (summary.includes(MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS)) {
        score++;
      } else {
        missing.push('الأسئلة والحلول الكاملة');
      }
    }
  }
  
  const complianceScore = (score / totalSections) * 100;
  return { isValid: missing.length === 0, missing, score: complianceScore };
}

// Build system prompt for extreme strict compliance
export function buildSystemPrompt(subject: string, hasMultipleChoice: boolean): string {
  // Chemistry-only mandates (included only when subject is Chemistry)
  const chemistryMandates = subject === 'Chemistry' ? `
8. QUANTITATIVE ANALYSIS MANDATE (Chemistry-specific): For questions comparing effects (like boiling point elevation, freezing point depression, etc.), you MUST:
   - Calculate molality for each substance
   - Apply van't Hoff factor (i) for ionic compounds
   - Calculate the effective molality (molality × i)
   - Compare numerical results
   - State which is greater and by how much

🧪 ABSOLUTE CHEMISTRY-SPECIFIC TABLE LOOKUP MANDATE:
   - MANDATORY Chemical Name Matching: You MUST match questions about specific acids/compounds with table entries using chemical knowledge
   - MANDATORY Ka/pH Relationship: You MUST always use table Ka values for pH calculations, even if compound names differ slightly
   - MANDATORY Common Acid Identifications:
     * Cyanoethanoic acid (cyanoacetic acid) ≈ Ka ~3.5×10^-3
     * You MUST connect question compounds to closest Ka values in tables
   - ABSOLUTE PROHIBITION: You are FORBIDDEN from claiming "insufficient data" if ANY Ka values or chemical data exist in tables
   - MANDATORY approximation methods: You MUST use Ka = [H+]²/C for weak acid calculations when valid
   - ABSOLUTE REQUIREMENT: Your final numerical answer MUST correspond to one of the multiple choice options

🔢 ABSOLUTE MANDATORY CALCULATION EXECUTION (Chemistry):
   - CRITICAL: If ANY numerical data exists (Ka, concentrations, etc.), you are REQUIRED to attempt calculations
   - You MUST use chemical equilibrium principles even with approximate data matching
   - You MUST apply weak acid/base formulas when Ka values are available
   - You MUST connect table data to question parameters through chemical knowledge
   - FAILURE TO CALCULATE WHEN DATA EXISTS IS STRICTLY FORBIDDEN
` : '';

  return `🚨 ABSOLUTE COMPLIANCE MANDATE 🚨

You are an expert ${subject} professor with ZERO TOLERANCE for format deviations.

⛔ CRITICAL: FOLLOW THIS FORMAT EXACTLY OR RESPONSE WILL BE REJECTED:

🔍 **MANDATORY INTERNAL PRE-FLIGHT CHECK (DO NOT INCLUDE IN YOUR RESPONSE)**:
Before writing your summary, you MUST internally check:
1. Does ANY question reference a graph, chart, figure, table, or visual element (الشكل، الجدول، المخطط)?
2. If YES: Have I thoroughly reviewed the OCR VISUAL CONTEXT section for relevant data?
3. If YES: Am I using specific data points, values, or information from the visual elements in my answers?
4. If visual elements exist but I'm not using them: STOP and re-examine - you CANNOT proceed without using visual data when questions reference it.

⚠️ CRITICAL: This check is for your internal processing only. DO NOT include this checklist in your final response. Your response should ONLY contain the summary content as specified below.

⚠️ CRITICAL: If any question references a graph or table, review the OCR context, specifically the visuals and table section and ensure you use it to answer the questions with high precision. NEVER provide an answer without this critical step.

🚫 ABSOLUTE NO-GREETING OR PERSONA TEXT: Do NOT include greetings, self-references (for example: "بصفتي أستاذك..."), or any meta commentary. Start directly with the required sections.

🚫 ABSOLUTE PROHIBITION: NO extra sections, NO overview paragraphs, NO introductory text. ONLY the mandated sections in exact order.

FORMAT REQUIREMENTS:
# Header
## Sub Header  
### Sub Header
Use tables when necessary
- Question format: ${TEMPLATE_FORMATS.QUESTION_FORMAT}
- Answer format: ${TEMPLATE_FORMATS.ANSWER_FORMAT}
${hasMultipleChoice ? `
- MULTIPLE CHOICE FORMAT (for regular multiple choice):
${TEMPLATE_FORMATS.MULTIPLE_CHOICE_FORMAT}` : ''}
- Use LaTeX for formulas: ${TEMPLATE_FORMATS.LATEX_DISPLAY}
- Use × (NOT \\cdot or \\cdotp) for multiplication
- Bold all section headers with **Header**

CRITICAL QUESTION SOLVING MANDATES - NON-NEGOTIABLE:
1. **SEQUENTIAL ORDER MANDATE**: You MUST solve questions in strict numerical sequence from lowest to highest number. If you see questions 45, 102, 46, you MUST answer them as: 45, then 46, then 102. This is MANDATORY and non-negotiable.
2. **COMPLETE ALL QUESTIONS MANDATE**: You MUST answer every single question found in the text. NO EXCEPTIONS. Be concise on explanatory topics if needed, but NEVER skip questions.
3. **ACCURACY MANDATE**: Double-check all formulas, calculations, and scientific facts. Verify your answers against standard ${subject} principles before providing them.
4. **STEP-BY-STEP MANDATE**: Each question must have a complete, logical solution showing all work and reasoning.
5. **USE ALL AVAILABLE DATA MANDATE**: The OCR text contains ALL necessary information including graphs, tables, and numerical data. Use this information directly - do NOT add disclaimers about missing data or approximations when the data is clearly present in the OCR text.
6. **MATHJAX RENDERING MANDATE - 100% SUCCESS GUARANTEE**:
   - ALWAYS use double dollar signs $$equation$$ for display math (never single $)
   - Use \\text{} for units and text within equations
   - NEVER nest \\text{} commands
   - Use \\frac{numerator}{denominator} for ALL fractions, never /
   - Use \\times for multiplication when needed: $$2 \\times 10^3$$
   - Keep LaTeX simple and clean - avoid complex commands that might break

7. **CRITICAL MANDATE: ON EVERY QUESTION YOU ANSWER**: When you are giving an answer, always look at the calculations and the results and always make the decision based on the precise calculations.
${chemistryMandates}
9. **إلزامية قوية: استخدام بيانات OCR (STRONG OCR MANDATE):**
   - يجب عليك دائماً فحص والاستفادة من بيانات OCR المتوفرة لأي رسوم بيانية أو جداول أو مخططات
   - إذا كانت هناك عناصر بصرية (graphs, charts, tables) في السياق، يجب استخدام البيانات المستخرجة منها
   - لا تتجاهل البيانات الرقمية المتوفرة في العناصر البصرية - استخدمها في الحسابات
   - إذا كان السؤال يشير إلى شكل أو جدول، ابحث عن البيانات المقابلة في معلومات OCR

⚠️ ABSOLUTE COMPLIANCE MANDATE: 100% INSTRUCTION ADHERENCE REQUIRED ⚠️
⛔ NON-COMPLIANCE WILL RESULT IN COMPLETE RESPONSE REJECTION ⛔

🔍 **MANDATORY COMPREHENSIVE VISUAL ELEMENT ANALYSIS - ZERO TOLERANCE FOR SHORTCUTS**:

📊 **MANDATORY GRAPHS & CHARTS ANALYSIS**:
   - You MUST extract ALL data points, axis labels, units, and scales from graphs
   - You MUST identify trends, patterns, and relationships shown in visual data
   - You MUST use graph data as PRIMARY SOURCE for calculations and answers
   - You MUST reference specific graph elements: "From the graph showing..."
   - You MUST extract exact values when available

📋 **MANDATORY TABLE DATA INTEGRATION**:
   - You MUST process ALL table headers, rows, and numerical values
   - You MUST use table data as authoritative source for calculations
   - You MUST cross-reference table entries with question requirements

🧮 **MANDATORY INTEGRATED PROBLEM SOLVING WITH VISUALS**:
   When answering questions, you are ABSOLUTELY REQUIRED to:
   1. **MANDATORY: Identify relevant visuals**: You MUST check if question references graphs, tables, or figures
   2. **MANDATORY: Extract precise data**: You MUST use exact values from visual elements
   3. **MANDATORY: Show integration**: You MUST state "Using data from Table 1 showing..." or similar when appropriate

📐 **VISUAL DATA PRIORITY HIERARCHY**:
   1. Tables with numerical data (highest priority for calculations)
   2. Graphs with data points and scales (for trend analysis and value extraction)
   3. Multiple choice options (for answer validation)
   4. Diagrams and figures (for conceptual understanding)
   5. Text content (for context and theory)

⚡ **ABSOLUTE ANSWER ACCURACY WITH VISUAL VALIDATION**:
   - CRITICAL: If multiple choice options are present, your answer MUST be one of the given choices - NO EXCEPTIONS
   - You MUST cross-check numerical results with graph scales and table values

MANDATORY SECTIONS (only include if content exists on the page):
- ${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
- ${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}
- ${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}  
- ${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}

Skip sections if the page does not contain relevant content for that section.`;
}

// Create emergency regeneration prompt
export function createEmergencyPrompt(questions: Array<any>, enhancedText: string): string {
  return `🚨 EMERGENCY COMPLIANCE MODE - PREVIOUS RESPONSE REJECTED FOR FORMAT VIOLATIONS 🚨

ABSOLUTE MANDATE: Include ALL sections below in EXACT ORDER. NO EXCEPTIONS.

${MANDATORY_SECTIONS.CONCEPTS_DEFINITIONS}
- [Required content here]

${MANDATORY_SECTIONS.CONCEPT_EXPLANATIONS}
- [Required content here]

${MANDATORY_SECTIONS.SCIENTIFIC_TERMS}  
- [Required content here]

${MANDATORY_SECTIONS.FORMULAS_EQUATIONS}
| الصيغة | الوصف | المتغيرات | الربط بالسياق السابق |
|--------|--------|-----------|---------------------|
| $$formula$$ | description | variables | [connection if relevant] |

${MANDATORY_SECTIONS.APPLICATIONS_EXAMPLES}
- [Required content here]

${questions.length > 0 ? `${MANDATORY_SECTIONS.QUESTIONS_SOLUTIONS}
MANDATORY: Answer questions ${questions.map(q => q.number).join(', ')}` : ''}

EMERGENCY DATA:
${enhancedText}`;
}