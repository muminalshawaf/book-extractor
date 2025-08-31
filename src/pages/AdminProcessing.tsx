import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Play, Square, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callFunction } from "@/lib/functionsClient";
import { enhancedBooks } from "@/data/enhancedBooks";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";

interface ProcessingStatus {
  isRunning: boolean;
  currentPage: number;
  totalPages: number;
  processed: number;
  skipped: number;
  errors: number;
  startTime?: Date;
  logs: string[];
}

const AdminProcessing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialBookId = searchParams.get('bookId') || enhancedBooks[0]?.id;

  const [selectedBookId, setSelectedBookId] = useState(initialBookId);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(10);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [status, setStatus] = useState<ProcessingStatus>({
    isRunning: false,
    currentPage: 0,
    totalPages: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    logs: []
  });

  // Use ref to track running state for the processing loop
  const isRunningRef = React.useRef(false);

  const selectedBook = enhancedBooks.find(b => b.id === selectedBookId);

  // Update end page when book changes
  React.useEffect(() => {
    if (selectedBook) {
      setEndPage(Math.min(10, selectedBook.totalPages));
    }
  }, [selectedBook]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setStatus(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-49), `[${timestamp}] ${message}`] // Keep last 50 logs
    }));
  };

  const startProcessing = async () => {
    if (!selectedBook) return;

    // Validate page range
    const validStartPage = Math.max(1, Math.min(startPage, selectedBook.totalPages));
    const validEndPage = Math.max(validStartPage, Math.min(endPage, selectedBook.totalPages));
    
    if (validStartPage > validEndPage) {
      toast.error("Invalid page range");
      return;
    }

    const totalPagesToProcess = validEndPage - validStartPage + 1;

    isRunningRef.current = true;
    setStatus({
      isRunning: true,
      currentPage: 0,
      totalPages: totalPagesToProcess,
      processed: 0,
      skipped: 0,
      errors: 0,
      startTime: new Date(),
      logs: []
    });

    addLog(`Starting processing for ${selectedBook.title} (pages ${validStartPage}-${validEndPage}, ${totalPagesToProcess} pages total)`);

    try {
      for (let pageNum = validStartPage; pageNum <= validEndPage; pageNum++) {
        if (!isRunningRef.current) {
          addLog("Processing stopped by user");
          break;
        }

        const currentPageInRange = pageNum - validStartPage + 1;
        setStatus(prev => ({ ...prev, currentPage: currentPageInRange }));
        addLog(`Processing page ${pageNum}...`);

        // Check if page already has summary in database
        const { data: existingData } = await supabase
          .from('page_summaries')
          .select('ocr_text, summary_md')
          .eq('book_id', selectedBookId)
          .eq('page_number', pageNum)
          .maybeSingle();

        if (skipProcessed && existingData?.ocr_text && existingData?.summary_md) {
          addLog(`Page ${pageNum}: Already processed - skipping`);
          setStatus(prev => ({ ...prev, skipped: prev.skipped + 1 }));
          continue;
        }

        if (!skipProcessed && existingData?.ocr_text && existingData?.summary_md) {
          addLog(`Page ${pageNum}: Reprocessing existing data`);
        }

        try {
          // Get page image URL
          const pages = selectedBook.buildPages();
          const pageImage = pages[pageNum - 1];
          
          if (!pageImage) {
            addLog(`Page ${pageNum}: No image found - skipping`);
            setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
            continue;
          }

          // OCR the page if no text exists or if we're not skipping processed pages
          let ocrText = (skipProcessed ? existingData?.ocr_text : '') || '';
          let ocrConfidence = 0.8;

          if (!ocrText) {
            addLog(`Page ${pageNum}: Extracting text...`);
            
            try {
              // Try Gemini OCR first
              const ocrResult = await callFunction('ocr-gemini', {
                imageUrl: pageImage.src,
                language: 'ar' // Arabic language for Saudi books
              });
              
              ocrText = ocrResult.text || '';
              ocrConfidence = ocrResult.confidence || 0.8;
              addLog(`Page ${pageNum}: OCR completed (confidence: ${(ocrConfidence * 100).toFixed(1)}%)`);
            } catch (ocrError) {
              // Fallback to DeepSeek OCR
              try {
                addLog(`Page ${pageNum}: Gemini OCR failed, trying DeepSeek...`);
                const fallbackResult = await callFunction('ocr-deepseek', {
                  imageUrl: pageImage.src,
                  language: 'ar'
                });
                
                ocrText = fallbackResult.text || '';
                ocrConfidence = fallbackResult.confidence || 0.6;
                addLog(`Page ${pageNum}: DeepSeek OCR completed (confidence: ${(ocrConfidence * 100).toFixed(1)}%)`);
              } catch (fallbackError) {
                addLog(`Page ${pageNum}: OCR failed - ${fallbackError.message || fallbackError}`);
                setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
                continue;
              }
            }
          }

          // Generate summary if no summary exists or if we're not skipping processed pages
          let summary = (skipProcessed ? existingData?.summary_md : '') || '';
          let summaryConfidence = 0.8;

          if (!summary && ocrText) {
            addLog(`Page ${pageNum}: Generating summary...`);
            
            try {
              const summaryResult = await callFunction('summarize', {
                text: ocrText,
                lang: 'ar',
                page: pageNum,
                title: selectedBook.title
              });
              
              summary = summaryResult.summary || '';
              summaryConfidence = 0.8; // Set default confidence since summarize function doesn't return it
              addLog(`Page ${pageNum}: Summary generated successfully`);
            } catch (summaryError) {
              addLog(`Page ${pageNum}: Summary generation failed - ${summaryError.message || summaryError}`);
              setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
              continue;
            }
          }

          // Save to database if we have new content or if we're reprocessing
          if ((ocrText && !existingData?.ocr_text) || 
              (summary && !existingData?.summary_md) || 
              !skipProcessed) {
            await supabase.from('page_summaries').upsert({
              book_id: selectedBookId,
              page_number: pageNum,
              ocr_text: ocrText,
              summary_md: summary,
              ocr_confidence: ocrConfidence,
              confidence: summaryConfidence,
              updated_at: new Date().toISOString()
            });

            addLog(`Page ${pageNum}: Saved to database`);
          }

          setStatus(prev => ({ ...prev, processed: prev.processed + 1 }));

          // Small delay to prevent overwhelming the APIs
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          addLog(`Page ${pageNum}: Error - ${error.message || error}`);
          setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
        }
      }

      if (isRunningRef.current) {
        const duration = Date.now() - (status.startTime?.getTime() || 0);
        addLog(`Processing completed in ${Math.round(duration / 1000)}s`);
        toast.success("Book processing completed successfully!");
      }

    } catch (error) {
      addLog(`Fatal error: ${error}`);
      toast.error("Processing failed with fatal error");
    } finally {
      isRunningRef.current = false;
      setStatus(prev => ({ ...prev, isRunning: false }));
    }
  };

  const stopProcessing = () => {
    isRunningRef.current = false;
    setStatus(prev => ({ ...prev, isRunning: false }));
    addLog("Processing stopped by user");
    toast.info("Processing stopped");
  };

  const progress = status.totalPages > 0 ? (status.currentPage / status.totalPages) * 100 : 0;

  return (
    <>
      <DynamicSEOHead
        customTitle="Admin Book Processing - Saudi Educational Platform"
        customDescription="Admin panel for processing and summarizing educational book content"
      />
      
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Book Processing Admin</h1>
            <p className="text-muted-foreground">Process books to extract text and generate summaries</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Book Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Book to Process</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedBookId} onValueChange={setSelectedBookId} disabled={status.isRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a book" />
                </SelectTrigger>
                <SelectContent>
                  {enhancedBooks.map((book) => (
                    <SelectItem key={book.id} value={book.id}>
                      {book.title} ({book.totalPages} pages)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedBook && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h3 className="font-semibold">{selectedBook.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedBook.grade} • {selectedBook.semester} • {selectedBook.totalPages} pages
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Page Range Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Page Range Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Page</label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedBook?.totalPages || 1}
                    value={startPage}
                    onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={status.isRunning}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Page</label>
                  <Input
                    type="number"
                    min={startPage}
                    max={selectedBook?.totalPages || 1}
                    value={endPage}
                    onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || startPage))}
                    disabled={status.isRunning}
                  />
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Processing {Math.max(0, endPage - startPage + 1)} pages 
                {selectedBook && ` (out of ${selectedBook.totalPages} total)`}
                {skipProcessed ? " (skipping already processed)" : " (reprocessing all)"}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="skip-processed"
                  checked={skipProcessed}
                  onChange={(e) => setSkipProcessed(e.target.checked)}
                  disabled={status.isRunning}
                  className="h-4 w-4"
                />
                <label htmlFor="skip-processed" className="text-sm font-medium">
                  Skip already processed pages
                </label>
              </div>
              
              {!skipProcessed && (
                <Alert>
                  <RefreshCw className="w-4 h-4" />
                  <AlertDescription>
                    <strong>Reprocess mode:</strong> All pages will be reprocessed even if they already have OCR text and summaries. 
                    This will overwrite existing data.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setStartPage(1); setEndPage(5); }}
                  disabled={status.isRunning}
                >
                  First 5 pages
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setStartPage(1); setEndPage(10); }}
                  disabled={status.isRunning}
                >
                  First 10 pages
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setStartPage(1); setEndPage(selectedBook?.totalPages || 1); }}
                  disabled={status.isRunning}
                >
                  Entire book
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Processing Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={startProcessing} 
                  disabled={!selectedBook || status.isRunning}
                  className="flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start Processing
                </Button>
                
                <Button 
                  onClick={stopProcessing} 
                  disabled={!status.isRunning}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </Button>
              </div>

              {status.isRunning && (
                <Alert>
                  <Clock className="w-4 h-4" />
                  <AlertDescription>
                    Processing pages {startPage}-{endPage}. You can safely leave this page - processing will continue in the background.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Progress */}
          {(status.isRunning || status.currentPage > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Page {status.currentPage} of {status.totalPages}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-semibold">{status.processed}</span>
                    </div>
                    <p className="text-xs text-green-600">Processed</p>
                  </div>
                  
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-blue-600">
                      <RefreshCw className="w-4 h-4" />
                      <span className="font-semibold">{status.skipped}</span>
                    </div>
                    <p className="text-xs text-blue-600">Skipped</p>
                  </div>
                  
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-red-600">
                      <XCircle className="w-4 h-4" />
                      <span className="font-semibold">{status.errors}</span>
                    </div>
                    <p className="text-xs text-red-600">Errors</p>
                  </div>
                </div>

                {status.startTime && (
                  <p className="text-sm text-muted-foreground">
                    Started at {status.startTime.toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          {status.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Processing Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-black text-green-400 p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm">
                  {status.logs.map((log, index) => (
                    <div key={index} className="mb-1">
                      {log}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminProcessing;