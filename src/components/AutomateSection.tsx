import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Play, Square, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AutomateSectionProps {
  bookTitle: string;
  totalPages: number;
  currentPage: number;
  rtl?: boolean;
  onNavigateToPage: (page: number) => void;
  onExtractAndSummarize: () => Promise<void>;
  checkIfPageProcessed: (page: number) => Promise<boolean>;
}

interface AutomationProgress {
  isRunning: boolean;
  currentPage: number;
  startPage: number;
  endPage: number;
  processedPages: number;
  skippedPages: number;
  totalPages: number;
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
    currentPage: 0,
    startPage: 0,
    endPage: 0,
    processedPages: 0,
    skippedPages: 0,
    totalPages: 0
  });
  
  const stopRequested = useRef(false);

  const startAutomation = async () => {
    const start = Math.max(1, Math.min(startPage, totalPages));
    const end = Math.max(start, Math.min(endPage, totalPages));
    const total = end - start + 1;

    setProgress({
      isRunning: true,
      currentPage: start,
      startPage: start,
      endPage: end,
      processedPages: 0,
      skippedPages: 0,
      totalPages: total
    });

    stopRequested.current = false;

    try {
      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (stopRequested.current) {
          toast.info(rtl ? 'تم إيقاف العملية' : 'Process stopped');
          break;
        }

        setProgress(prev => ({ ...prev, currentPage: pageNum }));

        // Navigate to the page
        onNavigateToPage(pageNum);
        
        // Wait for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if page is already processed
        const isProcessed = await checkIfPageProcessed(pageNum);
        
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

        try {
          // Extract and summarize current page
          await onExtractAndSummarize();
          
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
          console.error(`Error processing page ${pageNum}:`, error);
          toast.error(
            rtl 
              ? `خطأ في معالجة الصفحة ${pageNum}` 
              : `Error processing page ${pageNum}`
          );
          
          // Continue to next page even if this one failed
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
              <span className="font-medium">
                {rtl 
                  ? `معالجة الصفحة ${progress.currentPage}` 
                  : `Processing page ${progress.currentPage}`}
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
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {rtl 
            ? "تقوم هذه العملية بفحص كل صفحة، وإذا لم تكن معالجة، تستخرج النص وتلخصه تلقائياً"
            : "This process checks each page and automatically extracts text and creates summaries for unprocessed pages"}
        </div>
      </CardContent>
    </Card>
  );
};