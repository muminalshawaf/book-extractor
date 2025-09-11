import React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface IndexableOCRContentProps {
  ocrText: string;
  pageNumber: number;
  rtl?: boolean;
  onForceRegenerate?: () => void;
}

/**
 * SEO-optimized OCR content component that uses semantic HTML
 * to make extracted text indexable by search engines while 
 * keeping it collapsed by default for better UX
 */
export const IndexableOCRContent: React.FC<IndexableOCRContentProps> = ({
  ocrText,
  pageNumber,
  rtl = false,
  onForceRegenerate
}) => {
  if (!ocrText) return null;

  return (
    <details className="mt-4 border rounded-lg bg-card shadow-sm">
      <summary className="cursor-pointer p-3 hover:bg-muted/50 transition-colors font-medium flex items-center justify-between">
        <span>{rtl ? `محتوى الصفحة ${pageNumber} (نص مستخرج)` : `Page ${pageNumber} Content (Extracted Text)`}</span>
        {onForceRegenerate && (
          <div 
            className="cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Force regenerate clicked - clearing OCR, summary, and cache then reprocessing...');
              onForceRegenerate();
            }}
            title={rtl ? "حذف البيانات من قاعدة البيانات ومسح التخزين المؤقت وإعادة المعالجة" : "Delete database data, clear cache, and restart processing"}
          >
            <Sparkles className="h-4 w-4 ml-2" />
          </div>
        )}
      </summary>
      
      <div className="px-3 pb-3">
        <div 
          className={cn(
            "text-sm leading-relaxed bg-muted/30 p-3 rounded border max-h-64 overflow-y-auto",
            "whitespace-pre-wrap",
            rtl && "text-right"
          )}
          dir={rtl ? "rtl" : "ltr"}
          // This content will be indexed by search engines
          itemScope
          itemType="https://schema.org/DigitalDocument"
        >
          <meta itemProp="name" content={rtl ? `محتوى الصفحة ${pageNumber}` : `Page ${pageNumber} content`} />
          <meta itemProp="description" content={rtl ? "نص مستخرج من الصفحة" : "Extracted text from page"} />
          <div itemProp="text">
            {ocrText}
          </div>
        </div>
      </div>
    </details>
  );
};