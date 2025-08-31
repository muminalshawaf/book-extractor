import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Play, Square, BookOpen, Pause, TestTube, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EnhancedAutomateSectionProps {
  bookTitle: string;
  totalPages: number;
  currentPage: number;
  rtl?: boolean;
  onNavigateToPage: (page: number) => void;
  onExtractAndSummarize: (pageNumber: number) => Promise<void>;
  checkIfPageProcessed: (page: number) => Promise<boolean>;
  validateCurrentPage?: (expectedPage: number) => Promise<boolean>;
}

interface AutomationProgress {
  isRunning: boolean;
  isPaused: boolean;
  isDryRun: boolean;
  currentPage: number;
  startPage: number;
  endPage: number;
  processedPages: number;
  skippedPages: number;
  errorPages: number;
  totalPages: number;
  lastActiveTime: number;
  validationErrors: string[];
}

export const EnhancedAutomateSection: React.FC<EnhancedAutomateSectionProps> = ({
  bookTitle,
  totalPages,
  currentPage,
  rtl = false,
  onNavigateToPage,
  onExtractAndSummarize,
  checkIfPageProcessed,
  validateCurrentPage
}) => {
  const [startPage, setStartPage] = useState(Math.max(1, currentPage));
  const [endPage, setEndPage] = useState(Math.max(1, currentPage));
  const [isDryRunMode, setIsDryRunMode] = useState(false);
  const [progress, setProgress] = useState<AutomationProgress>({
    isRunning: false,
    isPaused: false,
    isDryRun: false,
    currentPage: 0,
    startPage: 0,
    endPage: 0,
    processedPages: 0,
    skippedPages: 0,
    errorPages: 0,
    totalPages: 0,
    lastActiveTime: Date.now(),
    validationErrors: []
  });
  
  const stopRequested = useRef(false);
  const pauseRequested = useRef(false);

  // Ensure start page is not greater than end page
  const handleStartPageChange = (value: number) => {
    const validStart = Math.max(1, Math.min(value, totalPages));
    setStartPage(validStart);
    if (validStart > endPage) {
      setEndPage(validStart);
    }
  };

  const handleEndPageChange = (value: number) => {
    const validEnd = Math.max(startPage, Math.min(value, totalPages));
    setEndPage(validEnd);
  };

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
        if (timeDiff > 5000) {
          toast.info(rtl ? 'استئناف العملية...' : 'Resuming process...');
        }
        pauseRequested.current = false;
        setProgress(prev => ({ ...prev, isPaused: false, lastActiveTime: Date.now() }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [progress.isRunning, progress.isPaused, progress.lastActiveTime, rtl]);

  const validatePageBeforeProcessing = async (pageNumber: number): Promise<{ valid: boolean; error?: string }> => {
    if (!validateCurrentPage) {
      return { valid: true };
    }

    try {
      // Add retry mechanism to handle image loading delays
      let isValid = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!isValid && attempts < maxAttempts) {
        attempts++;
        console.log(`[AUTOMATION ${new Date().toISOString()}] Validation attempt ${attempts}/${maxAttempts} for page ${pageNumber}`);
        
        // Wait a bit for the image to load if this isn't the first attempt
        if (attempts > 1) {
          console.log(`[AUTOMATION ${new Date().toISOString()}] Waiting for image to load before retry...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        isValid = await validateCurrentPage(pageNumber);
        
        if (!isValid && attempts < maxAttempts) {
          console.log(`[AUTOMATION ${new Date().toISOString()}] Page ${pageNumber} validation failed, retrying...`);
        }
      }
      
      if (!isValid) {
        return { 
          valid: false, 
          error: `Page ${pageNumber}: Displayed content doesn't match expected page after ${maxAttempts} attempts` 
        };
      }
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `Page ${pageNumber}: Validation failed - ${error}` 
      };
    }
  };

  const startAutomation = async () => {
    const start = Math.max(1, Math.min(startPage, totalPages));
    const end = Math.max(start, Math.min(endPage, totalPages));
    const total = end - start + 1;

    setProgress({
      isRunning: true,
      isPaused: false,
      isDryRun: isDryRunMode,
      currentPage: start,
      startPage: start,
      endPage: end,
      processedPages: 0,
      skippedPages: 0,
      errorPages: 0,
      totalPages: total,
      lastActiveTime: Date.now(),
      validationErrors: []
    });

    stopRequested.current = false;
    pauseRequested.current = false;

    const logWithTimestamp = (message: string, data?: any) => {
      const timestamp = new Date().toISOString();
      console.log(`[AUTOMATION ${timestamp}] ${message}`, data || '');
    };

    try {
      logWithTimestamp(`Starting ${isDryRunMode ? 'DRY RUN' : 'PROCESSING'} automation`, {
        startPage: start,
        endPage: end,
        totalPages: total,
        bookTitle
      });

      for (let pageNum = start; pageNum <= end; pageNum++) {
        // Check for stop request
        if (stopRequested.current) {
          logWithTimestamp('Stop requested, breaking automation loop');
          toast.info(rtl ? 'تم إيقاف العملية' : 'Process stopped');
          break;
        }

        // Wait while paused
        while (pauseRequested.current && !stopRequested.current) {
          logWithTimestamp('Automation paused, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (stopRequested.current) {
          logWithTimestamp('Stop requested after pause, breaking automation loop');
          toast.info(rtl ? 'تم إيقاف العملية' : 'Process stopped');
          break;
        }

        logWithTimestamp(`Processing page ${pageNum}/${end}`);

        // Navigate to the page first
        logWithTimestamp(`Navigating to page ${pageNum}`);
        onNavigateToPage(pageNum);
        
        // Update progress display
        setProgress(prev => ({ 
          ...prev, 
          currentPage: pageNum, 
          lastActiveTime: Date.now() 
        }));
        
        // Wait for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Validate page content matches expected page
        if (validateCurrentPage) {
          logWithTimestamp(`Validating page ${pageNum} content`);
          const validation = await validatePageBeforeProcessing(pageNum);
          
          if (!validation.valid) {
            logWithTimestamp(`Page ${pageNum} validation failed`, validation.error);
            setProgress(prev => ({ 
              ...prev, 
              errorPages: prev.errorPages + 1,
              validationErrors: [...prev.validationErrors, validation.error || `Page ${pageNum} validation failed`]
            }));
            
            toast.error(
              rtl 
                ? `فشل التحقق من الصفحة ${pageNum}` 
                : `Page ${pageNum} validation failed`
            );
            continue;
          }
          logWithTimestamp(`Page ${pageNum} validation passed`);
        }

        if (isDryRunMode) {
          // Dry run mode - just simulate the process
          logWithTimestamp(`DRY RUN: Simulating processing of page ${pageNum}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setProgress(prev => ({ 
            ...prev, 
            processedPages: prev.processedPages + 1 
          }));

          toast.success(
            rtl 
              ? `محاكاة: تم معالجة الصفحة ${pageNum}` 
              : `DRY RUN: Processed page ${pageNum}`,
            { duration: 2000 }
          );
        } else {
          // Real processing mode
          // Check if page is already processed
          logWithTimestamp(`Checking if page ${pageNum} is already processed`);
          let isProcessed = false;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries) {
            try {
              isProcessed = await checkIfPageProcessed(pageNum);
              logWithTimestamp(`Page ${pageNum} processed status: ${isProcessed}`);
              break;
            } catch (error) {
              retryCount++;
              logWithTimestamp(`Retry ${retryCount}/${maxRetries} checking page ${pageNum}`, error);
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                logWithTimestamp(`Failed to check page ${pageNum} after ${maxRetries} retries`);
                isProcessed = false;
              }
            }
          }
          
          if (isProcessed) {
            logWithTimestamp(`Page ${pageNum} already processed, skipping`);
            setProgress(prev => ({ 
              ...prev, 
              skippedPages: prev.skippedPages + 1 
            }));
            toast.success(
              rtl 
                ? `تم تخطي الصفحة ${pageNum} (معالجة مسبقاً)` 
                : `Skipped page ${pageNum} (already processed)`, 
              { duration: 2000 }
            );
            continue;
          }

          // Extract and summarize
          logWithTimestamp(`Extracting and summarizing page ${pageNum}`);
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

              logWithTimestamp(`Successfully processed page ${pageNum}`);
              toast.success(
                rtl 
                  ? `تم معالجة الصفحة ${pageNum}` 
                  : `Processed page ${pageNum}`
              );

              // Wait between pages
              await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
              retryCount++;
              logWithTimestamp(`Error processing page ${pageNum} (attempt ${retryCount}/${maxRetries})`, error);
              
              if (retryCount < maxRetries) {
                toast.info(
                  rtl 
                    ? `إعادة محاولة معالجة الصفحة ${pageNum}...` 
                    : `Retrying page ${pageNum}...`
                );
                await new Promise(resolve => setTimeout(resolve, 3000 * retryCount));
              } else {
                logWithTimestamp(`Failed to process page ${pageNum} after ${maxRetries} attempts`);
                setProgress(prev => ({ 
                  ...prev, 
                  errorPages: prev.errorPages + 1 
                }));
                toast.error(
                  rtl 
                    ? `فشل في معالجة الصفحة ${pageNum} بعد ${maxRetries} محاولات` 
                    : `Failed to process page ${pageNum} after ${maxRetries} attempts`
                );
              }
            }
          }
        }
      }

      if (!stopRequested.current) {
        const completionMessage = isDryRunMode
          ? (rtl 
              ? `اكتملت المحاكاة! تم فحص ${progress.processedPages} صفحة` 
              : `Dry run completed! Checked ${progress.processedPages} pages`)
          : (rtl 
              ? `اكتملت العملية! تم معالجة ${progress.processedPages} صفحة وتخطي ${progress.skippedPages} صفحة` 
              : `Automation completed! Processed ${progress.processedPages} pages, skipped ${progress.skippedPages} pages`);
        
        logWithTimestamp('Automation completed successfully', {
          processed: progress.processedPages,
          skipped: progress.skippedPages,
          errors: progress.errorPages
        });
        
        toast.success(completionMessage);
      }

    } catch (error) {
      logWithTimestamp('Automation error', error);
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
    ? ((progress.processedPages + progress.skippedPages + progress.errorPages) / progress.totalPages) * 100 
    : 0;

  const rangeSize = endPage - startPage + 1;

  return (
    <Card className="w-full shadow-sm border-t-2 border-primary/20">
      <CardHeader>
        <CardTitle className={cn("text-lg flex items-center gap-3", rtl && "flex-row-reverse")}>
          <BookOpen className="h-5 w-5 text-primary" />
          {rtl ? "أتمتة المعالجة المحسّنة" : "Enhanced Automation"}
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

        {/* Dry Run Mode Toggle */}
        <div className={cn("flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg", rtl && "flex-row-reverse")}>
          <TestTube className="h-4 w-4 text-blue-600" />
          <div className="flex-1">
            <div className="font-medium text-sm text-blue-900 dark:text-blue-100">
              {rtl ? "وضع المحاكاة" : "Dry Run Mode"}
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300">
              {rtl ? "اختبار العملية بدون معالجة فعلية" : "Test the process without actual processing"}
            </div>
          </div>
          <Switch
            checked={isDryRunMode}
            onCheckedChange={setIsDryRunMode}
            disabled={progress.isRunning}
          />
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
              onChange={(e) => handleStartPageChange(parseInt(e.target.value) || 1)}
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
              min={startPage}
              max={totalPages}
              value={endPage}
              onChange={(e) => handleEndPageChange(parseInt(e.target.value) || totalPages)}
              className="w-20"
              disabled={progress.isRunning}
            />
          </div>

          <div className="flex gap-2">
            {!progress.isRunning ? (
              <Button onClick={startAutomation} variant="default" size="sm">
                <Play className="h-4 w-4 mr-2" />
                {progress.isDryRun 
                  ? (rtl ? `محاكاة ${rangeSize} صفحة` : `Test ${rangeSize} pages`)
                  : (rtl ? `معالجة ${rangeSize} صفحة` : `Process ${rangeSize} pages`)
                }
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
                {progress.isDryRun && <TestTube className="h-4 w-4 text-blue-500" />}
                {progress.isPaused 
                  ? (rtl ? 'مُتوقف مؤقتاً' : 'Paused') 
                  : (rtl ? `${progress.isDryRun ? 'محاكاة' : 'معالجة'} الصفحة ${progress.currentPage}` : `${progress.isDryRun ? 'Testing' : 'Processing'} page ${progress.currentPage}`)
                }
              </span>
              <span className="text-muted-foreground">
                {progress.processedPages + progress.skippedPages + progress.errorPages} / {progress.totalPages}
              </span>
            </div>
            <Progress value={progressPercent} />
            <div className={cn("grid grid-cols-3 gap-2 text-xs text-muted-foreground", rtl && "text-right")}>
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>
                  {rtl ? `نجح: ${progress.processedPages}` : `Success: ${progress.processedPages}`}
                </span>
              </div>
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse justify-end")}>
                <span className="h-3 w-3 bg-blue-500 rounded-full" />
                <span>
                  {rtl ? `تخطي: ${progress.skippedPages}` : `Skipped: ${progress.skippedPages}`}
                </span>
              </div>
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse justify-end")}>
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span>
                  {rtl ? `خطأ: ${progress.errorPages}` : `Errors: ${progress.errorPages}`}
                </span>
              </div>
            </div>
            
            {/* Validation Errors */}
            {progress.validationErrors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <div className={cn("flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300 mb-2", rtl && "flex-row-reverse")}>
                  <AlertTriangle className="h-4 w-4" />
                  {rtl ? "أخطاء التحقق:" : "Validation Errors:"}
                </div>
                <div className="space-y-1">
                  {progress.validationErrors.slice(-3).map((error, index) => (
                    <div key={index} className="text-xs text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  ))}
                  {progress.validationErrors.length > 3 && (
                    <div className="text-xs text-red-500">
                      {rtl ? `... و ${progress.validationErrors.length - 3} أخطاء أخرى` : `... and ${progress.validationErrors.length - 3} more errors`}
                    </div>
                  )}
                </div>
              </div>
            )}

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
            ? "تتضمن هذه النسخة المحسّنة التحقق من صحة المحتوى ووضع المحاكاة للاختبار الآمن."
            : "This enhanced version includes content validation and dry run mode for safe testing."}
        </div>
      </CardContent>
    </Card>
  );
};