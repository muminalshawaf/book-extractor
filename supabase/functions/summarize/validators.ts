interface PreflightChecklist {
  visualReferenceCompliance: boolean;
  visualDataExtraction: boolean;
  mcqMapping: boolean;
  calculationAccuracy: boolean;
  languageConsistency: boolean;
  questionCompleteness: boolean;
  schemaAdherence: boolean;
  citationRequirement: boolean;
  formatCompliance: boolean;
  contentStructure: boolean;
  keywordIntegration: boolean;
  responseLength: boolean;
  overallCompliance: boolean;
}

interface ValidationResult {
  isValid: boolean;
  failedChecks: string[];
  repairPrompt?: string;
}

export function validatePreflight(checklist: PreflightChecklist, questions: any[], summary: string): ValidationResult {
  const failedChecks: string[] = [];

  if (!checklist.visualReferenceCompliance) {
    failedChecks.push("Visual reference compliance failed");
  }
  
  if (!checklist.visualDataExtraction) {
    failedChecks.push("Visual data extraction incomplete");
  }
  
  if (!checklist.mcqMapping) {
    failedChecks.push("MCQ mapping failed");
  }
  
  if (!checklist.calculationAccuracy) {
    failedChecks.push("Calculation accuracy failed");
  }
  
  if (!checklist.languageConsistency) {
    failedChecks.push("Language consistency failed");
  }
  
  if (!checklist.questionCompleteness) {
    failedChecks.push("Question completeness failed");
  }
  
  if (!checklist.schemaAdherence) {
    failedChecks.push("Schema adherence failed");
  }
  
  if (!checklist.citationRequirement) {
    failedChecks.push("Citation requirement failed");
  }
  
  if (!checklist.formatCompliance) {
    failedChecks.push("Format compliance failed");
  }
  
  if (!checklist.contentStructure) {
    failedChecks.push("Content structure failed");
  }
  
  if (!checklist.keywordIntegration) {
    failedChecks.push("Keyword integration failed");
  }
  
  if (!checklist.responseLength) {
    failedChecks.push("Response length failed");
  }
  
  if (!checklist.overallCompliance) {
    failedChecks.push("Overall compliance failed");
  }

  const isValid = failedChecks.length === 0;
  
  let repairPrompt = "";
  if (!isValid) {
    repairPrompt = generateRepairPrompt(failedChecks, questions, summary);
  }

  return {
    isValid,
    failedChecks,
    repairPrompt
  };
}

function generateRepairPrompt(failedChecks: string[], questions: any[], summary: string): string {
  const repairs = [];
  
  if (failedChecks.includes("Visual reference compliance failed")) {
    repairs.push("🚨 CRITICAL FIX REQUIRED: Questions mention visual elements (graph/table/figure). You MUST locate and cite the specific visual element mentioned in each question.");
  }
  
  if (failedChecks.includes("Visual data extraction incomplete")) {
    repairs.push("📊 VISUAL DATA FIX: Extract ALL relevant data from the referenced visual elements and use ONLY that data in your answers.");
  }
  
  if (failedChecks.includes("MCQ mapping failed")) {
    repairs.push("✅ MCQ FIX: Ensure all multiple choice questions have clear answer mapping (A, B, C, D) with explanations.");
  }
  
  if (failedChecks.includes("Question completeness failed")) {
    repairs.push("❓ COMPLETENESS FIX: Answer ALL questions found in the text. Missing questions detected.");
  }
  
  if (failedChecks.includes("Language consistency failed")) {
    repairs.push("🌐 LANGUAGE FIX: Maintain consistent language throughout (Arabic or English as detected).");
  }
  
  if (failedChecks.includes("Citation requirement failed")) {
    repairs.push("📝 CITATION FIX: Begin answers with proper citations like 'من الجدول رقم X:' or 'From Figure X:'");
  }
  
  return `🛠️ **REPAIR REQUIRED - TARGETED FIXES**:

${repairs.join('\n')}

**MANDATORY**: Fix ONLY the above issues while maintaining all other content. Provide the corrected response with proper pre-flight checklist confirmation.

**QUESTIONS TO FIX**: ${JSON.stringify(questions)}

**CURRENT SUMMARY**: ${summary.substring(0, 500)}...

Reprocess and ensure 100% compliance with all mandates.`;
}

export function extractPreflightChecklist(aiResponse: string): PreflightChecklist | null {
  try {
    // Look for the checklist in the AI response
    const checklistMatch = aiResponse.match(/```json\s*({[\s\S]*?"overallCompliance"[\s\S]*?})\s*```/);
    if (!checklistMatch) {
      console.log("No pre-flight checklist found in AI response");
      return null;
    }
    
    const checklistJson = JSON.parse(checklistMatch[1]);
    return checklistJson as PreflightChecklist;
  } catch (error) {
    console.error("Error extracting pre-flight checklist:", error);
    return null;
  }
}

export function validateSummaryStructure(summary: string): boolean {
  try {
    const parsed = JSON.parse(summary);
    
    // Check required fields
    const requiredFields = ['content', 'questions', 'keyTerms', 'mainTopics'];
    for (const field of requiredFields) {
      if (!(field in parsed)) {
        console.log(`Missing required field: ${field}`);
        return false;
      }
    }
    
    // Check questions structure
    if (Array.isArray(parsed.questions)) {
      for (const question of parsed.questions) {
        if (!question.question || !question.answer) {
          console.log("Invalid question structure");
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error validating summary structure:", error);
    return false;
  }
}