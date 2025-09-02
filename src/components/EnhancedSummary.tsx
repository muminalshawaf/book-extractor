import React, { useEffect, useState } from 'react';
import { renderMathContent } from '@/lib/mathRenderer';

interface EnhancedSummaryProps {
  content: string;
  className?: string;
}

export function EnhancedSummary({ content, className = '' }: EnhancedSummaryProps) {
  const [processedContent, setProcessedContent] = useState('');
  const [mathErrors, setMathErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!content) {
      setProcessedContent('');
      return;
    }

    try {
      // Import the math sanitizer and renderer
      import('../lib/mathSanitizer').then(({ sanitizeMath, extractMathExpressions }) => {
        import('../lib/mathRenderer').then(({ renderMathContent, validateMathContent }) => {
          // Validate and fix math content
          const { isValid, issues, fixed } = validateMathContent(content);
          
          if (!isValid) {
            console.warn('Math validation issues:', issues);
            setMathErrors(issues);
          }
          
          // Render the fixed content
          const rendered = renderMathContent(fixed);
          setProcessedContent(rendered);
        });
      });
    } catch (error) {
      console.error('Error processing math content:', error);
      setProcessedContent(content);
    }
  }, [content]);

  return (
    <div className={`enhanced-summary ${className}`}>
      {mathErrors.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 mb-2">Math Rendering Issues Fixed:</p>
          <ul className="text-xs text-yellow-700">
            {mathErrors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div 
        className="prose prose-slate max-w-none rtl:prose-rtl"
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </div>
  );
}
