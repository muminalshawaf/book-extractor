import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Square, Shield, Brain, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { centralizeSummarize } from '@/lib/summarization/summarizeHelper';
import { LogViewer } from '@/components/ui/log-viewer';

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
  const [useRAG, setUseRAG] = useState(true);
  const [includeOcrData, setIncludeOcrData] = useState(true);
  const [progress, setProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentPage: 0,
    status: 'idle'
  });
  const [isProcessingCancelled, setIsProcessingCancelled] = useState(false);
  const [processingStats, setProcessingStats] = useState({
    totalRagPagesUsed: 0,
    totalRagPagesFound: 0,
    avgConfidence: 0
  });
  const [processingLogs, setProcessingLogs] = useState<Array<{
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>>([]);
  const [showLogs, setShowLogs] = useState(false);

  const addLog = (level: 'info' | 'success' | 'warning' | 'error', message: string, metadata?: Record<string, any>) => {
    setProcessingLogs(prev => [...prev, {
      level,
      message,
      timestamp: new Date(),
      metadata
    }]);
  };

  const processPageRange = async () => {
    if (progress.status === 'running') return;

    const start = Math.max(1, Math.min(rangeStart, totalPages));
    const end = Math.max(start, Math.min(rangeEnd, totalPages));
    const pageCount = end - start + 1;

    // Clear previous logs
    setProcessingLogs([]);
    addLog('info', `Starting batch processing: pages ${start}-${end} (${pageCount} pages)`, {
      useRAG,
      includeOcrData, 
      strictMode,
      rangeSize: pageCount
    });

    // Limit batch size to prevent timeouts
    const maxBatchSize = 5;
    if (pageCount > maxBatchSize) {
      const message = rtl 
        ? `يُنصح بمعالجة ${maxBatchSize} صفحات كحد أقصى في المرة الواحدة لتجنب انقطاع الاتصال` 
        : `Process max ${maxBatchSize} pages at once to avoid timeouts`;
      
      addLog('warning', message);
      toast.warning(message);
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
    let totalRagPagesUsed = 0;
    let totalRagPagesFound = 0;
    let totalConfidence = 0;

    try {
      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (isProcessingCancelled) break;

        setProgress(prev => ({
          ...prev,
          currentPage: pageNum,
          current: pageNum - start
        }));

        // Check if page already has content (unless force regenerating)
        const { data: existing } = await supabase
          .from('page_summaries')
          .select('id, ocr_text, summary_md, confidence')
          .eq('book_id', bookId)
          .eq('page_number', pageNum)
          .maybeSingle();

        if (existing?.ocr_text && existing?.summary_md && !strictMode) {
          console.log(`Page ${pageNum} already processed, skipping...`);
          addLog('info', `Page ${pageNum}: Already processed, skipping`, {
            hasOcr: !!existing.ocr_text,
            hasSummary: !!existing.summary_md,
            confidence: existing.confidence || 0.8
          });
          processedCount++;
          totalConfidence += existing.confidence || 0.8;
          continue;
        }

        if (!existing?.ocr_text) {
          const message = `Page ${pageNum}: No OCR text found, skipping`;
          addLog('warning', message);
          console.warn(message);
          toast.warning(
            rtl 
              ? `الصفحة ${pageNum}: لا يوجد نص مستخرج، تم التخطي` 
              : message
          );
          continue;
        }

        // Use centralized summarization
        let retryCount = 0;
        const maxRetries = strictMode ? 2 : 1;
        let pageSuccess = false;

        while (retryCount <= maxRetries && !pageSuccess) {
          try {
            console.log(`📝 Processing page ${pageNum} with centralized helper (attempt ${retryCount + 1})`);
            
            const result = await centralizeSummarize(
              bookId,
              pageNum,
              `Page ${pageNum}`,
              {
                useRAG: useRAG,
                includeOcrData: includeOcrData,
                force: strictMode, // Force regenerate in strict mode
                strictMode: strictMode,
                maxRetries: 1, // Let the helper handle its own retries
                timeout: strictMode ? 180000 : 120000
              }
            );

            if (result.success) {
              pageSuccess = true;
              processedCount++;
              totalConfidence += result.confidence;
              totalRagPagesUsed += result.ragPagesUsed;
              totalRagPagesFound += result.ragPagesFound;
              
              // Show detailed success message
              const ragInfo = result.ragPagesUsed > 0 ? 
                ` (${result.ragPagesUsed} RAG pages)` : '';
              
              toast.success(
                rtl 
                  ? `تم معالجة الصفحة ${pageNum}${ragInfo}` 
                  : `Processed page ${pageNum}${ragInfo} - ${(result.confidence * 100).toFixed(0)}% confidence`
              );

              // Minimal delay to prevent API rate limits
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              throw new Error(result.error || 'Summarization failed');
            }

          } catch (error) {
            retryCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            addLog('error', `Page ${pageNum}: Attempt ${retryCount} failed - ${errorMessage}`, {
              attempt: retryCount,
              maxRetries: maxRetries + 1,
              errorType: error.constructor.name
            });
            
            console.error(`Error processing page ${pageNum} (attempt ${retryCount}):`, error);
            
            const isFinalAttempt = retryCount > maxRetries;
            
            if (isFinalAttempt) {
              addLog('error', `Page ${pageNum}: All attempts failed`, {
                totalAttempts: retryCount,
                finalError: errorMessage
              });
              
              errorCount++;
              toast.error(
                rtl 
                  ? `خطأ في معالجة الصفحة ${pageNum} بعد ${retryCount} محاولات` 
                  : `Failed to process page ${pageNum} after ${retryCount} attempts`
              );
              break;
            } else {
              toast.warning(
                rtl 
                  ? `خطأ في الصفحة ${pageNum}، جاري المحاولة مرة أخرى...` 
                  : `Page ${pageNum} error, retrying...`
              );
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
      }

      // Update final stats
      const avgConfidence = processedCount > 0 ? totalConfidence / processedCount : 0;
      setProcessingStats({
        totalRagPagesUsed,
        totalRagPagesFound, 
        avgConfidence
      });

      addLog('info', 'Batch processing completed', {
        processedCount,
        errorCount,
        totalRagPagesUsed,
        totalRagPagesFound,
        avgConfidence: (avgConfidence * 100).toFixed(0) + '%'
      });

      setProgress(prev => ({
        ...prev,
        current: prev.total,
        status: isProcessingCancelled ? 'idle' : 'completed'
      }));

      if (!isProcessingCancelled) {
        const ragStats = useRAG && totalRagPagesUsed > 0 ? 
          ` | RAG: ${totalRagPagesUsed}/${totalRagPagesFound} pages` : '';
        const summary = `${processedCount} processed, ${errorCount} errors${ragStats}`;
        toast.success(
          rtl 
            ? `انتهت المعالجة: ${summary}` 
            : `Processing complete: ${summary} - Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`
        );
      }

    } catch (error) {
      console.error('Batch processing error:', error);
      addLog('error', 'Batch processing failed', {
        error: error instanceof Error ? error.message : String(error)
      });
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
    addLog('warning', 'Processing stopped by user');
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
        <div className={cn("flex items-center gap-3 flex-wrap", rtl && "flex-row-reverse")}>
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
          
          <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950", rtl && "flex-row-reverse")}>
            <Brain className="h-3 w-3 text-blue-600" />
            <Label htmlFor="use-rag" className="text-xs font-medium cursor-pointer">
              {rtl ? "استخدام RAG" : "Use RAG"}
            </Label>
            <Switch
              id="use-rag"
              checked={useRAG}
              onCheckedChange={setUseRAG}
              disabled={isRunning}
            />
          </div>
          
          <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950", rtl && "flex-row-reverse")}>
            <Eye className="h-3 w-3 text-green-600" />
            <Label htmlFor="include-ocr-data" className="text-xs font-medium cursor-pointer">
              {rtl ? "بيانات OCR" : "OCR Data"}
            </Label>
            <Switch
              id="include-ocr-data"
              checked={includeOcrData}
              onCheckedChange={setIncludeOcrData}
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
          <div className="space-y-2">
            <div className="text-sm text-green-600 dark:text-green-400">
              {rtl ? "اكتملت المعالجة بنجاح!" : "Processing completed successfully!"}
            </div>
            {processingStats.totalRagPagesUsed > 0 && (
              <div className="text-xs text-blue-600 dark:text-blue-400">
                {rtl 
                  ? `RAG: تم استخدام ${processingStats.totalRagPagesUsed} من ${processingStats.totalRagPagesFound} صفحة | متوسط الثقة: ${(processingStats.avgConfidence * 100).toFixed(0)}%`
                  : `RAG: ${processingStats.totalRagPagesUsed}/${processingStats.totalRagPagesFound} pages used | Avg confidence: ${(processingStats.avgConfidence * 100).toFixed(0)}%`
                }
              </div>
            )}
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
              ? "يقوم هذا المعالج بإنشاء الملخصات باستخدام نفس منطق BookViewer المتقدم"
              : "This processor generates summaries using the same advanced logic as BookViewer"}
          </div>
          <div className="text-amber-600 dark:text-amber-400">
            {rtl 
              ? "💡 نصيحة: معالجة 1-3 صفحات في المرة لتجنب انقطاع الاتصال"
              : "💡 Tip: Process 1-3 pages at a time to avoid timeouts"}
          </div>
          {strictMode && (
            <div className="text-primary font-medium">
              {rtl 
                ? "🛡️ الوضع الصارم: إعادة توليد إجبارية، جودة أعلى، RAG محسن"
                : "🛡️ Strict Mode: Force regenerate, higher quality, enhanced RAG"}
            </div>
          )}
          {useRAG && (
            <div className="text-blue-600 dark:text-blue-400 font-medium">
              {rtl 
                ? "🧠 RAG: يستخدم السياق من الصفحات السابقة لملخصات أفضل"
                : "🧠 RAG: Uses context from previous pages for better summaries"}
            </div>
          )}
          {includeOcrData && (
            <div className="text-green-600 dark:text-green-400 font-medium">
              {rtl 
                ? "👁️ بيانات OCR: يتضمن معلومات السياق المتقدمة"
                : "👁️ OCR Data: Includes advanced context information"}
            </div>
          )}
        </div>

        {/* Processing Logs */}
        {processingLogs.length > 0 && (
          <div className="space-y-3">
            <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs"
              >
                <FileText className="h-3 w-3 mr-1" />
                {rtl ? "سجل المعالجة" : "Processing Logs"}
                <Badge variant="secondary" className="ml-2">
                  {processingLogs.length}
                </Badge>
              </Button>
            </div>
            
            {showLogs && (
              <LogViewer
                logs={processingLogs}
                title={rtl ? "سجل معالجة الدفعة" : "Batch Processing Logs"}
                maxHeight="250px"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};