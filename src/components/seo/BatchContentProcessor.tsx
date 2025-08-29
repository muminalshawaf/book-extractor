import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Loader2, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { callFunction } from '@/lib/functionsClient';

interface BatchContentProcessorProps {
  bookId: string;
  totalPages: number;
  rtl?: boolean;
}

interface BatchProgress {
  current: number;
  total: number;
  currentPage: number;
  status: 'idle' | 'running' | 'completed' | 'error';
}

export const BatchContentProcessor: React.FC<BatchContentProcessorProps> = ({
  bookId,
  totalPages,
  rtl = false
}) => {
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(10, totalPages));
  const [progress, setProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentPage: 0,
    status: 'idle'
  });

  const processPageRange = async () => {
    if (progress.status === 'running') return;

    const start = Math.max(1, Math.min(rangeStart, totalPages));
    const end = Math.max(start, Math.min(rangeEnd, totalPages));
    const pageCount = end - start + 1;

    setProgress({
      current: 0,
      total: pageCount,
      currentPage: start,
      status: 'running'
    });

    try {
      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (progress.status !== 'running') break;

        setProgress(prev => ({
          ...prev,
          currentPage: pageNum,
          current: pageNum - start
        }));

        // Check if page already has content
        const { data: existing } = await supabase
          .from('page_summaries')
          .select('id, ocr_text, summary_md')
          .eq('book_id', bookId)
          .eq('page_number', pageNum)
          .maybeSingle();

        if (existing?.ocr_text && existing?.summary_md) {
          console.log(`Page ${pageNum} already processed, skipping...`);
          continue;
        }

        try {
          // Generate OCR and summary for this page
          await callFunction('summarize', {
            book_id: bookId,
            page_number: pageNum,
            force_regenerate: true
          });

          toast.success(
            rtl 
              ? `تم معالجة الصفحة ${pageNum}` 
              : `Processed page ${pageNum}`
          );

          // Small delay to prevent overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          toast.error(
            rtl 
              ? `خطأ في معالجة الصفحة ${pageNum}` 
              : `Error processing page ${pageNum}`
          );
        }
      }

      setProgress(prev => ({
        ...prev,
        current: prev.total,
        status: 'completed'
      }));

      toast.success(
        rtl 
          ? `تم معالجة ${pageCount} صفحة بنجاح` 
          : `Successfully processed ${pageCount} pages`
      );

    } catch (error) {
      console.error('Batch processing error:', error);
      setProgress(prev => ({ ...prev, status: 'error' }));
      toast.error(
        rtl 
          ? 'حدث خطأ في المعالجة المجمعة' 
          : 'Batch processing failed'
      );
    }
  };

  const stopProcessing = () => {
    setProgress(prev => ({ ...prev, status: 'idle' }));
    toast.info(rtl ? 'تم إيقاف المعالجة' : 'Processing stopped');
  };

  const isRunning = progress.status === 'running';
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className={cn("text-sm flex items-center gap-2", rtl && "flex-row-reverse")}>
          <Play className="h-4 w-4" />
          {rtl ? "معالج المحتوى المجمع" : "Batch Content Processor"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={rangeStart}
            onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20"
            placeholder={rtl ? "من" : "From"}
            disabled={isRunning}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={rangeEnd}
            onChange={(e) => setRangeEnd(Math.min(totalPages, parseInt(e.target.value) || totalPages))}
            className="w-20"
            placeholder={rtl ? "إلى" : "To"}
            disabled={isRunning}
          />
          {!isRunning ? (
            <Button onClick={processPageRange} variant="default" size="sm">
              <Play className="h-3 w-3 mr-1" />
              {rtl ? `معالجة ${rangeEnd - rangeStart + 1} صفحة` : `Process ${rangeEnd - rangeStart + 1} pages`}
            </Button>
          ) : (
            <Button onClick={stopProcessing} variant="destructive" size="sm">
              <Square className="h-3 w-3 mr-1" />
              {rtl ? "إيقاف" : "Stop"}
            </Button>
          )}
        </div>

        {isRunning && (
          <div className="space-y-2">
            <div className={cn("flex items-center justify-between text-sm", rtl && "flex-row-reverse")}>
              <span>
                {rtl 
                  ? `معالجة الصفحة ${progress.currentPage}` 
                  : `Processing page ${progress.currentPage}`}
              </span>
              <span className="text-muted-foreground">
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={progressPercent} />
          </div>
        )}

        {progress.status === 'completed' && (
          <div className="text-sm text-green-600 dark:text-green-400">
            {rtl ? "اكتملت المعالجة بنجاح!" : "Processing completed successfully!"}
          </div>
        )}

        {progress.status === 'error' && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {rtl ? "حدث خطأ أثناء المعالجة" : "An error occurred during processing"}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {rtl 
            ? "يقوم هذا المعالج بإنشاء النصوص والملخصات لتحسين فهرسة محركات البحث"
            : "This processor generates OCR text and summaries for better search engine indexing"}
        </div>
      </CardContent>
    </Card>
  );
};