import katex from 'katex';
import { marked } from 'marked';

interface MathBlock {
  id: string;
  math: string;
  displayMode: boolean;
}

// Unwrap top-level fenced code blocks that declare markdown (```markdown)
function unwrapMarkdownFence(input: string): string {
  const m = input.match(/^\s*```(?:markdown|md|gfm)?\s*\n([\s\S]*?)\n```[\s]*$/i);
  if (m) return m[1];
  return input;
}

export function normalizeAndExtractMath(text: string): { text: string; mathBlocks: MathBlock[] } {
  let processedText = unwrapMarkdownFence(text || '');
  const mathBlocks: MathBlock[] = [];
  let blockIndex = 0;

  // COMPREHENSIVE LaTeX cleaning - fix all problematic patterns
  console.log('Before LaTeX cleaning:', processedText.substring(0, 200));
  
  // Fix nested \text{} commands first - this is critical
  processedText = processedText.replace(/\\text\{([^{}]*?)\\text\{([^{}]*?)\}([^{}]*?)\}/g, '\\text{$1$2$3}');
  processedText = processedText.replace(/\\text\{([^{}]*?)\\text\{([^{}]*?)\}/g, '\\text{$1$2}');
  
  // Fix malformed LaTeX commands
  processedText = processedText.replace(/\\cdotpatm/g, '\\cdot\\text{ atm}');
  processedText = processedText.replace(/\\cdotp([a-zA-Z])/g, '\\cdot\\text{ $1}');
  processedText = processedText.replace(/\\cdot([a-zA-Z])/g, '\\cdot\\text{$1}');
  
  // Clean up spacing and redundant text commands
  processedText = processedText.replace(/\\text\{\s+/g, '\\text{');
  processedText = processedText.replace(/\s+\}/g, '}');
  processedText = processedText.replace(/\\text\{([^}]*)\}\s*\\text\{([^}]*)\}/g, '\\text{$1 $2}');
  
  console.log('After LaTeX cleaning:', processedText.substring(0, 200));
  
  // Convert LaTeX delimiters to consistent format
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/gs, '$$$$$1$$$$');
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/gs, '$$$1$');

  // Extract math expressions
  const finalRegex = /(\$\$(?:[\s\S]*?)\$\$|\$[^$]*\$)/g;
  const markdownReadyContent = processedText.replace(finalRegex, (match) => {
    const id = `__KATEX_PLACEHOLDER_${blockIndex++}__`;
    const isDisplayMode = match.startsWith('$$');
    let math = isDisplayMode ? match.slice(2, -2) : match.slice(1, -1);
    
    // Additional cleaning for the extracted math
    math = math.replace(/\\text\{([^{}]*?)\\text\{([^{}]*?)\}/g, '\\text{$1$2}');
    math = math.trim();
    
    console.log(`Extracted math (${isDisplayMode ? 'display' : 'inline'}):`, math);
    
    mathBlocks.push({ id, math, displayMode: isDisplayMode });
    return `<div id="${id}" class="inline-block"></div>`;
  });

  return { text: markdownReadyContent, mathBlocks };
}

export function renderContent(content: string, targetElement: HTMLElement): void {
  if (!targetElement) {
    console.error('No target element for math rendering');
    return;
  }

  console.log('Starting math rendering for content length:', content?.length || 0);

  const { text: markdownContent, mathBlocks } = normalizeAndExtractMath(content);
  
  console.log('Extracted', mathBlocks.length, 'math blocks');
  
  // Parse markdown with proper configuration  
  const parsedMarkdown = marked.parse(markdownContent, {
    gfm: true,
    breaks: true,
  });
  
  targetElement.innerHTML = typeof parsedMarkdown === 'string' ? parsedMarkdown : '';
  
  // Add font family for Arabic content
  if (targetElement.closest('[dir="rtl"]')) {
    targetElement.classList.add('font-cairo');
  }

  // Render math expressions with better error handling
  mathBlocks.forEach((block, index) => {
    const placeholderEl = targetElement.querySelector(`#${block.id}`) as HTMLElement;
    if (placeholderEl) {
      try {
        console.log(`Rendering math block ${index + 1}:`, block.math);
        
        // Force math LTR direction for correct rendering in RTL UIs
        placeholderEl.setAttribute('dir', 'ltr');
        placeholderEl.classList.add('katex-container');
        
        // Render with KaTeX
        katex.render(block.math, placeholderEl, {
          throwOnError: false,
          displayMode: block.displayMode,
          errorColor: '#cc0000',
          macros: {
            '\\ce': '\\text{#1}',
            '\\chem': '\\text{#1}'
          },
          trust: true,
          strict: false  // Less strict parsing
        });
        
        console.log(`✅ Successfully rendered math block ${index + 1}`);
        
      } catch (error) {
        console.error(`❌ KaTeX rendering error for block ${index + 1}:`, error);
        console.error('Problematic math:', block.math);
        
        // Fallback to showing the LaTeX code
        placeholderEl.innerHTML = `
          <span style="
            background: #fee; 
            border: 1px solid #fcc; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-family: monospace; 
            color: #c00;
            font-size: 0.9em;
          ">
            LaTeX Error: ${block.math}
          </span>
        `;
      }
    } else {
      console.warn(`⚠️ Could not find placeholder element for math block ${index + 1}: ${block.id}`);
    }
  });
  
  console.log('✅ Math rendering completed');
}