import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Square, Shield } from 'lucide-react';
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
  const [rangeEnd, setRangeEnd] = useState(Math.min(3, totalPages));
  const [strictMode, setStrictMode] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentPage: 0,
    status: 'idle'
  });
  const [isProcessingCancelled, setIsProcessingCancelled] = useState(false);

  const processPageRange = async () => {
    if (progress.status === 'running') return;

    const start = Math.max(1, Math.min(rangeStart, totalPages));
    const end = Math.max(start, Math.min(rangeEnd, totalPages));
    const pageCount = end - start + 1;

    // Limit batch size to prevent timeouts
    const maxBatchSize = 5;
    if (pageCount > maxBatchSize) {
      toast.warning(
        rtl 
          ? `يُنصح بمعالجة ${maxBatchSize} صفحات كحد أقصى في المرة الواحدة لتجنب انقطاع الاتصال` 
          : `Process max ${maxBatchSize} pages at once to avoid timeouts`
      );
      return;
    }

    setIsProcessingCancelled(false);
    setProgress({
      current: 0,
      total: pageCount,
      currentPage: start,
      status: 'running'
    });

    let processedCount = 0;
    let errorCount = 0;

    try {
      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (isProcessingCancelled) break;

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
          processedCount++;
          continue;
        }

        // Try processing with retry logic
        let retryCount = 0;
        const maxRetries = 1;
        let pageSuccess = false;

        while (retryCount <= maxRetries && !pageSuccess) {
          try {
            // Process with shorter timeout to prevent CF timeouts
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT_ERROR')), 90000) // 90 second timeout
            );

            const processPromise = callFunction('summarize', {
              book_id: bookId,
              page_number: pageNum,
              force_regenerate: true,
              strictMode: strictMode,
              qualityOptions: strictMode ? {
                minSummaryConfidence: 0.75,
                enableRepair: true,
                repairThreshold: 0.7,
                maxRepairAttempts: 2,
                minCoverage: 0.6
              } : undefined,
              ragOptions: strictMode ? {
                enabled: true,
                maxContextPages: 2,
                similarityThreshold: 0.85,
                maxContextLength: 3000
              } : undefined
            }, { timeout: strictMode ? 120000 : 85000 }); // Longer timeout for strict mode

            // Check for "Processing Frozen" status by monitoring the process
            const result = await Promise.race([processPromise, timeoutPromise]);
            
            // Verify the page was actually processed by checking if content was saved
            const { data: verification } = await supabase
              .from('page_summaries')
              .select('id, ocr_text, summary_md')
              .eq('book_id', bookId)
              .eq('page_number', pageNum)
              .maybeSingle();

            if (!verification?.ocr_text && !verification?.summary_md) {
              throw new Error('PROCESSING_FROZEN');
            }
            
            pageSuccess = true;
            processedCount++;
            
            // Clear cache for this page after successful processing
            try {
              const cacheKeys = [
                `book:ocr:${bookId}:${pageNum}`,
                `book:summary:${bookId}:${pageNum}`,
                `book:ocr-timestamp:${bookId}:${pageNum}`,
                `book:summary-timestamp:${bookId}:${pageNum}`
              ];
              cacheKeys.forEach(key => localStorage.removeItem(key));
            } catch (cacheError) {
              console.warn('Failed to clear cache after processing:', cacheError);
            }
            
            toast.success(
              rtl 
                ? `تم معالجة الصفحة ${pageNum}` 
                : `Processed page ${pageNum}`
            );

            // Minimal delay to prevent API rate limits
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            retryCount++;
            console.error(`Error processing page ${pageNum} (attempt ${retryCount}):`, error);
            
            const isFinalAttempt = retryCount > maxRetries;
            
            // Handle different error types
            if (error instanceof Error) {
              if (error.message.includes('TIMEOUT_ERROR') || 
                  error.message.includes('504') ||
                  error.message.includes('timeout')) {
                
                if (isFinalAttempt) {
                  toast.error(
                    rtl 
                      ? `الصفحة ${pageNum}: انتهت مهلة المعالجة بعد المحاولة الثانية` 
                      : `Page ${pageNum}: Processing timeout after retry`
                  );
                } else {
                  toast.warning(
                    rtl 
                      ? `الصفحة ${pageNum}: انتهت مهلة المعالجة، جاري المحاولة مرة أخرى...` 
                      : `Page ${pageNum}: Timeout, retrying...`
                  );
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                }
                
              } else if (error.message.includes('PROCESSING_FROZEN')) {
                
                if (isFinalAttempt) {
                  toast.error(
                    rtl 
                      ? `الصفحة ${pageNum}: المعالجة متجمدة بعد المحاولة الثانية` 
                      : `Page ${pageNum}: Processing frozen after retry`
                  );
                } else {
                  toast.warning(
                    rtl 
                      ? `الصفحة ${pageNum}: المعالجة متجمدة، جاري المحاولة مرة أخرى...` 
                      : `Page ${pageNum}: Processing frozen, retrying...`
                  );
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                }
                
              } else {
                
                if (isFinalAttempt) {
                  toast.error(
                    rtl 
                      ? `خطأ في معالجة الصفحة ${pageNum} بعد المحاولة الثانية` 
                      : `Error processing page ${pageNum} after retry`
                  );
                } else {
                  toast.warning(
                    rtl 
                      ? `خطأ في الصفحة ${pageNum}، جاري المحاولة مرة أخرى...` 
                      : `Page ${pageNum} error, retrying...`
                  );
                  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
                }
              }
            }
            
            if (isFinalAttempt) {
              errorCount++;
              // Continue with next page after final failed attempt
              break;
            }
          }
        }
      }

      setProgress(prev => ({
        ...prev,
        current: prev.total,
        status: isProcessingCancelled ? 'idle' : 'completed'
      }));

      if (!isProcessingCancelled) {
        const summary = `${processedCount} processed, ${errorCount} errors`;
        toast.success(
          rtl 
            ? `انتهت المعالجة: ${summary}` 
            : `Processing complete: ${summary}`
        );
      }

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
    setIsProcessingCancelled(true);
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
        <div className={cn("flex items-center gap-3", rtl && "flex-row-reverse")}>
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
          </div>
          
          <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md bg-primary/5", rtl && "flex-row-reverse")}>
            <Shield className="h-3 w-3 text-primary" />
            <Label htmlFor="strict-mode" className="text-xs font-medium cursor-pointer">
              {rtl ? "وضع صارم" : "Strict Mode"}
            </Label>
            <Switch
              id="strict-mode"
              checked={strictMode}
              onCheckedChange={setStrictMode}
              disabled={isRunning}
            />
          </div>
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

        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            {rtl 
              ? "يقوم هذا المعالج بإنشاء النصوص والملخصات لتحسين فهرسة محركات البحث"
              : "This processor generates OCR text and summaries for better search engine indexing"}
          </div>
          <div className="text-amber-600 dark:text-amber-400">
            {rtl 
              ? "💡 نصيحة: معالجة صفحة واحدة في المرة تقلل من مخاطر انقطاع الاتصال"
              : "💡 Tip: Process 1-3 pages at a time to avoid CloudFlare timeouts"}
          </div>
          {strictMode && (
            <div className="text-primary font-medium">
              {rtl 
                ? "🛡️ الوضع الصارم: جودة عالية، معالجة أبطأ، تغطية أفضل"
                : "🛡️ Strict Mode: Higher quality, slower processing, better coverage"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};