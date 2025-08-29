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

  // Convert LaTeX delimiters to consistent format
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/gs, '$$$$$1$$$$');
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/gs, '$$$1$');

  // Extract math expressions
  const finalRegex = /(\$\$(?:[\s\S]*?)\$\$|\$[^$]*\$)/g;
  const markdownReadyContent = processedText.replace(finalRegex, (match) => {
    const id = `__KATEX_PLACEHOLDER_${blockIndex++}__`;
    const isDisplayMode = match.startsWith('$$');
    const math = isDisplayMode ? match.slice(2, -2) : match.slice(1, -1);
    mathBlocks.push({ id, math, displayMode: isDisplayMode });
    return `<div id="${id}" class="inline-block"></div>`;
  });

  return { text: markdownReadyContent, mathBlocks };
}

export function renderContent(content: string, targetElement: HTMLElement): void {
  if (!targetElement) return;

  const { text: markdownContent, mathBlocks } = normalizeAndExtractMath(content);
  
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

  // Render math expressions
  mathBlocks.forEach(block => {
    const placeholderEl = targetElement.querySelector(`#${block.id}`) as HTMLElement;
    if (placeholderEl) {
      try {
        // Force math LTR direction for correct rendering in RTL UIs
        placeholderEl.setAttribute('dir', 'ltr');
        placeholderEl.classList.add('katex-container');
        katex.render(block.math.trim(), placeholderEl, {
            throwOnError: false,
            displayMode: block.displayMode,
            macros: { 
              '\\chem': '\\ce{#1}',
              '\\ce': '\\ce{#1}'
            },
            trust: true
          });
      } catch (error) {
        console.error("KaTeX rendering error:", error);
        placeholderEl.textContent = `[KaTeX Error: ${(error as Error).message}]`;
      }
    }
  });
}