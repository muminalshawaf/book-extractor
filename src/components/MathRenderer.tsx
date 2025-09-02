import React, { useEffect, useRef } from 'react';
import { renderMathContent } from '@/lib/mathRenderer';
import { cn } from '@/lib/utils';

interface MathRendererProps {
  content: string;
  className?: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && content) {
      containerRef.current.innerHTML = renderMathContent(content);
    }
  }, [content]);

  // Detect Arabic text for RTL direction
  const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(content);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "prose prose-sm max-w-none leading-relaxed",
        "prose-p:mb-4 prose-p:leading-relaxed",
        "prose-headings:font-cairo prose-headings:font-semibold",
        "prose-h1:text-lg prose-h2:text-base prose-h3:text-sm",
        "prose-strong:font-bold prose-strong:text-foreground",
        "prose-b:font-bold prose-b:text-foreground",
        "prose-em:italic prose-i:italic",
        "prose-ul:my-4 prose-ol:my-4 prose-li:mb-2",
        "prose-blockquote:border-r-4 prose-blockquote:border-primary prose-blockquote:pr-4 prose-blockquote:bg-muted/30",
        "prose-table:border-collapse prose-table:w-full prose-table:my-4",
        "prose-table:shadow-sm prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden",
        "prose-th:p-3 prose-th:border-b prose-th:border-border prose-th:bg-muted prose-th:font-semibold prose-th:text-right",
        "prose-td:p-3 prose-td:border-b prose-td:border-border prose-td:text-right",
        "prose-tr:last-child:prose-td:border-b-0",
        "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-left prose-pre:dir-ltr",
        "prose-code:bg-muted prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm",
        "[&_.katex]:text-lg [&_.katex-display]:my-6",
        "[&_strong]:font-bold [&_strong]:text-foreground",
        "[&_b]:font-bold [&_b]:text-foreground",
        "[&_em]:italic [&_i]:italic",
        "font-cairo text-sm",
        isArabic && "text-right",
        className
      )}
      dir={isArabic ? 'rtl' : 'ltr'}
    />
  );
};

export default MathRenderer;