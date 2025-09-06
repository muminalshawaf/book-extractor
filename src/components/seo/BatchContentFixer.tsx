import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import { callFunction } from '@/lib/functionsClient';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BatchContentFixerProps {
  bookId: string;
  totalPages: number;
  rtl?: boolean;
}

interface PageIssue {
  page_number: number;
  issue_type: 'mismatch' | 'missing_summary' | 'low_quality';
  ocr_preview: string;
  summary_preview: string;
  confidence?: number;
}

interface FixProgress {
  currentPage: number;
  totalPages: number;
  fixed: number;
  errors: number;
  status: 'idle' | 'analyzing' | 'fixing' | 'completed';
}

export const BatchContentFixer: React.FC<BatchContentFixerProps> = ({
  bookId,
  totalPages,
  rtl = false
}) => {
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [progress, setProgress] = useState<FixProgress>({
    currentPage: 0,
    totalPages: 0,
    fixed: 0,
    errors: 0,
    status: 'idle'
  });
  const [isFixingCancelled, setIsFixingCancelled] = useState(false);

  const analyzePages = async () => {
    setProgress(prev => ({ ...prev, status: 'analyzing' }));
    
    try {
      // Check for OCR/summary mismatches and quality issues
      const { data: pageData, error } = await supabase
        .from('page_summaries')
        .select('page_number, ocr_text, summary_md, confidence, ocr_confidence')
        .eq('book_id', bookId)
        .order('page_number');

      if (error) throw error;

      const foundIssues: PageIssue[] = [];

      pageData?.forEach(page => {
        const ocrPreview = page.ocr_text?.substring(0, 100) || 'No OCR';
        const summaryPreview = page.summary_md?.substring(0, 100) || 'No Summary';

        // Check for content mismatches
        if (page.ocr_text && page.summary_md) {
          // Detect kinetics content in summary when OCR is about oxidation-reduction
          const ocrAboutOxidation = /تقويم الفصل|أكسدة|اختزال|تأكسد/.test(page.ocr_text);
          const summaryAboutKinetics = /سرعة التفاعل|الحركية الكيميائية|questions 45|questions 46|questions 47|questions 48|questions 49|questions 50/.test(page.summary_md);
          
          if (ocrAboutOxidation && summaryAboutKinetics) {
            foundIssues.push({
              page_number: page.page_number,
              issue_type: 'mismatch',
              ocr_preview: ocrPreview,
              summary_preview: summaryPreview
            });
          }
        }

        // Check for missing summaries
        if (page.ocr_text && !page.summary_md?.trim()) {
          foundIssues.push({
            page_number: page.page_number,
            issue_type: 'missing_summary',
            ocr_preview: ocrPreview,
            summary_preview: 'Missing'
          });
        }

        // Check for low quality content
        if (page.confidence && page.confidence < 0.6) {
          foundIssues.push({
            page_number: page.page_number,
            issue_type: 'low_quality',
            ocr_preview: ocrPreview,
            summary_preview: summaryPreview,
            confidence: page.confidence
          });
        }
      });

      setIssues(foundIssues);
      setProgress(prev => ({ ...prev, status: 'idle' }));
      
      toast.success(rtl 
        ? `تم العثور على ${foundIssues.length} مشكلة في المحتوى`
        : `Found ${foundIssues.length} content issues`
      );
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(rtl ? 'فشل في تحليل المحتوى' : 'Failed to analyze content');
      setProgress(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const fixAllIssues = async () => {
    if (issues.length === 0) return;

    setProgress({
      currentPage: 0,
      totalPages: issues.length,
      fixed: 0,
      errors: 0,
      status: 'fixing'
    });
    setIsFixingCancelled(false);

    for (let i = 0; i < issues.length && !isFixingCancelled; i++) {
      const issue = issues[i];
      
      setProgress(prev => ({
        ...prev,
        currentPage: i + 1
      }));

      try {
        console.log(`🔧 Fixing page ${issue.page_number} (${issue.issue_type})`);
        
        // Delete the problematic cached data
        const { error: deleteError } = await supabase
          .from('page_summaries')
          .delete()
          .eq('book_id', bookId)
          .eq('page_number', issue.page_number);

        if (deleteError) {
          console.warn(`Failed to delete cache for page ${issue.page_number}:`, deleteError);
        }

        // Force regenerate the content
        await callFunction('summarize', {
          text: issue.ocr_preview, // This will trigger a fresh OCR extraction
          lang: 'ar',
          page: issue.page_number,
          title: `Page ${issue.page_number}`,
          force: true
        }, { timeout: 240000, retries: 2 });

        setProgress(prev => ({
          ...prev,
          fixed: prev.fixed + 1
        }));

        console.log(`✅ Fixed page ${issue.page_number}`);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to fix page ${issue.page_number}:`, error);
        setProgress(prev => ({
          ...prev,
          errors: prev.errors + 1
        }));
      }
    }

    setProgress(prev => ({ ...prev, status: 'completed' }));
    
    if (!isFixingCancelled) {
      toast.success(rtl 
        ? `تم إصلاح ${progress.fixed} صفحة بنجاح`
        : `Successfully fixed ${progress.fixed} pages`
      );
    }
  };

  const stopFixing = () => {
    setIsFixingCancelled(true);
    setProgress(prev => ({ ...prev, status: 'idle' }));
    toast.info(rtl ? 'تم إيقاف عملية الإصلاح' : 'Fixing process stopped');
  };

  const isRunning = progress.status === 'analyzing' || progress.status === 'fixing';
  const progressPercent = progress.totalPages > 0 
    ? Math.round(((progress.currentPage) / progress.totalPages) * 100)
    : 0;

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'mismatch': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'missing_summary': return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'low_quality': return <Zap className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getIssueLabel = (type: string) => {
    if (rtl) {
      switch (type) {
        case 'mismatch': return 'عدم تطابق المحتوى';
        case 'missing_summary': return 'ملخص مفقود';
        case 'low_quality': return 'جودة منخفضة';
        default: return 'مشكلة';
      }
    } else {
      switch (type) {
        case 'mismatch': return 'Content Mismatch';
        case 'missing_summary': return 'Missing Summary';
        case 'low_quality': return 'Low Quality';
        default: return 'Issue';
      }
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
          <AlertTriangle className="h-5 w-5" />
          {rtl ? "أداة إصلاح مشاكل المحتوى" : "Content Issue Fixer"}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Analysis Section */}
        <div className="space-y-2">
          <Button 
            onClick={analyzePages}
            disabled={isRunning}
            className="w-full"
          >
            {progress.status === 'analyzing' ? (
              rtl ? "جاري التحليل..." : "Analyzing..."
            ) : (
              rtl ? "تحليل جميع الصفحات" : "Analyze All Pages"
            )}
          </Button>
          
          {issues.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {rtl 
                ? `تم العثور على ${issues.length} مشكلة في المحتوى`
                : `Found ${issues.length} content issues`
              }
            </div>
          )}
        </div>

        {/* Issues List */}
        {issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">
              {rtl ? "المشاكل المكتشفة:" : "Issues Found:"}
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {issues.map((issue, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                  {getIssueIcon(issue.issue_type)}
                  <span className="font-medium">
                    {rtl ? `صفحة ${issue.page_number}` : `Page ${issue.page_number}`}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {getIssueLabel(issue.issue_type)}
                  </Badge>
                  {issue.confidence && (
                    <Badge variant="outline" className="text-xs">
                      {Math.round(issue.confidence * 100)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fix All Section */}
        {issues.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button 
                onClick={fixAllIssues}
                disabled={isRunning}
                className="flex-1"
                variant="destructive"
              >
                {progress.status === 'fixing' ? (
                  rtl ? `جاري الإصلاح... (${progress.currentPage}/${progress.totalPages})` 
                      : `Fixing... (${progress.currentPage}/${progress.totalPages})`
                ) : (
                  rtl ? "إصلاح جميع المشاكل" : "Fix All Issues"
                )}
              </Button>
              
              {progress.status === 'fixing' && (
                <Button onClick={stopFixing} variant="outline">
                  {rtl ? "إيقاف" : "Stop"}
                </Button>
              )}
            </div>

            {/* Progress */}
            {isRunning && (
              <div className="space-y-2">
                <Progress value={progressPercent} className="w-full" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {rtl 
                      ? `${progress.currentPage} من ${progress.totalPages}`
                      : `${progress.currentPage} of ${progress.totalPages}`
                    }
                  </span>
                  <span>
                    {rtl 
                      ? `تم الإصلاح: ${progress.fixed} | أخطاء: ${progress.errors}`
                      : `Fixed: ${progress.fixed} | Errors: ${progress.errors}`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {progress.status === 'completed' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            {rtl 
              ? `✅ تم الانتهاء! إصلاح ${progress.fixed} صفحة، ${progress.errors} أخطاء`
              : `✅ Completed! Fixed ${progress.fixed} pages, ${progress.errors} errors`
            }
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          <p>
            {rtl 
              ? "هذه الأداة تكتشف وتصلح مشاكل عدم تطابق المحتوى، والملخصات المفقودة، والمحتوى منخفض الجودة."
              : "This tool detects and fixes content mismatches, missing summaries, and low-quality content."
            }
          </p>
          <p className="mt-1">
            {rtl 
              ? "⚠️ العملية قد تستغرق عدة دقائق حسب عدد المشاكل."
              : "⚠️ The process may take several minutes depending on the number of issues."
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
};