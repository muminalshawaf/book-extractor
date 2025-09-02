import { marked } from 'marked';

interface MathJaxWindow extends Window {
  MathJax?: any;
}

declare const window: MathJaxWindow;

// Initialize MathJax configuration
let mathJaxInitialized = false;

function initializeMathJax() {
  if (mathJaxInitialized) return;
  
  // Configure MathJax
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$']],
      displayMath: [['$$', '$$']],
      processEscapes: true,
      processEnvironments: true,
      packages: {'[+]': ['base', 'ams', 'noerrors', 'noundefined']},
      macros: {
        'cdot': '\\cdot',
        'times': '\\times',
        'text': ['\\mathrm{#1}', 1],
        'ce': ['\\mathrm{#1}', 1],
        'chem': ['\\mathrm{#1}', 1]
      }
    },
    options: {
      ignoreHtmlClass: 'tex2jax_ignore',
      processHtmlClass: 'tex2jax_process'
    }
  };

  // Load MathJax script
  const script = document.createElement('script');
  script.src = 'https://polyfill.io/v3/polyfill.min.js?features=es6';
  script.onload = () => {
    const mathJaxScript = document.createElement('script');
    mathJaxScript.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    mathJaxScript.async = true;
    document.head.appendChild(mathJaxScript);
  };
  document.head.appendChild(script);
  
  mathJaxInitialized = true;
}

// Simple and robust LaTeX cleaning
function cleanLatex(text: string): string {
  let cleaned = text;
  
  // Fix malformed commands - simple replacements
  const fixes = [
    [/\\cdotpatm/g, '\\cdot \\text{atm}'],
    [/\\cdotp([a-zA-Z]+)/g, '\\cdot \\text{$1}'],
    [/\\cdot([A-Za-z]+)/g, '\\cdot \\text{$1}'],
    [/\\times\s*\\cdot/g, '\\times'],
    [/\\cdot\s*\\times/g, '\\times'],
    
    // Clean up text commands
    [/\\text\{\s*([^}]*?)\s*\}/g, '\\text{$1}'],
    [/\\text\{([^}]*)\}\s*\\text\{([^}]*)\}/g, '\\text{$1$2}'],
    
    // Fix common unit patterns
    [/(\d+\.?\d*)\s*([a-zA-Z]+)/g, '$1 \\text{ $2}'],
    [/\\text\{([0-9.]+)\s*([a-zA-Z°]+)\}/g, '\\text{$1 $2}'],
    
    // Clean up spacing
    [/\s+/g, ' '],
    [/\{\s+/g, '{'],
    [/\s+\}/g, '}']
  ];
  
  fixes.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern as RegExp, replacement as string);
  });
  
  return cleaned.trim();
}

// Extract and clean math expressions
function processMathContent(content: string): string {
  let processed = content;
  
  // Process display math $$...$$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    const cleanedMath = cleanLatex(math);
    return `$$${cleanedMath}$$`;
  });
  
  // Process inline math $...$
  processed = processed.replace(/\$([^$]*?)\$/g, (match, math) => {
    const cleanedMath = cleanLatex(math);
    return `$${cleanedMath}$`;
  });
  
  return processed;
}

// Main rendering function
export function renderContent(content: string, targetElement: HTMLElement): void {
  if (!targetElement) {
    console.error('No target element provided for math rendering');
    return;
  }
  
  try {
    // Initialize MathJax if needed
    initializeMathJax();
    
    // Clean the content and process math
    const processedContent = processMathContent(content || '');
    
    // Parse markdown
    const parsedMarkdown = marked.parse(processedContent, {
      gfm: true,
      breaks: true,
    });
    
    // Set the HTML content
    targetElement.innerHTML = typeof parsedMarkdown === 'string' ? parsedMarkdown : '';
    
    // Add classes for styling
    targetElement.classList.add('tex2jax_process');
    
    // Add font family for Arabic content
    if (targetElement.closest('[dir="rtl"]')) {
      targetElement.classList.add('font-cairo');
    }
    
    // Render math with MathJax when it's ready
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().then(() => {
        console.log('MathJax rendering completed successfully');
      }).catch((error: any) => {
        console.error('MathJax rendering error:', error);
        // Fallback: show raw LaTeX if MathJax fails
        fallbackToRawLatex(targetElement);
      });
    } else if (window.MathJax && window.MathJax.startup) {
      window.MathJax.startup.promise.then(() => {
        return window.MathJax!.typesetPromise();
      }).then(() => {
        console.log('MathJax rendering completed successfully');
      }).catch((error: any) => {
        console.error('MathJax rendering error:', error);
        fallbackToRawLatex(targetElement);
      });
    } else {
      // MathJax not ready yet, retry after a delay
      setTimeout(() => {
        if (window.MathJax && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise().catch(() => {
            fallbackToRawLatex(targetElement);
          });
        }
      }, 1000);
    }
    
  } catch (error) {
    console.error('Error in math rendering:', error);
    fallbackToRawLatex(targetElement);
  }
}

// Fallback function for when MathJax fails
function fallbackToRawLatex(targetElement: HTMLElement): void {
  console.log('Using fallback LaTeX display');
  
  // Style LaTeX expressions to be more readable
  const style = `
    <style>
    .latex-fallback { 
      font-family: 'Courier New', monospace; 
      background: #f5f5f5; 
      padding: 2px 4px; 
      border-radius: 3px; 
      font-size: 0.9em;
    }
    .latex-display { 
      display: block; 
      text-align: center; 
      margin: 10px 0; 
      padding: 10px; 
      background: #f9f9f9; 
      border: 1px solid #ddd; 
      border-radius: 5px;
    }
    </style>
  `;
  
  if (!document.querySelector('#latex-fallback-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'latex-fallback-styles';
    styleElement.innerHTML = style;
    document.head.appendChild(styleElement);
  }
  
  // Replace math expressions with styled spans
  let html = targetElement.innerHTML;
  html = html.replace(/\$\$([^$]*?)\$\$/g, '<span class="latex-fallback latex-display">$$1$$</span>');
  html = html.replace(/\$([^$]*?)\$/g, '<span class="latex-fallback">$1</span>');
  
  targetElement.innerHTML = html;
}

// Export for backward compatibility
export function normalizeAndExtractMath(text: string) {
  return {
    text: processMathContent(text),
    mathBlocks: [] // Not needed in new implementation
  };
}