import React, { useEffect, useRef } from 'react';
import { renderContent } from '@/lib/mathRenderer';
import { cn } from '@/lib/utils';

interface MathRendererProps {
  content: string;
  className?: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && content) {
      renderContent(content, containerRef.current);
    }
  }, [content]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "prose prose-sm max-w-none text-right leading-relaxed",
        "prose-p:my-3 prose-headings:my-4",
        "prose-table:border-collapse prose-table:w-full prose-table:my-4",
        "prose-table:shadow-sm prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden",
        "prose-th:p-3 prose-th:border-b prose-th:border-border prose-th:bg-muted prose-th:font-semibold prose-th:text-right",
        "prose-td:p-3 prose-td:border-b prose-td:border-border prose-td:text-right",
        "prose-tr:last-child:prose-td:border-b-0",
        "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-left prose-pre:dir-ltr",
        "prose-code:bg-muted prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm",
        "[&_.katex]:text-lg [&_.katex-display]:my-4",
        className
      )}
    />
  );
};

export default MathRenderer;