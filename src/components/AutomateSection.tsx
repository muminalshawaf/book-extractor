import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Play, Square, BookOpen, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AutomateSectionProps {
  bookTitle: string;
  totalPages: number;
  currentPage: number;
  rtl?: boolean;
  onNavigateToPage: (page: number) => void;
  onExtractAndSummarize: (pageNumber: number) => Promise<void>;
  checkIfPageProcessed: (page: number) => Promise<boolean>;
}

interface AutomationProgress {
  isRunning: boolean;
  isPaused: boolean;
  currentPage: number;
  startPage: number;
  endPage: number;
  processedPages: number;
  skippedPages: number;
  totalPages: number;
  lastActiveTime: number;
}

export const AutomateSection: React.FC<AutomateSectionProps> = ({
  bookTitle,
  totalPages,
  currentPage,
  rtl = false,
  onNavigateToPage,
  onExtractAndSummarize,
  checkIfPageProcessed
}) => {
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(Math.min(10, totalPages));
  const [progress, setProgress] = useState<AutomationProgress>({
    isRunning: false,
    isPaused: false,
    currentPage: 0,
    startPage: 0,
    endPage: 0,
    processedPages: 0,
    skippedPages: 0,
    totalPages: 0,
    lastActiveTime: Date.now()
  });
  
  const stopRequested = useRef(false);
  const pauseRequested = useRef(false);

  // Sleep/wake detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && progress.isRunning) {
        console.log('Tab became hidden, pausing automation...');
        pauseRequested.current = true;
        setProgress(prev => ({ ...prev, isPaused: true, lastActiveTime: Date.now() }));
        toast.info(rtl ? 'تم إيقاف العملية مؤقتاً (الكمبيوتر في وضع السكون)' : 'Process paused (computer went to sleep)');
      } else if (!document.hidden && progress.isPaused && progress.isRunning) {
        console.log('Tab became visible, resuming automation...');
        const timeDiff = Date.now() - progress.lastActiveTime;
        if (timeDiff > 5000) { // If more than 5 seconds passed
          toast.info(rtl ? 'استئناف العملية...' : 'Resuming process...');
        }
        pauseRequested.current = false;
        setProgress(prev => ({ ...prev, isPaused: false, lastActiveTime: Date.now() }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [progress.isRunning, progress.isPaused, progress.lastActiveTime, rtl]);

  const startAutomation = async () => {
    const start = Math.max(1, Math.min(startPage, totalPages));
    const end = Math.max(start, Math.min(endPage, totalPages));
    const total = end - start + 1;

    setProgress({
      isRunning: true,
      isPaused: false,
      currentPage: start,
      startPage: start,
      endPage: end,
      processedPages: 0,
      skippedPages: 0,
      totalPages: total,
      lastActiveTime: Date.now()
    });

    stopRequested.current = false;
    pauseRequested.current = false;

    try {
      for (let pageNum = start; pageNum <= end; pageNum++) {
        // Check for stop request
        if (stopRequested.current) {
          toast.info(rtl ? 'تم إيقاف العملية' : 'Process stopped');
          break;
        }

        // Wait while paused (sleep/wake handling)
        while (pauseRequested.current && !stopRequested.current) {
          console.log('Automation paused, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check again for stop after pause
        if (stopRequested.current) {
          toast.info(rtl ? 'تم إيقاف العملية' : 'Process stopped');
          break;
        }

         // Navigate to the page first
         console.log(`Automation: Navigating to page ${pageNum}`);
         onNavigateToPage(pageNum);
         
         // Update progress AFTER navigation starts to ensure correct display
         setProgress(prev => ({ 
           ...prev, 
           currentPage: pageNum, 
           lastActiveTime: Date.now() 
         }));
         
         console.log(`Automation: Updated progress display to show page ${pageNum}`);
         
         // Wait for navigation to complete - reduced initial wait since we have better sync in handleExtractAndSummarize
         await new Promise(resolve => setTimeout(resolve, 1500));

        // Check if page is already processed (with retry for network issues)
        console.log(`Automation: Checking if page ${pageNum} is processed`);
        let isProcessed = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            isProcessed = await checkIfPageProcessed(pageNum);
            console.log(`Automation: Page ${pageNum} processed status:`, isProcessed);
            break;
          } catch (error) {
            retryCount++;
            console.warn(`Retry ${retryCount}/${maxRetries} checking page ${pageNum}:`, error);
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              console.error(`Failed to check page ${pageNum} after ${maxRetries} retries`);
              // Assume not processed and continue
              isProcessed = false;
            }
          }
        }
        
        if (isProcessed) {
          console.log(`Page ${pageNum} already processed, skipping...`);
          setProgress(prev => ({ 
            ...prev, 
            skippedPages: prev.skippedPages + 1 
          }));
          toast.success(
            rtl 
              ? `تم تخطي الصفحة ${pageNum} (معالجة مسبقاً)` 
              : `Skipped page ${pageNum} (already processed)`
          );
          continue;
        }

        // Extract and summarize current page (with retry logic)
        let processSuccess = false;
        retryCount = 0;
        
        while (retryCount < maxRetries && !processSuccess) {
          try {
            await onExtractAndSummarize(pageNum);
            processSuccess = true;
            
            setProgress(prev => ({ 
              ...prev, 
              processedPages: prev.processedPages + 1 
            }));

            toast.success(
              rtl 
                ? `تم معالجة الصفحة ${pageNum}` 
                : `Processed page ${pageNum}`
            );

            // Wait between pages to prevent overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (error) {
            retryCount++;
            console.error(`Error processing page ${pageNum} (attempt ${retryCount}/${maxRetries}):`, error);
            
            if (retryCount < maxRetries) {
              toast.info(
                rtl 
                  ? `إعادة محاولة معالجة الصفحة ${pageNum}...` 
                  : `Retrying page ${pageNum}...`
              );
              // Wait before retry, increasing delay each time
              await new Promise(resolve => setTimeout(resolve, 3000 * retryCount));
            } else {
              toast.error(
                rtl 
                  ? `فشل في معالجة الصفحة ${pageNum} بعد ${maxRetries} محاولات` 
                  : `Failed to process page ${pageNum} after ${maxRetries} attempts`
              );
            }
          }
        }
      }

      if (!stopRequested.current) {
        toast.success(
          rtl 
            ? `اكتملت العملية! تم معالجة ${progress.processedPages} صفحة وتخطي ${progress.skippedPages} صفحة` 
            : `Automation completed! Processed ${progress.processedPages} pages, skipped ${progress.skippedPages} pages`
        );
      }

    } catch (error) {
      console.error('Automation error:', error);
      toast.error(
        rtl 
          ? 'حدث خطأ في العملية التلقائية' 
          : 'Automation process failed'
      );
    } finally {
      setProgress(prev => ({ ...prev, isRunning: false }));
    }
  };

  const stopAutomation = () => {
    stopRequested.current = true;
    setProgress(prev => ({ ...prev, isRunning: false }));
    toast.info(rtl ? 'جارٍ إيقاف العملية...' : 'Stopping process...');
  };

  const progressPercent = progress.totalPages > 0 
    ? ((progress.processedPages + progress.skippedPages) / progress.totalPages) * 100 
    : 0;

  return (
    <Card className="w-full shadow-sm border-t-2 border-primary/20">
      <CardHeader>
        <CardTitle className={cn("text-lg flex items-center gap-3", rtl && "flex-row-reverse")}>
          <BookOpen className="h-5 w-5 text-primary" />
          {rtl ? "أتمتة المعالجة" : "Automate Processing"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Book Info */}
        <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", rtl && "flex-row-reverse")}>
          <span className="font-medium">
            {rtl ? "الكتاب:" : "Book:"}
          </span>
          <span className="truncate">{bookTitle}</span>
        </div>

        {/* Page Range Controls */}
        <div className={cn("flex items-center gap-4", rtl && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            <label className="text-sm font-medium">
              {rtl ? "من الصفحة:" : "From page:"}
            </label>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={startPage}
              onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20"
              disabled={progress.isRunning}
            />
          </div>
          
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            <label className="text-sm font-medium">
              {rtl ? "إلى الصفحة:" : "To page:"}
            </label>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={endPage}
              onChange={(e) => setEndPage(Math.min(totalPages, parseInt(e.target.value) || totalPages))}
              className="w-20"
              disabled={progress.isRunning}
            />
          </div>

          <div className="flex gap-2">
            {!progress.isRunning ? (
              <Button onClick={startAutomation} variant="default" size="sm">
                <Play className="h-4 w-4 mr-2" />
                {rtl ? `معالجة ${endPage - startPage + 1} صفحة` : `Process ${endPage - startPage + 1} pages`}
              </Button>
            ) : (
              <Button onClick={stopAutomation} variant="destructive" size="sm">
                <Square className="h-4 w-4 mr-2" />
                {rtl ? "إيقاف" : "Stop"}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Display */}
        {progress.isRunning && (
          <div className="space-y-3">
            <div className={cn("flex items-center justify-between text-sm", rtl && "flex-row-reverse")}>
              <span className={cn("font-medium flex items-center gap-2", rtl && "flex-row-reverse")}>
                {progress.isPaused && <Pause className="h-4 w-4 text-yellow-500" />}
                {progress.isPaused 
                  ? (rtl ? 'مُتوقف مؤقتاً' : 'Paused') 
                  : (rtl ? `معالجة الصفحة ${progress.currentPage}` : `Processing page ${progress.currentPage}`)
                }
              </span>
              <span className="text-muted-foreground">
                {progress.processedPages + progress.skippedPages} / {progress.totalPages}
              </span>
            </div>
            <Progress value={progressPercent} />
            <div className={cn("flex items-center justify-between text-xs text-muted-foreground", rtl && "flex-row-reverse")}>
              <span>
                {rtl 
                  ? `تم معالجة: ${progress.processedPages}` 
                  : `Processed: ${progress.processedPages}`}
              </span>
              <span>
                {rtl 
                  ? `تم تخطي: ${progress.skippedPages}` 
                  : `Skipped: ${progress.skippedPages}`}
              </span>
            </div>
            {progress.isPaused && (
              <div className={cn("flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded", rtl && "flex-row-reverse")}>
                <Pause className="h-3 w-3" />
                <span>
                  {rtl 
                    ? 'العملية متوقفة مؤقتاً - ستستأنف تلقائياً عند العودة' 
                    : 'Process paused - will resume automatically when you return'}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {rtl 
            ? "تقوم هذه العملية بفحص كل صفحة، وإذا لم تكن معالجة، تستخرج النص وتلخصه تلقائياً. تعمل حتى لو ذهب الكمبيوتر في وضع السكون."
            : "This process checks each page and automatically extracts text and creates summaries for unprocessed pages. Works even if computer goes to sleep."}
        </div>
      </CardContent>
    </Card>
  );
};