import React from 'react';
import { cn } from '@/lib/utils';

interface IndexableOCRContentProps {
  ocrText: string;
  pageNumber: number;
  rtl?: boolean;
}

/**
 * SEO-optimized OCR content component that uses semantic HTML
 * to make extracted text indexable by search engines while 
 * keeping it collapsed by default for better UX
 */
export const IndexableOCRContent: React.FC<IndexableOCRContentProps> = ({
  ocrText,
  pageNumber,
  rtl = false
}) => {

  return (
    <details className="mt-4 border rounded-lg bg-card shadow-sm">
      <summary className="cursor-pointer p-3 hover:bg-muted/50 transition-colors font-medium">
        {rtl ? `محتوى الصفحة ${pageNumber} (نص مستخرج)` : `Page ${pageNumber} Content (Extracted Text)`}
      </summary>
      
      <div className="px-3 pb-3">
        {ocrText ? (
          <div 
            className={cn(
              "text-sm leading-relaxed bg-muted/30 p-3 rounded border max-h-64 overflow-y-auto",
              "whitespace-pre-wrap font-mono",
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
        ) : (
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded border text-center">
            <p className={rtl ? "text-right" : "text-left"}>
              {rtl ? "لم يتم استخراج النص من هذه الصفحة بعد. استخدم زر 'لخص هذه الصفحة' لاستخراج النص وتوليد الملخص." : "No text has been extracted from this page yet. Use the 'Summarize this page' button to extract text and generate a summary."}
            </p>
          </div>
        )}
      </div>
    </details>
  );
};