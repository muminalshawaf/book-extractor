/**
 * Advanced math sanitizer to fix common MathJax rendering issues
 * and ensure proper LaTeX formatting
 */

export interface MathSanitizerOptions {
  fixMultiplication: boolean;
  wrapUnits: boolean;
  normalizeDelimiters: boolean;
  fixChemicalFormulas: boolean;
}

const DEFAULT_OPTIONS: MathSanitizerOptions = {
  fixMultiplication: true,
  wrapUnits: true,
  normalizeDelimiters: true,
  fixChemicalFormulas: true,
};

/**
 * Sanitizes mathematical expressions to ensure proper MathJax rendering
 */
export function sanitizeMath(content: string, options: Partial<MathSanitizerOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = content;

  if (opts.fixMultiplication) {
    sanitized = fixMultiplicationOperators(sanitized);
  }

  if (opts.wrapUnits) {
    sanitized = wrapUnitsInText(sanitized);
  }

  if (opts.normalizeDelimiters) {
    sanitized = normalizeDelimiters(sanitized);
  }

  if (opts.fixChemicalFormulas) {
    sanitized = fixChemicalFormulas(sanitized);
  }

  return sanitized;
}

/**
 * Fix multiplication operator issues like \cdotpatm -> \cdot \text{ atm}
 */
function fixMultiplicationOperators(text: string): string {
  return text
    // Fix \cdot followed immediately by units (no space)
    .replace(/\\cdot([a-zA-Z]{1,10})\b/g, '\\cdot \\text{ $1}')
    // Fix \cdotp variations
    .replace(/\\cdotp/g, '\\cdot')
    // Fix × symbol usage
    .replace(/×/g, '\\times')
    // Fix common unit combinations
    .replace(/\\cdot\s*(atm|Pa|bar|mol|L|K|°C|°F|g|kg|m|cm|mm|s|min|h)\b/g, '\\cdot \\text{ $1}')
    // Fix multiplication without proper spacing
    .replace(/(\d+)\*(\d+)/g, '$1 \\times $2')
    // Fix dot multiplication
    .replace(/(\d+)\.(\d+)\s*(atm|Pa|bar|mol|L|K|°C|°F|g|kg|m|cm|mm|s|min|h)\b/g, '$1.$2 \\text{ $3}');
}

/**
 * Wrap units and text in \text{} for proper rendering
 */
function wrapUnitsInText(text: string): string {
  // Common scientific units that should be wrapped in \text{}
  const units = [
    'atm', 'Pa', 'bar', 'mmHg', 'torr',
    'mol', 'kmol', 'mmol', 'μmol',
    'L', 'mL', 'μL', 'dL',
    'g', 'kg', 'mg', 'μg',
    'm', 'cm', 'mm', 'μm', 'nm',
    'K', '°C', '°F',
    's', 'min', 'h', 'day',
    'M', 'N', 'J', 'cal', 'eV'
  ];

  let result = text;

  // Wrap standalone units
  units.forEach(unit => {
    const regex = new RegExp(`\\b${unit}\\b(?!})`, 'g');
    result = result.replace(regex, `\\text{${unit}}`);
  });

  // Handle compound units like mol/L, g/mL, etc.
  result = result.replace(/(\w+)\/(\w+)(?!\})/g, '\\text{$1/$2}');

  // Handle units with superscripts like m³, cm²
  result = result.replace(/(\w+)([²³⁴⁵⁶⁷⁸⁹])/g, '\\text{$1}^{$2}');

  return result;
}

/**
 * Normalize math delimiters (prefer $$ for display math)
 */
function normalizeDelimiters(text: string): string {
  return text
    // Convert single $ to $$ for display math when appropriate
    .replace(/\$([^$\n]+)\$/g, (match, content) => {
      // Keep inline for simple expressions, use display for complex ones
      if (content.includes('\\frac') || content.includes('\\sum') || content.includes('\\int')) {
        return `$$${content}$$`;
      }
      return match;
    })
    // Ensure proper spacing around display math
    .replace(/\$\$([^$]+)\$\$/g, '\n$$$$1$$\n');
}

/**
 * Fix chemical formula formatting
 */
function fixChemicalFormulas(text: string): string {
  return text
    // Fix subscripts in chemical formulas
    .replace(/([A-Z][a-z]?)(\d+)/g, '$1_{$2}')
    // Fix chemical equations with arrows
    .replace(/→/g, '\\rightarrow')
    .replace(/->/g, '\\rightarrow')
    .replace(/←/g, '\\leftarrow')
    .replace(/<-/g, '\\leftarrow')
    // Wrap chemical formulas in \text{} when not in math mode
    .replace(/\b([A-Z][a-z]?(?:_?\d*)?(?:[A-Z][a-z]?(?:_?\d*)?)*)\b/g, (match) => {
      // Only wrap if it looks like a chemical formula and isn't already in math mode
      if (/^[A-Z][a-z]?(_?\d+)?([A-Z][a-z]?(_?\d+)?)*$/.test(match) && match.length > 1) {
        return `\\text{${match}}`;
      }
      return match;
    });
}

/**
 * Extract and validate mathematical expressions from text
 */
export function extractMathExpressions(text: string): Array<{ original: string; sanitized: string; isValid: boolean }> {
  const mathRegex = /\$\$?([^$]+)\$\$?/g;
  const expressions: Array<{ original: string; sanitized: string; isValid: boolean }> = [];
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    const original = match[0];
    const sanitized = sanitizeMath(original);
    const isValid = validateMathExpression(match[1]);
    
    expressions.push({ original, sanitized, isValid });
  }

  return expressions;
}

/**
 * Basic validation for mathematical expressions
 */
function validateMathExpression(expression: string): boolean {
  // Check for balanced braces
  let braceCount = 0;
  for (const char of expression) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (braceCount < 0) return false;
  }
  
  if (braceCount !== 0) return false;

  // Check for valid LaTeX commands
  const invalidPatterns = [
    /\\cdot[a-zA-Z]/,  // \cdot followed immediately by letters
    /\\[a-zA-Z]+[0-9]/,  // Invalid command-number combinations
    /\$[^$]*\$[^$]*\$/,  // Nested dollar signs
  ];

  return !invalidPatterns.some(pattern => pattern.test(expression));
}
