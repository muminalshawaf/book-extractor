import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Play, Square, RefreshCw, CheckCircle, XCircle, Clock, Settings, Zap, Shield, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callFunction } from "@/lib/functionsClient";
import { enhancedBooks } from "@/data/enhancedBooks";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import { ProcessingVerification } from "@/components/ProcessingVerification";
import { cleanOcrText } from "@/lib/ocr/ocrTextCleaner";
import { runQualityGate, type QualityGateOptions, type QualityResult } from "@/lib/processing/qualityGate";
import { 
  DEFAULT_PROCESSING_CONFIG,
  ProcessingConfig,
  addJitteredDelay,
  detectNonContentPage,
  generateProcessingStats,
  formatProcessingStats
} from "@/lib/processing/processingUtils";
import AddBookForm from "@/components/AddBookForm";
import { fetchBooks } from "@/data/booksDbSource";

interface ProcessingStatus {
  isRunning: boolean;
  currentPage: number;
  totalPages: number;
  processed: number;
  skipped: number;
  errors: number;
  nonContentSkipped: number;
  repairAttempts: number;
  repairSuccesses: number;
  qualityPasses: number;
  qualityFailures: number;
  averageQuality: number;
  startTime?: Date;
  lastActivity?: Date;
  logs: string[];
}

interface QualityGateMetrics {
  pageNumber: number;
  qualityResult?: QualityResult;
  timestamp: Date;
}

interface PageProcessingResult {
  pageNumber: number;
  isContent: boolean;
  ocrSuccess: boolean;
  ocrConfidence: number;
  summarySuccess: boolean;
  summaryConfidence: number;
  repairAttempted: boolean;
  repairSuccessful: boolean;
  processingTimeMs: number;
  embeddingSuccess?: boolean;
  embeddingDimensions?: number;
}

const AdminProcessing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialBookId = searchParams.get('bookId') || '';
  const [availableBooks, setAvailableBooks] = React.useState(enhancedBooks);

  const [selectedBookId, setSelectedBookId] = useState(initialBookId);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(10);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig>(DEFAULT_PROCESSING_CONFIG);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showQualitySettings, setShowQualitySettings] = useState(false);
  const [pageResults, setPageResults] = useState<PageProcessingResult[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityGateMetrics[]>([]);
  const [qualityGateOptions, setQualityGateOptions] = useState<QualityGateOptions>({
    minOcrConfidence: 0.3,
    minSummaryConfidence: 0.6,
    enableRepair: true,
    repairThreshold: 0.7,
    maxRepairAttempts: 1
  });
  const [status, setStatus] = useState<ProcessingStatus>({
    isRunning: false,
    currentPage: 0,
    totalPages: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    nonContentSkipped: 0,
    repairAttempts: 0,
    repairSuccesses: 0,
    qualityPasses: 0,
    qualityFailures: 0,
    averageQuality: 0,
    logs: []
  });

  // Use ref to track running state for the processing loop
  const isRunningRef = React.useRef(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for activity monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const selectedBook = availableBooks.find(b => b.id === selectedBookId);

  // Load books from database including newly added ones
  React.useEffect(() => {
    const loadBooks = async () => {
      try {
        const dbBooks = await fetchBooks();
        // Convert to enhanced book format with enhanced data
        const enhancedDbBooks = dbBooks.map(book => ({
          ...book,
          slug: book.slug || book.id,
          cover: book.cover_image_url || "/placeholder.svg",
          description: book.description || `كتاب ${book.title}`,
          keywords: [],
          lessons: [],
          totalPages: book.total_pages
        }));
        
        // Merge with existing enhanced books
        const allBooks = [...enhancedDbBooks, ...enhancedBooks.filter(eb => 
          !enhancedDbBooks.some(db => db.id === eb.id)
        )];
        
        setAvailableBooks(allBooks);
        
        // Set default selected book if none is selected and books are available
        if (!selectedBookId && allBooks.length > 0) {
          const bookFromParams = searchParams.get('bookId');
          const defaultBook = bookFromParams ? 
            allBooks.find(b => b.id === bookFromParams) || allBooks[0] : 
            allBooks[0];
          setSelectedBookId(defaultBook.id);
        }
      } catch (error) {
        console.error('Failed to load books:', error);
      }
    };
    
    loadBooks();
  }, [selectedBookId, searchParams]);

  // Update end page when book changes
  React.useEffect(() => {
    if (selectedBook) {
      setEndPage(Math.min(10, selectedBook.totalPages));
    }
  }, [selectedBook]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const now = new Date();
    setStatus(prev => ({
      ...prev,
      lastActivity: now,
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
    setPageResults([]);
    setQualityMetrics([]);
    setStatus({
      isRunning: true,
      currentPage: 0,
      totalPages: totalPagesToProcess,
      processed: 0,
      skipped: 0,
      errors: 0,
      nonContentSkipped: 0,
      repairAttempts: 0,
      repairSuccesses: 0,
      qualityPasses: 0,
      qualityFailures: 0,
      averageQuality: 0,
      startTime: new Date(),
      logs: []
    });

    addLog(`🚀 Starting enhanced processing for ${selectedBook.title} (pages ${validStartPage}-${validEndPage})`);
    addLog(`⚙️ Config: OCR cleaning: ${processingConfig.enableOcrCleaning}, Quality gate: ${processingConfig.enableQualityGate}, Jittered delay: ${processingConfig.enableJitteredDelay}`);

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

        let pageStartTime = Date.now(); // Declare here so catch block can access it

        try {
          
          // Get page image URL
          const pages = selectedBook.buildPages();
          const pageImage = pages[pageNum - 1];
          
          if (!pageImage) {
            addLog(`❌ Page ${pageNum}: No image found - skipping`);
            setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
            continue;
          }

          // OCR the page if no text exists or if we're not skipping processed pages
          let ocrText = (skipProcessed ? existingData?.ocr_text : '') || '';
          let ocrConfidence = 0.8;
          let ocrResult = null; // Store full OCR result for summary context

          if (!ocrText || !skipProcessed) {
            addLog(`🔍 Page ${pageNum}: Extracting text...`);
            
            try {
              // Try Gemini OCR first
              ocrResult = await callFunction('ocr-gemini', {
                imageUrl: pageImage.src,
                language: 'ar' // Arabic language for Saudi books
              }, { timeout: 60000, retries: 1 }); // 1 minute timeout for OCR
              
              // Check if processing was stopped during OCR
              if (!isRunningRef.current) {
                addLog("⏹️ Processing stopped during OCR");
                break;
              }
              
              ocrText = ocrResult.text || '';
              ocrConfidence = ocrResult.confidence || 0.8;
              addLog(`✅ Page ${pageNum}: OCR completed (${(ocrConfidence * 100).toFixed(1)}% confidence, ${ocrText.length} chars)`);
              
              // Try alternative OCR if confidence is low and enabled
              if (processingConfig.alternativeOcrMode && ocrConfidence < processingConfig.ocrModeThreshold) {
                addLog(`🔄 Page ${pageNum}: Low OCR confidence, trying fallback...`);
                try {
                  const fallbackResult = await callFunction('ocr-fallback', {
                    imageUrl: pageImage.src,
                    language: 'ar'
                  }, { timeout: 90000, retries: 1 });
                  
                  if (!isRunningRef.current) break;
                  
                  const fallbackText = fallbackResult.text || '';
                  const fallbackConfidence = fallbackResult.confidence || 0.6;
                  
                  // Use fallback if it's better
                  if (fallbackConfidence > ocrConfidence || fallbackText.length > ocrText.length * 1.2) {
                    ocrText = fallbackText;
                    ocrConfidence = fallbackConfidence;
                    ocrResult = fallbackResult;
                    addLog(`🎯 Page ${pageNum}: Fallback OCR better (${(fallbackConfidence * 100).toFixed(1)}% confidence)`);
                  }
                } catch (fallbackError) {
                  addLog(`⚠️ Page ${pageNum}: Fallback OCR failed, using original`);
                }
              }
              
            } catch (ocrError) {
              // Fallback to Gemini Pro Vision OCR
              try {
                addLog(`🔄 Page ${pageNum}: Gemini Flash OCR failed, trying Gemini Pro Vision fallback...`);
                const fallbackResult = await callFunction('ocr-fallback', {
                  imageUrl: pageImage.src,
                  language: 'ar'
                }, { timeout: 90000, retries: 1 }); // 1.5 minute timeout for fallback OCR
                
                // Check if processing was stopped during fallback OCR
                if (!isRunningRef.current) {
                  addLog("⏹️ Processing stopped during fallback OCR");
                  break;
                }
                
                ocrText = fallbackResult.text || '';
                ocrConfidence = fallbackResult.confidence || 0.6;
                ocrResult = fallbackResult; // Store fallback result
                addLog(`✅ Page ${pageNum}: Fallback OCR completed (${(ocrConfidence * 100).toFixed(1)}% confidence)`);
              } catch (fallbackError) {
                addLog(`❌ Page ${pageNum}: All OCR methods failed - ${fallbackError.message || fallbackError}`);
                setPageResults(prev => [...prev, {
                  pageNumber: pageNum,
                  isContent: true,
                  ocrSuccess: false,
                  ocrConfidence: 0,
                  summarySuccess: false,
                  summaryConfidence: 0,
                  repairAttempted: false,
                  repairSuccessful: false,
                  processingTimeMs: Date.now() - pageStartTime
                }]);
                setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
                continue;
              }
            }
          }

          // Clean OCR text if enabled
          let cleanedOcrText = ocrText;
          if (processingConfig.enableOcrCleaning && ocrText) {
            const cleaningResult = cleanOcrText(ocrText, { detectLanguage: 'ar' });
            cleanedOcrText = cleaningResult.cleanedText;
            if (cleaningResult.improvements.length > 0) {
              addLog(`🧹 Page ${pageNum}: Text cleaned - ${cleaningResult.improvements.join(', ')}`);
            }
          }

          // Detect non-content pages and skip if enabled
          if (processingConfig.skipNonContentPages && cleanedOcrText) {
            const contentCheck = detectNonContentPage(cleanedOcrText);
            if (contentCheck.isNonContent) {
              addLog(`⏭️ Page ${pageNum}: Detected ${contentCheck.pageType} page (${(contentCheck.confidence * 100).toFixed(1)}% confidence) - ${contentCheck.reason}`);
              setPageResults(prev => [...prev, {
                pageNumber: pageNum,
                isContent: false,
                ocrSuccess: true,
                ocrConfidence,
                summarySuccess: false,
                summaryConfidence: 0,
                repairAttempted: false,
                repairSuccessful: false,
                processingTimeMs: Date.now() - pageStartTime
              }]);
              setStatus(prev => ({ ...prev, nonContentSkipped: prev.nonContentSkipped + 1 }));
              
              // Add jittered delay even for skipped pages
              if (processingConfig.enableJitteredDelay) {
                await addJitteredDelay(processingConfig.minDelayMs / 2, processingConfig.maxDelayMs / 2);
              }
              continue;
            }
          }

          // Generate summary if no summary exists or if we're not skipping processed pages
          let summary = (skipProcessed ? existingData?.summary_md : '') || '';
          let summaryConfidence = 0.8;
          let qualityResult = null;
          let finalSummary = summary;

          if ((!summary && cleanedOcrText) || (!skipProcessed && cleanedOcrText)) {
            addLog(`📝 Page ${pageNum}: Generating summary...`);
            
            try {
              const summaryResult = await callFunction('summarize', {
                text: cleanedOcrText, // Use cleaned text
                lang: 'ar',
                page: pageNum,
                title: selectedBook.title,
                ocrData: ocrResult // Pass the full OCR result with page context
              }, { timeout: 180000, retries: 1 }); // 3 minute timeout, 1 retry for summarization
              
              // Check if processing was stopped during summary generation
              if (!isRunningRef.current) {
                addLog("⏹️ Processing stopped during summary generation");
                break;
              }
              
              summary = summaryResult.summary || '';
              addLog(`✅ Page ${pageNum}: Initial summary generated (${summary.length} chars)`);
              
              // Run quality gate if enabled
              if (processingConfig.enableQualityGate && summary) {
                addLog(`🛡️ Page ${pageNum}: Running quality gate...`);
                
                try {
                  qualityResult = await runQualityGate(
                    cleanedOcrText,
                    summary,
                    ocrConfidence,
                    {
                      originalText: cleanedOcrText,
                      ocrData: ocrResult,
                      pageNumber: pageNum,
                      bookTitle: selectedBook.title,
                      language: 'ar'
                    },
                    qualityGateOptions
                  );
                  
                  // Update activity to prevent frozen status
                  setStatus(prev => ({ ...prev, lastActivity: new Date() }));
                  
                  // Check if processing was stopped during quality gate
                  if (!isRunningRef.current) {
                    addLog("⏹️ Processing stopped during quality gate");
                    break;
                  }
                  
                  // Handle network errors gracefully
                  if (qualityResult.networkError) {
                    addLog(`⚠️ Page ${pageNum}: Quality gate completed with network issues - continuing with original summary`);
                  }
                } catch (qualityGateError) {
                  addLog(`⚠️ Page ${pageNum}: Quality gate failed - ${qualityGateError.message || qualityGateError}`);
                  // Create a fallback quality result
                  qualityResult = {
                    passed: true, // Allow processing to continue
                    ocrConfidence,
                    summaryConfidence: 0.7, // Reasonable default
                    confidenceMeta: {
                      coverage: 0.7,
                      lengthFit: 0.7,
                      structure: 0.7,
                      repetitionPenalty: 0.7,
                      ocrQuality: ocrConfidence,
                      final: 0.7
                    },
                    needsRepair: false,
                    repairAttempted: false,
                    repairSuccessful: false,
                    logs: [`Quality gate failed: ${qualityGateError.message || qualityGateError}`]
                  };
                  // Update activity even on failure
                  setStatus(prev => ({ ...prev, lastActivity: new Date() }));
                }
                
                summaryConfidence = qualityResult.summaryConfidence;
                
                // Store quality metrics for real-time display
                setQualityMetrics(prev => [...prev, {
                  pageNumber: pageNum,
                  qualityResult,
                  timestamp: new Date()
                }]);
                
                // Update quality statistics
                setStatus(prev => {
                  const newQualityPasses = prev.qualityPasses + (qualityResult.passed ? 1 : 0);
                  const newQualityFailures = prev.qualityFailures + (qualityResult.passed ? 0 : 1);
                  const totalQualityChecks = newQualityPasses + newQualityFailures;
                  const newAverageQuality = totalQualityChecks > 0 
                    ? (prev.averageQuality * (totalQualityChecks - 1) + qualityResult.summaryConfidence) / totalQualityChecks
                    : 0;
                  
                  return {
                    ...prev,
                    qualityPasses: newQualityPasses,
                    qualityFailures: newQualityFailures,
                    averageQuality: newAverageQuality
                  };
                });
                
                if (qualityResult.repairAttempted) {
                  setStatus(prev => ({ 
                    ...prev, 
                    repairAttempts: prev.repairAttempts + 1,
                    repairSuccesses: prev.repairSuccesses + (qualityResult.repairSuccessful ? 1 : 0)
                  }));
                  
                  if (qualityResult.repairSuccessful && qualityResult.repairedSummary) {
                    finalSummary = qualityResult.repairedSummary;
                    summaryConfidence = qualityResult.repairedConfidence || summaryConfidence;
                    addLog(`🔧 Page ${pageNum}: Summary repaired successfully (${(summaryConfidence * 100).toFixed(1)}% confidence)`);
                  } else {
                    finalSummary = summary;
                    addLog(`⚠️ Page ${pageNum}: Summary repair failed, using original`);
                  }
                } else if (qualityResult.passed) {
                  finalSummary = summary;
                  addLog(`✅ Page ${pageNum}: Summary quality acceptable (${(summaryConfidence * 100).toFixed(1)}% confidence)`);
                } else {
                  finalSummary = summary;
                  addLog(`⚠️ Page ${pageNum}: Summary below quality threshold but no repair attempted`);
                }
                
                // Log quality gate details if rich logging enabled
                if (processingConfig.richLogging) {
                  qualityResult.logs.forEach(log => addLog(`📊 Page ${pageNum}: ${log}`));
                }
              } else {
                finalSummary = summary;
                summaryConfidence = 0.8; // Default confidence
              }
              
            } catch (summaryError) {
              addLog(`❌ Page ${pageNum}: Summary generation failed - ${summaryError.message || summaryError}`);
              setPageResults(prev => [...prev, {
                pageNumber: pageNum,
                isContent: true,
                ocrSuccess: true,
                ocrConfidence,
                summarySuccess: false,
                summaryConfidence: 0,
                repairAttempted: false,
                repairSuccessful: false,
                processingTimeMs: Date.now() - pageStartTime
              }]);
              setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
              continue;
            }
          } else {
            finalSummary = summary;
          }

          // Save to database if we have new content or if we're reprocessing
          const shouldSave = (cleanedOcrText && !existingData?.ocr_text) || 
                           (finalSummary && !existingData?.summary_md) || 
                           !skipProcessed;
          
           if (shouldSave) {
            try {
              const saveResult = await callFunction('save-page-summary', {
                book_id: selectedBookId,
                page_number: pageNum,
                ocr_text: cleanedOcrText || ocrText, // Save cleaned text
                summary_md: finalSummary,
                ocr_confidence: ocrConfidence,
                confidence: summaryConfidence
              });

              console.log(`Save result for page ${pageNum}:`, saveResult);
              
              let embeddingInfo = '';
              if (saveResult?.embedding) {
                embeddingInfo = ` (✓ Embedding: ${saveResult.embedding.dimensions}D)`;
              } else if (cleanedOcrText || ocrText) {
                embeddingInfo = ' (⚠️ Embedding: Failed)';
              }

              addLog(`💾 Page ${pageNum}: Saved to database${embeddingInfo}`);
            } catch (saveError) {
              addLog(`❌ Page ${pageNum}: Failed to save - ${saveError.message}`);
              setPageResults(prev => [...prev, {
                pageNumber: pageNum,
                isContent: true,
                ocrSuccess: true,
                ocrConfidence,
                summarySuccess: false,
                summaryConfidence,
                repairAttempted: qualityResult?.repairAttempted || false,
                repairSuccessful: qualityResult?.repairSuccessful || false,
                processingTimeMs: Date.now() - pageStartTime,
                embeddingSuccess: false,
                embeddingDimensions: 0
              }]);
              setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
              continue;
            }
          }

          // Record successful processing
          const saveResult = await callFunction('save-page-summary', {
            book_id: selectedBookId,
            page_number: pageNum,
            ocr_text: cleanedOcrText || ocrText,
            summary_md: finalSummary,
            ocr_confidence: ocrConfidence,
            confidence: summaryConfidence
          });

          setPageResults(prev => [...prev, {
            pageNumber: pageNum,
            isContent: true,
            ocrSuccess: true,
            ocrConfidence,
            summarySuccess: !!finalSummary,
            summaryConfidence,
            repairAttempted: qualityResult?.repairAttempted || false,
            repairSuccessful: qualityResult?.repairSuccessful || false,
            processingTimeMs: Date.now() - pageStartTime,
            embeddingSuccess: !!saveResult?.embedding,
            embeddingDimensions: saveResult?.embedding?.dimensions || 0
          }]);

          setStatus(prev => ({ ...prev, processed: prev.processed + 1 }));

          // Add jittered delay to prevent overwhelming APIs
          if (processingConfig.enableJitteredDelay) {
            await addJitteredDelay(processingConfig.minDelayMs, processingConfig.maxDelayMs);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          addLog(`❌ Page ${pageNum}: Error - ${error.message || error}`);
          setPageResults(prev => [...prev, {
            pageNumber: pageNum,
            isContent: true,
            ocrSuccess: false,
            ocrConfidence: 0,
            summarySuccess: false,
            summaryConfidence: 0,
            repairAttempted: false,
            repairSuccessful: false,
            processingTimeMs: Date.now() - pageStartTime,
            embeddingSuccess: false,
            embeddingDimensions: 0
          }]);
          setStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
        }
      }

      if (isRunningRef.current) {
        const duration = Date.now() - (status.startTime?.getTime() || 0);
        const stats = generateProcessingStats(pageResults);
        const statsText = formatProcessingStats(stats);
        
        addLog(`🎉 Processing completed in ${Math.round(duration / 1000)}s`);
        addLog(statsText);
        toast.success("Book processing completed successfully!");
      }

    } catch (error) {
      addLog(`💥 Fatal error: ${error}`);
      toast.error("Processing failed with fatal error");
    } finally {
      isRunningRef.current = false;
      setStatus(prev => ({ ...prev, isRunning: false }));
    }
  };

  const stopProcessing = () => {
    isRunningRef.current = false;
    setStatus(prev => ({ ...prev, isRunning: false }));
    addLog("⏹️ Processing stopped by user");
    toast.info("Processing stopped");
  };

  const progress = status.totalPages > 0 ? (status.currentPage / status.totalPages) * 100 : 0;
  
  // Calculate activity status
  const getActivityStatus = () => {
    if (!status.isRunning) return 'idle';
    if (!status.lastActivity) return 'starting';
    
    const timeSinceActivity = currentTime.getTime() - status.lastActivity.getTime();
    const inactiveThreshold = 30000; // 30 seconds
    const frozenThreshold = 120000; // 2 minutes
    
    if (timeSinceActivity > frozenThreshold) return 'frozen';
    if (timeSinceActivity > inactiveThreshold) return 'inactive';
    return 'active';
  };
  
  const activityStatus = getActivityStatus();
  const timeSinceActivity = status.lastActivity 
    ? Math.floor((currentTime.getTime() - status.lastActivity.getTime()) / 1000)
    : 0;

  return (
    <>
      <DynamicSEOHead
        customTitle="Admin Book Processing - Saudi Educational Platform"
        customDescription="Admin panel for processing and summarizing educational book content"
      />
      
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Admin Navigation */}
        <div className="flex items-center gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="w-4 h-4" />
            Admin Panel:
          </div>
          <Link to="/admin/processing">
            <Button variant="ghost" size="sm" className="h-8">
              Book Processing
            </Button>
          </Link>
          <Link to="/admin/rag">
            <Button variant="ghost" size="sm" className="h-8">
              <Database className="w-4 h-4 mr-1" />
              RAG System
            </Button>
          </Link>
        </div>
        
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
          {/* Add New Book to Library */}
          <AddBookForm 
            rtl={true}
            onBookAdded={(bookId) => {
              // Navigate to processing page for the new book
              navigate(`/admin/processing?bookId=${bookId}`);
              // Refresh available books
              const loadBooks = async () => {
                try {
                  const dbBooks = await fetchBooks();
                  const enhancedDbBooks = dbBooks.map(book => ({
                    ...book,
                    slug: book.slug || book.id,
                    cover: book.cover_image_url || "/placeholder.svg",
                    description: book.description || `كتاب ${book.title}`,
                    keywords: [],
                    lessons: [],
                    totalPages: book.total_pages
                  }));
                  
                  const allBooks = [...enhancedDbBooks, ...enhancedBooks.filter(eb => 
                    !enhancedDbBooks.some(db => db.id === eb.id)
                  )];
                  
                  setAvailableBooks(allBooks);
                  setSelectedBookId(bookId);
                } catch (error) {
                  console.error('Failed to refresh books:', error);
                }
              };
              loadBooks();
            }}
          />

          {/* Verification Tests */}
          <ProcessingVerification />

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
                <SelectContent className="z-50 bg-background border shadow-lg max-h-60 overflow-y-auto">
                  {availableBooks.map((book) => (
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

          {/* Advanced Processing Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Processing Configuration
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQualitySettings(!showQualitySettings)}
                    disabled={status.isRunning}
                  >
                    Quality Gate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    disabled={status.isRunning}
                  >
                    {showAdvancedSettings ? 'Hide' : 'Show'} Advanced
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basic Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      OCR Text Cleaning
                    </label>
                    <div className="text-xs text-muted-foreground">
                      Fix hyphenation, merge lines, normalize text
                    </div>
                  </div>
                  <Switch
                    checked={processingConfig.enableOcrCleaning}
                    onCheckedChange={(checked) =>
                      setProcessingConfig(prev => ({ ...prev, enableOcrCleaning: checked }))
                    }
                    disabled={status.isRunning}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Quality Gate & Repair
                    </label>
                    <div className="text-xs text-muted-foreground">
                      Auto-repair low quality summaries
                    </div>
                  </div>
                  <Switch
                    checked={processingConfig.enableQualityGate}
                    onCheckedChange={(checked) =>
                      setProcessingConfig(prev => ({ ...prev, enableQualityGate: checked }))
                    }
                    disabled={status.isRunning}
                  />
                </div>
              </div>

              {showAdvancedSettings && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Jittered Delays</label>
                        <div className="text-xs text-muted-foreground">
                          Random delays between API calls
                        </div>
                      </div>
                      <Switch
                        checked={processingConfig.enableJitteredDelay}
                        onCheckedChange={(checked) =>
                          setProcessingConfig(prev => ({ ...prev, enableJitteredDelay: checked }))
                        }
                        disabled={status.isRunning}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Skip Non-Content</label>
                        <div className="text-xs text-muted-foreground">
                          Skip TOC, cover, index pages
                        </div>
                      </div>
                      <Switch
                        checked={processingConfig.skipNonContentPages}
                        onCheckedChange={(checked) =>
                          setProcessingConfig(prev => ({ ...prev, skipNonContentPages: checked }))
                        }
                        disabled={status.isRunning}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Alternative OCR</label>
                        <div className="text-xs text-muted-foreground">
                          Try multiple OCR engines
                        </div>
                      </div>
                      <Switch
                        checked={processingConfig.alternativeOcrMode}
                        onCheckedChange={(checked) =>
                          setProcessingConfig(prev => ({ ...prev, alternativeOcrMode: checked }))
                        }
                        disabled={status.isRunning}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Rich Logging</label>
                        <div className="text-xs text-muted-foreground">
                          Detailed processing logs
                        </div>
                      </div>
                      <Switch
                        checked={processingConfig.richLogging}
                        onCheckedChange={(checked) =>
                          setProcessingConfig(prev => ({ ...prev, richLogging: checked }))
                        }
                        disabled={status.isRunning}
                      />
                    </div>
                  </div>

                  {processingConfig.enableJitteredDelay && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Min Delay (ms)</label>
                        <Input
                          type="number"
                          min={100}
                          max={5000}
                          value={processingConfig.minDelayMs}
                          onChange={(e) =>
                            setProcessingConfig(prev => ({ 
                              ...prev, 
                              minDelayMs: Math.max(100, parseInt(e.target.value) || 100) 
                            }))
                          }
                          disabled={status.isRunning}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Max Delay (ms)</label>
                        <Input
                          type="number"
                          min={processingConfig.minDelayMs}
                          max={10000}
                          value={processingConfig.maxDelayMs}
                          onChange={(e) =>
                            setProcessingConfig(prev => ({ 
                              ...prev, 
                              maxDelayMs: Math.max(prev.minDelayMs, parseInt(e.target.value) || 1000) 
                            }))
                          }
                          disabled={status.isRunning}
                        />
                      </div>
                    </div>
                  )}

                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Enhanced Processing:</strong> These settings improve summarization quality through text cleaning, 
                      quality gates with automatic repair, intelligent page detection, and adaptive API pacing.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Quality Gate Settings */}
              {showQualitySettings && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <h4 className="font-medium text-blue-600">Quality Gate Configuration</h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Min OCR Confidence</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={qualityGateOptions.minOcrConfidence}
                        onChange={(e) =>
                          setQualityGateOptions(prev => ({ 
                            ...prev, 
                            minOcrConfidence: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) 
                          }))
                        }
                        disabled={status.isRunning}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Minimum OCR quality to proceed (0.0-1.0)
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Min Summary Confidence</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={qualityGateOptions.minSummaryConfidence}
                        onChange={(e) =>
                          setQualityGateOptions(prev => ({ 
                            ...prev, 
                            minSummaryConfidence: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) 
                          }))
                        }
                        disabled={status.isRunning}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Minimum summary quality to accept (0.0-1.0)
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Repair Threshold</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={qualityGateOptions.repairThreshold}
                        onChange={(e) =>
                          setQualityGateOptions(prev => ({ 
                            ...prev, 
                            repairThreshold: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) 
                          }))
                        }
                        disabled={status.isRunning}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Quality below this triggers repair (0.0-1.0)
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Max Repair Attempts</label>
                      <Input
                        type="number"
                        min={0}
                        max={3}
                        value={qualityGateOptions.maxRepairAttempts}
                        onChange={(e) =>
                          setQualityGateOptions(prev => ({ 
                            ...prev, 
                            maxRepairAttempts: Math.max(0, Math.min(3, parseInt(e.target.value) || 0)) 
                          }))
                        }
                        disabled={status.isRunning}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Maximum repair attempts per page (0-3)
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Enable Repair</label>
                      <div className="text-xs text-muted-foreground">
                        Automatically repair low-quality summaries
                      </div>
                    </div>
                    <Switch
                      checked={qualityGateOptions.enableRepair}
                      onCheckedChange={(checked) =>
                        setQualityGateOptions(prev => ({ ...prev, enableRepair: checked }))
                      }
                      disabled={status.isRunning}
                    />
                  </div>
                  
                  <Alert>
                    <Shield className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Quality Gate:</strong> Monitors summary quality using coverage, structure, length, and repetition metrics. 
                      Summaries below the repair threshold are automatically improved.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
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

                {/* Activity Status Indicator */}
                {status.isRunning && (
                  <div className={`flex items-center justify-between p-3 rounded-lg border ${
                    activityStatus === 'active' ? 'bg-green-50 border-green-200' :
                    activityStatus === 'inactive' ? 'bg-yellow-50 border-yellow-200' :
                    activityStatus === 'frozen' ? 'bg-red-50 border-red-200' :
                    'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        activityStatus === 'active' ? 'bg-green-500 animate-pulse' :
                        activityStatus === 'inactive' ? 'bg-yellow-500' :
                        activityStatus === 'frozen' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}></div>
                      <span className="text-sm font-medium">
                        {activityStatus === 'active' ? 'Processing Active' :
                         activityStatus === 'inactive' ? 'Processing (Inactive)' :
                         activityStatus === 'frozen' ? 'Processing Frozen' :
                         'Starting...'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {status.lastActivity ? 
                        `Last activity: ${timeSinceActivity}s ago` : 
                        'Initializing...'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid grid-cols-2 gap-2">
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
                    
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-purple-600">
                        <RefreshCw className="w-4 h-4" />
                        <span className="font-semibold">{status.repairAttempts}</span>
                      </div>
                      <p className="text-xs text-purple-600">Repairs</p>
                    </div>
                  </div>
                  
                  {/* Quality Gate Metrics */}
                  {processingConfig.enableQualityGate && (
                    <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Shield className="w-4 h-4" />
                        <span className="font-semibold text-sm">Quality Gate</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-green-600 font-semibold">{status.qualityPasses}</span>
                          <span className="text-muted-foreground"> passed</span>
                        </div>
                        <div>
                          <span className="text-red-600 font-semibold">{status.qualityFailures}</span>
                          <span className="text-muted-foreground"> failed</span>
                        </div>
                        <div>
                          <span className="text-purple-600 font-semibold">{status.repairSuccesses}</span>
                          <span className="text-muted-foreground"> repaired</span>
                        </div>
                        <div>
                          <span className="text-blue-600 font-semibold">{(status.averageQuality * 100).toFixed(0)}%</span>
                          <span className="text-muted-foreground"> avg quality</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {status.startTime && (
                  <p className="text-sm text-muted-foreground">
                    Started at {status.startTime.toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Page Processing Results */}
          {pageResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Page Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {pageResults.slice(-10).reverse().map((result) => (
                    <div key={result.pageNumber} className={`p-3 rounded-lg border flex items-center justify-between ${
                      result.ocrSuccess && result.summarySuccess 
                        ? 'bg-green-50 border-green-200' 
                        : result.ocrSuccess 
                        ? 'bg-yellow-50 border-yellow-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">Page {result.pageNumber}</span>
                        <div className="flex gap-1">
                          {result.ocrSuccess ? (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                              OCR ✓
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              OCR ✗
                            </Badge>
                          )}
                          {result.summarySuccess ? (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              Summary ✓
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Summary ✗
                            </Badge>
                          )}
                          {result.embeddingSuccess ? (
                            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                              Embedding ✓ ({result.embeddingDimensions}D)
                            </Badge>
                          ) : result.ocrSuccess ? (
                            <Badge variant="outline" className="text-xs text-orange-600">
                              Embedding ✗
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(result.processingTimeMs / 1000).toFixed(1)}s
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quality Metrics Details */}
          {processingConfig.enableQualityGate && qualityMetrics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Quality Gate Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {qualityMetrics.slice(-5).map((metric) => { // Show last 5 pages
                    if (!metric.qualityResult) return null;
                    const qr = metric.qualityResult;
                    
                    return (
                      <div key={metric.pageNumber} className={`p-3 rounded-lg border ${
                        qr.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Page {metric.pageNumber}</span>
                          <div className="flex items-center gap-2">
                            {qr.passed ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">Passed</Badge>
                            ) : (
                              <Badge variant="destructive" className="bg-red-100 text-red-800">Failed</Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {(qr.summaryConfidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Coverage:</span>
                            <span className="ml-1 font-medium">{(qr.confidenceMeta.coverage * 100).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Length:</span>
                            <span className="ml-1 font-medium">{(qr.confidenceMeta.lengthFit * 100).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Structure:</span>
                            <span className="ml-1 font-medium">{(qr.confidenceMeta.structure * 100).toFixed(0)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">OCR Quality:</span>
                            <span className="ml-1 font-medium">{(qr.confidenceMeta.ocrQuality * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        
                        {qr.repairAttempted && (
                          <div className="mt-2 text-xs">
                            <Badge variant="outline" className={qr.repairSuccessful ? "text-green-600" : "text-red-600"}>
                              Repair {qr.repairSuccessful ? 'Success' : 'Failed'}
                              {qr.repairSuccessful && qr.repairedConfidence && 
                                ` → ${(qr.repairedConfidence * 100).toFixed(1)}%`
                              }
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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