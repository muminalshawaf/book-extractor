
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { sanitizeMath, extractMathExpressions } from './mathSanitizer';

// Load KaTeX extensions for chemistry
const loadExtensions = async () => {
  try {
    await import('katex/dist/contrib/mhchem.min.js');
    console.log('KaTeX mhchem extension loaded successfully');
  } catch (error) {
    console.warn('Could not load KaTeX mhchem extension:', error);
  }
};

// Initialize extensions
loadExtensions();

interface RenderOptions {
  throwOnError: boolean;
  displayMode: boolean;
  sanitize: boolean;
  strict: boolean;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  throwOnError: false,
  displayMode: true,
  sanitize: true,
  strict: true,
};

/**
 * Enhanced math renderer with aggressive sanitization and error handling
 */
export class EnhancedMathRenderer {
  private options: RenderOptions;

  constructor(options: Partial<RenderOptions> = {}) {
    this.options = { ...DEFAULT_RENDER_OPTIONS, ...options };
  }

  /**
   * Render mathematical content with comprehensive sanitization
   */
  renderMath(content: string): string {
    if (!content) return content;

    let processedContent = content;

    if (this.options.sanitize) {
      processedContent = sanitizeMath(processedContent);
    }

    // Extract and validate math expressions
    const mathExpressions = extractMathExpressions(processedContent);
    
    // Log validation issues for debugging
    const invalidExpressions = mathExpressions.filter(expr => !expr.isValid);
    if (invalidExpressions.length > 0) {
      console.warn('Invalid math expressions detected:', invalidExpressions);
    }

    // Process display math ($$...$$)
    processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (match, expression) => {
      return this.renderSingleExpression(expression, true);
    });

    // Process inline math ($...$)
    processedContent = processedContent.replace(/\$([^$\n]+)\$/g, (match, expression) => {
      return this.renderSingleExpression(expression, false);
    });

    return processedContent;
  }

  /**
   * Render a single mathematical expression with error handling
   */
  private renderSingleExpression(expression: string, displayMode: boolean): string {
    try {
      // Additional sanitization for the expression
      let sanitizedExpression = sanitizeMath(expression, {
        fixMultiplication: true,
        wrapUnits: true,
        normalizeDelimiters: false, // Don't change delimiters for single expressions
        fixChemicalFormulas: true,
      });

      // Remove any remaining dollar signs from the expression
      sanitizedExpression = sanitizedExpression.replace(/\$/g, '');

      const rendered = katex.renderToString(sanitizedExpression, {
        throwOnError: false,
        displayMode,
        strict: this.options.strict ? 'error' : 'ignore',
        trust: true, // Allow \text{} and other formatting commands
        macros: {
          // Define common chemistry macros
          '\\ce': '\\text{#1}',
          '\\pu': '\\text{#1}',
        },
      });

      return rendered;
    } catch (error) {
      console.error('Math rendering error for expression:', expression, error);
      
      // Fallback: return the expression wrapped in a code block
      return `<code class="math-error" title="Math rendering failed: ${error.message}">${expression}</code>`;
    }
  }

  /**
   * Validate and fix common math rendering issues
   */
  validateAndFix(content: string): { content: string; issues: string[] } {
    const issues: string[] = [];
    let fixedContent = content;

    // Check for common issues and fix them
    const commonIssues = [
      {
        pattern: /\\cdot[a-zA-Z]/g,
        fix: (match: string) => match.replace(/\\cdot([a-zA-Z]+)/, '\\cdot \\text{ $1}'),
        description: 'Fixed \\cdot followed immediately by units',
      },
      {
        pattern: /\$[^$]*\$[^$]*\$/g,
        fix: (match: string) => match.replace(/\$([^$]*)\$([^$]*)\$/, '$$1$$$$2$$'),
        description: 'Fixed nested dollar signs',
      },
      {
        pattern: /(\d+)\*(\d+)/g,
        fix: (match: string) => match.replace(/(\d+)\*(\d+)/, '$1 \\times $2'),
        description: 'Fixed multiplication operator',
      },
    ];

    commonIssues.forEach(({ pattern, fix, description }) => {
      const matches = fixedContent.match(pattern);
      if (matches) {
        issues.push(`${description}: found ${matches.length} occurrences`);
        fixedContent = fixedContent.replace(pattern, fix);
      }
    });

    return { content: fixedContent, issues };
  }
}

// Create a singleton instance
export const mathRenderer = new EnhancedMathRenderer();

/**
 * Convenience function for rendering math content
 */
export function renderMathContent(content: string): string {
  return mathRenderer.renderMath(content);
}

/**
 * Function to validate math content before rendering
 */
export function validateMathContent(content: string): { isValid: boolean; issues: string[]; fixed: string } {
  const { content: fixed, issues } = mathRenderer.validateAndFix(content);
  const expressions = extractMathExpressions(fixed);
  const isValid = expressions.every(expr => expr.isValid);
  
  return { isValid, issues, fixed };
}
