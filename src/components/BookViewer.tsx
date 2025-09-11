import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, Loader2, ChevronDown, Menu, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { runLocalOcr } from '@/lib/ocr/localOcr';
import { removeBackgroundFromBlob, captionImageFromBlob } from '@/lib/vision';
import QAChat from "@/components/QAChat";
import MathRenderer from "@/components/MathRenderer";
import { callFunction } from "@/lib/functionsClient";
import { centralizeSummarize } from "@/lib/summarization/summarizeHelper";
import { supabase } from "@/integrations/supabase/client";
import { LoadingProgress } from "@/components/LoadingProgress";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ThumbnailSidebar } from "@/components/ThumbnailSidebar";
import { FullscreenMode, FullscreenButton, useFullscreen } from "./FullscreenMode";
import { ZoomControls, ZoomMode } from "@/components/ZoomControls";
import { MiniMap } from "@/components/MiniMap";
import { useImagePreloader } from "@/hooks/useImagePreloader";
import { EnhancedSummary } from "@/components/EnhancedSummary";
import { ImprovedErrorHandler } from "@/components/ImprovedErrorHandler";
import { AccessibilityPanel } from "@/components/AccessibilityPanel";
import { TouchGestureHandler } from "@/components/TouchGestureHandler";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
import { ContinuousReader, ContinuousReaderRef } from "@/components/reader/ContinuousReader";
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileControlsOverlay } from "@/components/reader/MobileControlsOverlay";
import { MobileReaderChrome } from "@/components/reader/MobileReaderChrome";
import { HenryLawCalculator } from "@/components/HenryLawCalculator";
import { IndexableOCRContent } from "@/components/seo/IndexableOCRContent";
import { retrieveRAGContext, buildRAGPrompt, DEFAULT_RAG_OPTIONS, type RAGOptions } from "@/lib/rag/ragUtils";

export type BookPage = {
  src: string;
  alt: string;
};

type Labels = {
  previous?: string;
  next?: string;
  notesTitle?: (pageNumber: number) => string;
  autosaves?: string;
  clear?: string;
  copy?: string;
  toastCopied?: string;
  toastCopyFailed?: string;
  toastCleared?: string;
  progress?: (current: number, total: number, pct: number) => string;
};

interface BookViewerProps {
  pages: BookPage[];
  title?: string;
  rtl?: boolean;
  labels?: Labels;
  bookId?: string;
}

export const BookViewer: React.FC<BookViewerProps> = ({
  pages,
  title = "Book",
  rtl = false,
  labels = {},
  bookId
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get initial page from URL params or localStorage
  const getInitialPage = () => {
    const urlPage = parseInt(searchParams.get('page') || '1');
    if (urlPage >= 1 && urlPage <= pages.length) {
      return urlPage - 1; // Convert to 0-based index
    }
    
    // Fallback to localStorage
    try {
      const cacheId = bookId || title;
      const lastPage = localStorage.getItem(`book:lastPage:${cacheId}`);
      const pageNum = lastPage ? parseInt(lastPage, 10) : 0;
      return Math.max(0, Math.min(pageNum, pages.length - 1));
    } catch {
      return 0;
    }
  };

  const [index, setIndex] = useState(getInitialPage);
  const [zoom, setZoom] = useState(1);
  const Z = { min: 0.25, max: 4, step: 0.1 } as const;
  const total = pages.length;
  const navigate = useNavigate();
  const { toggleFullscreen } = useFullscreen(rtl);
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomApiRef = useRef<any>(null);
  const [transformState, setTransformState] = useState({
    scale: 1,
    positionX: 0,
    positionY: 0
  });
  const [isPanning, setIsPanning] = useState(false);

  const L = {
    previous: labels.previous ?? "Previous",
    next: labels.next ?? "Next",
    notesTitle: labels.notesTitle ?? ((n: number) => `Notes for page ${n}`),
    autosaves: labels.autosaves ?? "Autosaves locally",
    clear: labels.clear ?? "Clear",
    copy: labels.copy ?? "Copy",
    toastCopied: labels.toastCopied ?? "Note copied to clipboard",
    toastCopyFailed: labels.toastCopyFailed ?? "Unable to copy note",
    toastCleared: labels.toastCleared ?? "Notes cleared for this page",
    progress: labels.progress ?? ((c: number, t: number, p: number) => `Page ${c} of ${t} • ${p}%`)
  } as const;

  // Caching and state management
  const cacheId = useMemo(() => bookId || title, [bookId, title]);
  const ocrKey = useMemo(() => `book:ocr:${cacheId}:${index}`, [cacheId, index]);
  const sumKey = useMemo(() => `book:summary:${cacheId}:${index}`, [cacheId, index]);
  const dbBookId = useMemo(() => bookId || title || 'book', [bookId, title]);
  
  const [summary, setSummary] = useState("");
  const [summLoading, setSummLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // UI state
  const [zoomMode, setZoomMode] = useState<ZoomMode>("custom");
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
  const [naturalSize, setNaturalSize] = useState({ width: 800, height: 1100 });
  const [readerMode, setReaderMode] = useState<'page' | 'continuous'>("page");
  const continuousRef = useRef<ContinuousReaderRef | null>(null);

  // Image loading
  const { getPreloadStatus } = useImagePreloader(pages, index);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [pageProgress, setPageProgress] = useState(0);

  // Error handling
  const [lastError, setLastError] = useState<Error | string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [summaryConfidence, setSummaryConfidence] = useState<number | undefined>();
  const [ocrQuality, setOcrQuality] = useState<number | undefined>();

  // Mobile
  const isMobile = useIsMobile();
  const insightsRef = useRef<HTMLDivElement | null>(null);
  const [gotoInput, setGotoInput] = useState<string>("");
  const [controlsOpen, setControlsOpen] = useState(true);
  const [insightTab, setInsightTab] = useState<'summary' | 'qa'>('summary');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // RAG state - persisted in localStorage, default OFF for safety
  const [ragEnabled, setRagEnabled] = useState(() => {
    try {
      return localStorage.getItem('bookviewer:rag:enabled') === 'true';
    } catch {
      return false;
    }
  });
  
  // Track last RAG context usage
  const [lastRagPagesUsed, setLastRagPagesUsed] = useState(0);
  const [storedRagMetadata, setStoredRagMetadata] = useState<any>(null);
  const [ragPagesSent, setRagPagesSent] = useState<number>(0);

  // Navigation functions with URL sync
  const updatePageInUrl = useCallback((pageIndex: number) => {
    const pageNumber = pageIndex + 1; // Convert to 1-based
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', pageNumber.toString());
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const goPrev = useCallback(() => {
    setIndex(i => {
      const newIndex = Math.max(0, i - 1);
      updatePageInUrl(newIndex);
      return newIndex;
    });
  }, [updatePageInUrl]);
  
  const goNext = useCallback(() => {
    setIndex(i => {
      const newIndex = Math.min(total - 1, i + 1);
      updatePageInUrl(newIndex);
      return newIndex;
    });
  }, [total, updatePageInUrl]);
  
  const jumpToPage = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), total);
    const newIndex = clamped - 1;
    setIndex(newIndex);
    updatePageInUrl(newIndex);
  }, [total, updatePageInUrl]);

  // Zoom functions
  const zoomIn = useCallback(() => {
    if (zoomApiRef.current) {
      zoomApiRef.current.zoomIn(Z.step);
    }
  }, []);
  
  const zoomOut = useCallback(() => {
    if (zoomApiRef.current) {
      zoomApiRef.current.zoomOut(Z.step);
    }
  }, []);
  
  const resetZoom = useCallback(() => {
    if (zoomApiRef.current) {
      zoomApiRef.current.resetTransform();
    }
  }, []);
  
  // Advanced zoom functions for ZoomControls
  const centerImage = useCallback(() => {
    if (zoomApiRef.current) {
      zoomApiRef.current.resetTransform();
      setZoomMode("custom");
    }
  }, []);
  
  const fitToWidth = useCallback(() => {
    if (!containerRef.current || !zoomApiRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const targetZoom = containerWidth / naturalSize.width;
    const clampedZoom = Math.max(Z.min, Math.min(Z.max, targetZoom));
    zoomApiRef.current.setTransform(0, 0, clampedZoom);
    setZoomMode("fit-width");
  }, [naturalSize.width]);
  
  const fitToHeight = useCallback(() => {
    if (!containerRef.current || !zoomApiRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const targetZoom = containerHeight / naturalSize.height;
    const clampedZoom = Math.max(Z.min, Math.min(Z.max, targetZoom));
    zoomApiRef.current.setTransform(0, 0, clampedZoom);
    setZoomMode("fit-height");
  }, [naturalSize.height]);
  
  const actualSize = useCallback(() => {
    if (zoomApiRef.current) {
      zoomApiRef.current.setTransform(0, 0, 1);
      setZoomMode("actual-size");
    }
  }, []);

  // Image loading effect
  useEffect(() => {
    let active = true;
    const nextSrc = pages[index]?.src;
    setDisplaySrc(null);
    setImageLoading(true);
    setPageProgress(0);

    if (!nextSrc) {
      setImageLoading(false);
      return;
    }

    const img = new Image();
    img.decoding = "async";
    img.src = nextSrc;
    
    console.log('DEBUG: Loading image for page', index + 1, 'src:', nextSrc);
    
    img.onload = () => {
      if (!active) return;
      console.log('DEBUG: Image loaded successfully for page', index + 1);
      setDisplaySrc(nextSrc);
      setImageLoading(false);
      setPageProgress(100);
    };
    
    img.onerror = () => {
      if (!active) return;
      console.log('DEBUG: Image failed to load for page', index + 1, 'src:', nextSrc);
      setImageLoading(false);
    };

    return () => { active = false; };
  }, [index, pages]);

  // Loading progress simulation
  useEffect(() => {
    if (!imageLoading) return;
    setPageProgress(0);
    const id = window.setInterval(() => {
      setPageProgress((prev) => {
        const next = prev + (prev < 60 ? 5 : prev < 80 ? 2 : 1);
        return Math.min(next, 90);
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [imageLoading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (e: KeyboardEvent) => {
      // Force regenerate OCR and summary: Cmd+Ctrl+D (Mac) or Ctrl+Alt+D (Windows/Linux)
      if ((e.metaKey && e.ctrlKey && e.key === 'd') || (e.ctrlKey && e.altKey && e.key === 'd')) {
        e.preventDefault();
        forceRegenerate();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => document.removeEventListener('keydown', handleKeyboardShortcuts);
  }, []);

  // Load cached data and fetch from DB
  useEffect(() => {
    try {
      const cachedText = localStorage.getItem(ocrKey) || "";
      const cachedSummary = localStorage.getItem(sumKey) || "";
      if (cachedText) setExtractedText(cachedText);
      if (cachedSummary) setSummary(cachedSummary);
      setLastError(null);
      setRetryCount(0);
      // Reset RAG metadata when page changes
      setStoredRagMetadata(null);
      setLastRagPagesUsed(0);
      setRagPagesSent(0);
    } catch {}
  }, [index, ocrKey, sumKey]);

  // Fetch from Supabase
  useEffect(() => {
    let cancelled = false;
    const fetchFromDb = async () => {
      console.log('BookViewer: Fetching from database:', { book_id: dbBookId, page_number: index + 1 });
      try {
        const { data, error } = await supabase
          .from('page_summaries')
          .select('ocr_text, summary_md, confidence, ocr_confidence, summary_json, rag_pages_sent')
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1)
          .maybeSingle();
          
        console.log('Database fetch result:', { data, error });
          
        if (error) {
          console.warn('Supabase fetch error:', error);
          return;
        }
        if (cancelled) return;
        
        const ocr = (data?.ocr_text ?? '').trim();
        const sum = (data?.summary_md ?? '').trim();
        
        console.log('Setting extracted text from database:', { 
          ocrLength: ocr.length, 
          summaryLength: sum.length,
          ocrPreview: ocr.substring(0, 100) + '...',
          summaryPreview: sum.substring(0, 100) + '...'
        });
        
        // Ensure we set the states properly - force update even if existing data
        if (ocr && ocr.length > 0) {
          console.log('Setting extracted text state...');
          setExtractedText(ocr);
        }
        if (sum && sum.length > 0) {
          console.log('Setting summary state with content:', sum.substring(0, 200) + '...');
          // Force state update with functional update to ensure it takes effect
          setSummary(prevSummary => {
            console.log('Previous summary length:', prevSummary.length, 'New summary length:', sum.length);
            return sum;
          });
          // Also stream it for better UX if the summary is substantial
          if (sum.length > 100) {
            setTimeout(() => {
              streamExistingSummary(sum).catch(err => console.warn('Stream failed:', err));
            }, 100);
          }
        }
        
        console.log('DEBUG: State update completed - OCR:', ocr.length, 'Summary:', sum.length);
        setSummaryConfidence(typeof data?.confidence === 'number' ? data.confidence : undefined);
        setOcrQuality(typeof data?.ocr_confidence === 'number' ? data.ocr_confidence : undefined);
        
        // Set RAG metadata from database
        const ragMeta = data?.summary_json;
        if (ragMeta && typeof ragMeta === 'object' && !Array.isArray(ragMeta)) {
          console.log('Setting stored RAG metadata from database:', ragMeta);
          setStoredRagMetadata(ragMeta);
          // Also update lastRagPagesUsed to show the stored value
          if (typeof ragMeta.ragPagesUsed === 'number') {
            setLastRagPagesUsed(ragMeta.ragPagesUsed);
          }
        } else {
          console.log('No RAG metadata found in database for this page');
          setStoredRagMetadata(null);
          setLastRagPagesUsed(0);
        }
        
        // Set RAG pages sent from database - use actual sent count
        if (typeof data?.rag_pages_sent === 'number') {
          setRagPagesSent(data.rag_pages_sent);
        } else {
          setRagPagesSent(0);
        }
        
        try {
          if (ocr) localStorage.setItem(ocrKey, ocr);
          else localStorage.removeItem(ocrKey);
          if (sum) localStorage.setItem(sumKey, sum);
          else localStorage.removeItem(sumKey);
        } catch {}
      } catch (e) {
        console.error('BookViewer: Failed to fetch page from DB:', e);
        console.error('BookViewer: Error details:', { 
          message: e instanceof Error ? e.message : 'Unknown error', 
          stack: e instanceof Error ? e.stack : undefined,
          dbBookId, 
          pageNumber: index + 1,
          errorCode: 'e8213cfbaf41bf3c1f76850cfa0af698'
        });
      }
    };
    fetchFromDb();
    return () => { cancelled = true; };
  }, [index, dbBookId, ocrKey, sumKey]);

  // Save current page to localStorage
  useEffect(() => {
    try {
      const cacheId = bookId || title;
      localStorage.setItem(`book:lastPage:${cacheId}`, index.toString());
    } catch (error) {
      console.warn('Failed to save last page:', error);
    }
  }, [index, bookId, title]);

  // OCR and Summarization functions
  // OCR text cleaning function
  const cleanOcrText = (text: string): string => {
    if (!text) return '';
    
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove isolated special characters
      .replace(/\s[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\w\d\s.,!?()[\]{}:;\"'-]+\s/g, ' ')
      // Clean up common OCR artifacts
      .replace(/[|\\\/`~]/g, '')
      // Fix common Arabic OCR issues
      .replace(/\u200F|\u200E/g, '') // Remove RTL/LTR marks
      .replace(/\u061C/g, '') // Remove Arabic letter mark
      // Normalize Arabic digits
      .replace(/[٠-٩]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 1632 + 48))
      // Remove redundant punctuation
      .replace(/[.]{2,}/g, '.')
      .replace(/[,]{2,}/g, ',')
      // Clean up line breaks
      .replace(/\n\s*\n/g, '\n')
      .trim();
  };

  // OCR scoring function for result selection
  const calculateOcrScore = (result: { text: string; confidence?: number }): number => {
    if (!result?.text) return 0;
    
    const text = result.text;
    const confidence = result.confidence || 0;
    const length = text.length;
    
    // Base score from confidence and length
    let score = confidence + (Math.min(length, 500) / 10);
    
    // Bonus for Arabic text presence
    const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    if (arabicChars > 0) score += arabicChars / 5;
    
    // Bonus for complete words
    const arabicWords = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    score += (arabicWords + englishWords) * 2;
    
    // Penalty for excessive artifacts
    const artifacts = (text.match(/[|\\\/`~_]{2,}/g) || []).length;
    score -= artifacts * 10;
    
    // Penalty for too many isolated characters
    const isolatedChars = (text.match(/\s.\s/g) || []).length;
    score -= isolatedChars * 5;
    
    return score;
  };

  // RAG Helper Functions
  const toggleRag = useCallback(() => {
    const newValue = !ragEnabled;
    setRagEnabled(newValue);
    try {
      localStorage.setItem('bookviewer:rag:enabled', newValue.toString());
    } catch (error) {
      console.warn('Failed to save RAG preference:', error);
    }
    console.log('RAG toggled:', newValue ? 'enabled' : 'disabled');
  }, [ragEnabled]);

  // Debug helper function - can be called from browser console
  const backfillEmbeddings = useCallback(async () => {
    if (!dbBookId) {
      console.error('No book ID available');
      return;
    }
    
    console.log('🚀 Starting embedding backfill for book:', dbBookId);
    try {
      const result = await callFunction('backfill-embeddings', {
        book_id: dbBookId,
        batch_size: 3
      });
      console.log('✅ Backfill completed:', result);
      toast.success('Embeddings generated successfully!');
    } catch (error) {
      console.error('❌ Backfill failed:', error);
      toast.error('Failed to generate embeddings');
    }
  }, [dbBookId]);

  // Make function available globally for debugging
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).backfillEmbeddings = backfillEmbeddings;
      console.log('📝 Debug function available: window.backfillEmbeddings()');
    }
  }, [backfillEmbeddings]);

  // Helper function to generate embedding for current page after OCR
  const generateEmbeddingForCurrentPage = useCallback(async (ocrText: string) => {
    console.log('🔍 DEBUG: generateEmbeddingForCurrentPage called with:', { ocrText: ocrText?.substring(0, 100) + '...', ocrTextLength: ocrText?.length, dbBookId, pageNumber: index + 1 });
    
    if (!ocrText || !dbBookId || ocrText.length < 50) {
      console.log('🚫 Skipping embedding generation:', { hasOcrText: !!ocrText, hasDbBookId: !!dbBookId, textLength: ocrText?.length });
      return;
    }
    
    try {
      console.log('Generating embedding for current page:', index + 1);
      const { data: embedding, error } = await supabase.functions.invoke('generate-embedding', {
        body: { text: ocrText }
      });
      
      if (error) {
        console.warn('Failed to generate embedding for current page:', error);
        return;
      }
      
      if (embedding?.embedding) {
        console.log('✅ Generated embedding for page', index + 1, 'updating database...');
        
        // Update the page summary with the embedding
        const { error: updateError } = await supabase
          .from('page_summaries')
          .update({ 
            embedding: embedding.embedding,
            embedding_model: 'text-embedding-004',
            embedding_updated_at: new Date().toISOString()
          })
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1);
          
        if (updateError) {
          console.warn('Failed to save embedding to database:', updateError);
        } else {
          console.log('✅ Embedding saved for page', index + 1);
        }
      }
    } catch (error) {
      console.warn('Error generating embedding for current page:', error);
    }
  }, [dbBookId, index]);

  const fetchRagContextIfEnabled = useCallback(async (queryText: string): Promise<any[]> => {
    if (!ragEnabled || !bookId || !queryText.trim()) {
      return [];
    }

    try {
      console.log('Fetching RAG context for page', index + 1, 'with query length:', queryText.length);
      
      const ragContext = await retrieveRAGContext(
        bookId,
        index + 1, // current page (1-based)
        queryText,
        {
          enabled: true,
          maxContextPages: 3, // Conservative limit
          similarityThreshold: 0.4, // Reasonable threshold
          maxContextLength: 2000 // Conservative character limit
        }
      );
      
      console.log(`RAG context retrieved: ${ragContext.length} relevant pages found`);
      if (ragContext.length > 0) {
        console.log('RAG similarity scores:', ragContext.map(ctx => ctx.similarity.toFixed(3)).join(', '));
      }
      
      return ragContext;
    } catch (error) {
      console.warn('RAG context retrieval failed (fail-safe):', error);
      return []; // Fail gracefully
    }
  }, [ragEnabled, bookId, index]);

  const extractTextFromPage = async (force = false) => {
    if (ocrLoading) return;
    
    // Skip database check if force is true
    if (!force) {
      // Check if we already have OCR text in database
      try {
        const { data: existingData, error } = await supabase
          .from('page_summaries')
          .select('ocr_text, ocr_confidence, confidence, confidence_meta')
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1)
          .maybeSingle();

        console.log('Checking database for existing OCR text for page', index + 1, 'Result:', existingData);

        if (!error && existingData?.ocr_text?.trim()) {
          console.log('Found existing OCR text in database:', {
            length: existingData.ocr_text.length,
            preview: existingData.ocr_text.substring(0, 100) + '...'
          });
          
          setExtractedText(existingData.ocr_text);
          setOcrQuality(existingData.ocr_confidence || 0.8);
          localStorage.setItem(ocrKey, existingData.ocr_text);
          toast.success(rtl ? "تم تحميل النص المحفوظ" : "Loaded cached OCR text");
          
          // Check if we also need to load existing summary
          if (existingData.confidence && !summary?.trim()) {
            // Try to get the summary from the same record or query again
            try {
              const { data: summaryData } = await supabase
                .from('page_summaries')
                .select('summary_md')
                .eq('book_id', dbBookId)
                .eq('page_number', index + 1)
                .maybeSingle();
              
              if (summaryData?.summary_md?.trim()) {
                await streamExistingSummary(summaryData.summary_md);
              }
            } catch (summaryError) {
              console.warn('Failed to load existing summary:', summaryError);
            }
          }
          
          return;
        }
      } catch (dbError) {
        console.warn('Failed to check existing OCR text:', dbError);
      }
    } else {
      toast.info(rtl ? "إعادة توليد النص والملخص من جديد..." : "Force regenerating OCR and summary...");
    }
    setOcrLoading(true);
    setOcrProgress(0);
    setExtractedText("");
    setSummary("");
    setLastError(null);
    
    try {
      const imageSrc = pages[index]?.src;
      setOcrProgress(10);
      
      console.log('Using Google Gemini OCR only...');
      setOcrProgress(20);
      
      const { data: geminiResult, error: geminiError } = await supabase.functions.invoke('ocr-gemini', {
        body: { 
          imageUrl: imageSrc,
          language: 'ar'  // Force Arabic for enhanced OCR prompt with comprehensive extraction
        }
      });
      
      console.log('OCR Gemini result:', geminiResult);

      setOcrProgress(60);

      if (geminiError) {
        throw new Error(`Google Gemini OCR failed: ${geminiError.message || geminiError}`);
      }
      
      // Extract readable text from the Gemini JSON response
      let extractedText = '';
      
      if (geminiResult?.text) {
        extractedText = geminiResult.text;
      } else if (typeof geminiResult === 'string') {
        try {
          const parsed = JSON.parse(geminiResult);
          
          // If the response is structured JSON, extract readable text from sections
          if (parsed.sections && Array.isArray(parsed.sections)) {
            const textParts = [];
            
            for (const section of parsed.sections) {
              if (section.content && section.type !== 'footer') {
                // Clean up the content and add it
                const cleanContent = section.content.trim();
                if (cleanContent && cleanContent !== section.title) {
                  textParts.push(cleanContent);
                }
              }
            }
            
            extractedText = textParts.join('\n\n').trim();
            console.log('Extracted readable text from structured JSON:', {
              sectionsFound: parsed.sections.length,
              textPartsExtracted: textParts.length,
              finalLength: extractedText.length
            });
          } else {
            // Fallback to direct text field or stringified JSON
            extractedText = parsed.text || JSON.stringify(parsed);
          }
        } catch {
          extractedText = geminiResult;
        }
      }
      
      console.log('Processed extracted text:', {
        length: extractedText.length,
        preview: extractedText.substring(0, 200) + '...',
        isArabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(extractedText)
      });
      
      if (!extractedText || extractedText.trim().length <= 3) {
        throw new Error('Google Gemini OCR returned empty or insufficient text');
      }

      const result = {
        text: extractedText,
        confidence: geminiResult.confidence || 0.85,
        source: 'gemini'
      };
      
      console.log('Google Gemini OCR successful, confidence:', result.confidence);
      setOcrProgress(75);

      const cleanText = result.text.trim();
      setExtractedText(cleanText);
      localStorage.setItem(ocrKey, cleanText);
      
      // Save to database and generate summary
      console.log('Saving OCR text to database:', { 
        book_id: dbBookId, 
        page_number: index + 1, 
        ocr_text_length: cleanText?.length,
        ocr_text_preview: cleanText?.substring(0, 100) + '...'
      });
      
      try {
        const saveResult = await callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: index + 1,
          ocr_text: cleanText,
          ocr_confidence: result.confidence ? (result.confidence > 1 ? result.confidence / 100 : result.confidence) : 0.8
        });
        console.log('OCR text saved successfully for page', index + 1, 'Result:', saveResult);
        
        // Generate embedding for RAG indexing (async, non-blocking)
        console.log('🎯 About to call generateEmbeddingForCurrentPage in simple OCR flow with cleanText length:', cleanText?.length);
        generateEmbeddingForCurrentPage(cleanText);
        
        // Force UI refresh to show the extracted text
        setExtractedText(cleanText);
        setOcrQuality(result.confidence ? (result.confidence > 1 ? result.confidence / 100 : result.confidence) : 0.8);
        
      } catch (saveError) {
        console.error('Failed to save OCR text to database:', saveError);
        // Continue with summary generation even if save fails
        toast.error(rtl ? "فشل في حفظ النص المستخرج" : "Failed to save extracted text");
      }
      
      setOcrProgress(90);
      
      // Complete OCR progress immediately and generate summary in background
      setOcrProgress(100);
      toast.success(rtl ? "تم استخراج النص بنجاح" : "Text extracted successfully");
      
      // Generate summary asynchronously without blocking
      setTimeout(() => {
        toast.info(rtl ? "جاري توليد الملخص في الخلفية..." : "Generating summary in background...");
        summarizeExtractedText(cleanText, force).catch(error => {
          console.error('Background summary generation failed:', error);
          toast.error(rtl ? "فشل في توليد الملخص" : "Summary generation failed");
        });
      }, 100);
    } catch (error) {
      console.error('OCR Error:', error);
      setLastError(error instanceof Error ? error : String(error));
      toast.error(rtl ? "فشل في استخراج النص" : "Failed to extract text");
    } finally {
      setOcrLoading(false);
    }
  };

  const streamExistingSummary = async (existingSummary: string) => {
    setSummLoading(true);
    setSummaryProgress(0);
    setSummary("");
    
    // Instantly load cached summaries - no streaming animation
    setSummary(existingSummary);
    setSummaryProgress(100);
    setSummLoading(false);
  };

  const summarizeExtractedText = async (text: string = extractedText, force = false) => {
    if (!text?.trim()) {
      toast.error(rtl ? "لا يوجد نص لتلخيصه" : "No text to summarize");
      return;
    }
    
    // Check for mathematical content markers in OCR text
    const hasMathMarkers = /[∫∑∏√∂∇∆λπθΩαβγδεζηκμνξρστφχψω]|[=+\-×÷<>≤≥≠]|\d+\s*[×÷]\s*\d+|[a-zA-Z]\s*=\s*[a-zA-Z0-9]/.test(text);
    console.log('Math markers detected in OCR:', hasMathMarkers);
    
    // Skip database check if force is true
    if (!force) {
      // First check if summary already exists in database
      try {
        const { data: existingData, error } = await supabase
          .from('page_summaries')
          .select('summary_md')
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1)
          .maybeSingle();
        
        if (!error && existingData?.summary_md?.trim()) {
          console.log('Found existing summary in database, streaming it...');
          await streamExistingSummary(existingData.summary_md);
          return;
        }
      } catch (dbError) {
        console.warn('Failed to check existing summary:', dbError);
      }
    }
    
    setSummLoading(true);
    setSummaryProgress(0);
    setSummary("");
    
    try {
      console.log('Starting summary generation for text:', text.substring(0, 100));
      
      const trimmedText = text.trim();
      
      // RAG Context Retrieval (if enabled)
      let enhancedText = trimmedText;
      if (ragEnabled) {
        console.log('RAG enabled: fetching context from previous pages...');
        const ragContext = await fetchRagContextIfEnabled(trimmedText);
        
        if (ragContext.length > 0) {
          enhancedText = buildRAGPrompt(trimmedText, trimmedText, ragContext, {
            enabled: true,
            maxContextLength: 2000
          });
          console.log('RAG context integrated. Enhanced text length:', enhancedText.length);
          toast.info(rtl ? `جاري التوليد باستخدام ${ragContext.length} صفحات سابقة...` : `Generating with context from ${ragContext.length} previous pages...`);
        } else {
          console.log('No RAG context found, proceeding with original text');
        }
      }
      
      // Use progressive timeout strategy for better reliability
      console.log('Calling summarize function with progressive timeout strategy...');
      setSummaryProgress(10);
      if (!ragEnabled) {
        toast.info(rtl ? "جاري التوليد مع التحقق الشامل..." : "Generating with thorough verification...");
      }
      
      let summaryResult;
      
      // First attempt with shorter timeout
      try {
        console.log('Attempt 1: Using 60s timeout...');
        summaryResult = await callFunction('summarize', {
          text: enhancedText, // Use RAG-enhanced text if available
          lang: 'ar',
          page: index + 1,
          title: title,
          ocrData: {
            pageContext: {
              page_title: title || 'Unknown',
              page_type: 'content',
              has_formulas: hasMathMarkers,
              has_questions: /\d+\.\s/.test(text) || /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(text),
              has_examples: /مثال|example/i.test(text)
            }
          }
        }, { timeout: 60000, retries: 1 });
        
      } catch (firstError) {
        console.log('First attempt failed, trying with longer timeout...', firstError);
        setSummaryProgress(30);
        toast.info(rtl ? "المحاولة الأولى فشلت، جاري المحاولة بوقت أطول..." : "First attempt failed, trying with longer timeout...");
        
        // Second attempt with longer timeout
        try {
          console.log('Attempt 2: Using 180s timeout...');
          summaryResult = await callFunction('summarize', {
            text: enhancedText, // Use RAG-enhanced text if available
            lang: 'ar',
            page: index + 1,
            title: title,
            ocrData: {
              pageContext: {
                page_title: title || 'Unknown',
                page_type: 'content',
                has_formulas: hasMathMarkers,
                has_questions: /\d+\.\s/.test(text) || /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(text),
                has_examples: /مثال|example/i.test(text)
              }
            }
          }, { timeout: 180000, retries: 2 });
          
        } catch (secondError) {
          console.error('Both summarization attempts failed:', { firstError, secondError });
          
          // Provide specific error message based on error type
          if (secondError.message?.includes('Failed to fetch') || secondError.message?.includes('Failed to send a request')) {
            throw new Error(rtl ? 
              'فشل في الاتصال بخدمة التلخيص. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.' : 
              'Failed to connect to summarization service. Please check your internet connection and try again.'
            );
          } else if (secondError.message?.includes('timeout') || secondError.message?.includes('TIMEOUT')) {
            throw new Error(rtl ? 
              'انتهت مهلة التلخيص. النص قد يكون طويلاً جداً. يرجى المحاولة مرة أخرى.' : 
              'Summarization timed out. The text may be too long. Please try again.'
            );
          } else {
            throw secondError;
          }
        }
      }
      
      console.log('Summary result:', summaryResult);

      setSummaryProgress(90);

      if (!summaryResult?.summary || summaryResult.summary.trim().length <= 3) {
        throw new Error('Summary function returned empty or insufficient content');
      }

      const fullSummary = summaryResult.summary;

      if (fullSummary.trim()) {
        // Client-side guard: Remove "Formulas & Equations" section if no math markers detected
        let cleanSummary = fullSummary;
        if (!hasMathMarkers) {
          cleanSummary = cleanSummary.replace(/### \d+\)\s*(الصيغ والوحدات|Formulas & Units)[\s\S]*?(?=###|$)/gi, '');
          cleanSummary = cleanSummary.replace(/###\s*(الصيغ والوحدات|Formulas & Units)[\s\S]*?(?=###|$)/gi, '');
          console.log('Removed formulas section due to lack of math markers');
        }
        
        // Remove duplicate content - no character limit to ensure full summaries
        const finalSummary = cleanSummary.split('### نظرة عامة')[0] + 
                           (cleanSummary.includes('### نظرة عامة') ? '### نظرة عامة' + cleanSummary.split('### نظرة عامة')[1] : '');
        
        localStorage.setItem(sumKey, finalSummary);
        setSummary(finalSummary);
        setSummaryConfidence(0.8);
        
        // Post-process: Check for missing numbered questions and complete them (non-blocking)
        checkAndCompleteMissingQuestions(finalSummary, trimmedText).catch(error => {
          console.error('Post-processing failed:', error);
        });
        
        toast.success(rtl ? "تم إنشاء الملخص بنجاح" : "Summary generated successfully");
        
        // Save complete summary to database (async, non-blocking)
        callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: index + 1,
          summary_md: finalSummary,
          confidence: 0.8,
          rag_metadata: ragEnabled ? {
            ragEnabled: true,
            ragPagesUsed: lastRagPagesUsed,
            ragPagesIncluded: [], // Not available in this flow
            ragThreshold: 0.4,
            ragMaxPages: 3
          } : {
            ragEnabled: false,
            ragPagesUsed: 0,
            ragPagesIncluded: [],
            ragThreshold: 0.4,
            ragMaxPages: 3
          }
        }).catch(saveError => {
          console.error('Failed to save summary to database:', saveError);
        });
      } else {
        throw new Error('No summary content received');
      }
      
    } catch (error) {
      console.error('Summarization error:', error);
      setLastError(error instanceof Error ? error : String(error));
      toast.error(rtl ? `خطأ في التلخيص: ${error instanceof Error ? error.message : String(error)}` : `Summarization error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSummLoading(false);
      setSummaryProgress(100);
    }
  };

  const forceRegenerate = async () => {
    try {
      console.log('Force regenerate - starting comprehensive processing...');
      
      // Clear existing data
      setExtractedText("");
      setSummary("");
      localStorage.removeItem(ocrKey);
      localStorage.removeItem(sumKey);
      
      // Clear database cached data by deleting the record
      try {
        const { error: deleteError } = await supabase
          .from('page_summaries')
          .delete()
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1);
          
        if (deleteError) {
          console.warn('Failed to delete cached data:', deleteError);
        } else {
          console.log('Cleared cached data for force regeneration');
        }
      } catch (deleteErr) {
        console.warn('Failed to clear database cache:', deleteErr);
      }
      
      // Set loading states
      setOcrLoading(true);
      setSummLoading(true);
      
      const pageNum = index + 1;
      const pageStartTime = Date.now();
      
      try {
        // Get current page image
        const pageImage = pages[index];
        if (!pageImage) {
          throw new Error(`No image found for page ${pageNum}`);
        }
        
        console.log(`🔍 Page ${pageNum}: Starting comprehensive OCR extraction...`);
        
        // 1. OCR EXTRACTION WITH FALLBACK (following AdminProcessing pattern)
        let ocrText = '';
        let ocrConfidence = 0.8;
        let ocrResult = null;
        
        try {
          // Try Gemini OCR first
          ocrResult = await callFunction('ocr-gemini', {
            imageUrl: pageImage.src,
            language: 'ar'
          }, { timeout: 60000, retries: 1 });
          
          ocrText = ocrResult.text || '';
          ocrConfidence = ocrResult.confidence || 0.8;
          console.log(`✅ Page ${pageNum}: OCR completed (${(ocrConfidence * 100).toFixed(1)}% confidence, ${ocrText.length} chars)`);
          
        } catch (ocrError) {
          console.log(`🔄 Page ${pageNum}: Primary OCR failed, trying fallback...`);
          try {
            const fallbackResult = await callFunction('ocr-fallback', {
              imageUrl: pageImage.src,
              language: 'ar'
            }, { timeout: 90000, retries: 1 });
            
            ocrText = fallbackResult.text || '';
            ocrConfidence = fallbackResult.confidence || 0.6;
            ocrResult = fallbackResult;
            console.log(`✅ Page ${pageNum}: Fallback OCR completed (${(ocrConfidence * 100).toFixed(1)}% confidence)`);
          } catch (fallbackError) {
            throw new Error(`All OCR methods failed: ${fallbackError.message}`);
          }
        }
        
        if (!ocrText) {
          throw new Error('No text extracted from OCR');
        }
        
        // 2. TEXT CLEANING (following AdminProcessing pattern)
        let cleanedOcrText = ocrText;
        try {
          const { cleanOcrText } = await import('@/lib/ocr/ocrTextCleaner');
          const cleaningResult = cleanOcrText(ocrText, { detectLanguage: 'ar' });
          cleanedOcrText = cleaningResult.cleanedText;
          if (cleaningResult.improvements.length > 0) {
            console.log(`🧹 Page ${pageNum}: Text cleaned - ${cleaningResult.improvements.join(', ')}`);
          }
        } catch (cleaningError) {
          console.warn('Text cleaning failed, using original:', cleaningError);
        }
        
        // Update OCR in UI
        setExtractedText(cleanedOcrText);
        setOcrLoading(false);
        
        // 3. SUMMARY GENERATION WITH QUALITY GATE (following AdminProcessing pattern)
        console.log(`📝 Page ${pageNum}: Generating summary with quality gate...`);
        
        // RAG Context Retrieval for force regenerate (mirroring admin process)
        let enhancedText = cleanedOcrText;
        let ragPagesFound = 0;
        let ragPagesSent = 0;
        let ragPagesSentList: number[] = [];
        let ragContextChars = 0;
        let ragPagesIncluded: Array<{pageNumber: number; title?: string; similarity: number}> = [];
        
        if (ragEnabled && bookId) {
          console.log(`🔍 Page ${pageNum}: Retrieving RAG context from previous pages...`);
          try {
            const ragContext = await retrieveRAGContext(
              bookId,
              pageNum, // current page (1-based)
              cleanedOcrText,
              {
                enabled: true,
                maxContextPages: 3,
                similarityThreshold: 0.4,
                maxContextLength: 8000
              }
            );
            
            ragPagesFound = ragContext.length;
            
            if (ragContext.length > 0) {
              // Build enhanced prompt with RAG context
              enhancedText = buildRAGPrompt(cleanedOcrText, cleanedOcrText, ragContext, {
                enabled: true,
                maxContextLength: 8000
              });
              
              // Track actual RAG usage (pages actually sent to AI)
              ragPagesSent = ragContext.length;
              ragPagesSentList = ragContext.map(ctx => ctx.pageNumber);
              ragContextChars = ragContext.reduce((total, ctx) => total + (ctx.content?.length || 0), 0);
              ragPagesIncluded = ragContext.map(ctx => ({
                pageNumber: ctx.pageNumber,
                title: ctx.title || null,
                similarity: ctx.similarity
              }));
              
              const contextPages = ragContext.map(ctx => ctx.pageNumber).join(', ');
              console.log(`✅ Page ${pageNum}: RAG found ${ragPagesFound} pages, sent ${ragPagesSent} pages (${ragContextChars} chars): ${contextPages}`);
              setLastRagPagesUsed(ragPagesSent);
            } else {
              console.log(`ℹ️ Page ${pageNum}: No relevant RAG context found`);
              setLastRagPagesUsed(0);
            }
          } catch (ragError) {
            console.log(`⚠️ Page ${pageNum}: RAG context retrieval failed (continuing without): ${ragError.message}`);
            setLastRagPagesUsed(0);
          }
        }
        
        const summaryResult = await callFunction('summarize', {
          text: cleanedOcrText, // Use cleaned text without pre-injection
          lang: 'ar',
          page: pageNum,
          title: title,
          ocrData: ocrResult,
          ragContext: ragEnabled && ragPagesFound > 0 ? ragPagesIncluded.map(p => ({
            pageNumber: p.pageNumber,
            title: p.title,
            content: '', // Content will be retrieved by summarize function
            similarity: p.similarity
          })) : [] // Pass RAG context to summarize function like admin process
        }, { timeout: 180000, retries: 1 });
        
        let summary = summaryResult.summary || '';
        let summaryConfidence = 0.8;
        let finalSummary = summary;
        
        if (!summary) {
          throw new Error('No summary generated');
        }
        
        console.log(`✅ Page ${pageNum}: Initial summary generated (${summary.length} chars)`);
        
        // 4. QUALITY GATE AND AUTO-REPAIR (following AdminProcessing pattern)
        try {
          const { runQualityGate } = await import('@/lib/processing/qualityGate');
          
          console.log(`🛡️ Page ${pageNum}: Running quality gate...`);
          
          const qualityResult = await runQualityGate(
            cleanedOcrText,
            summary,
            ocrConfidence,
            {
              originalText: cleanedOcrText,
              ocrData: ocrResult,
              pageNumber: pageNum,
              bookTitle: title,
              language: 'ar'
            },
            {
              minOcrConfidence: 0.3,
              minSummaryConfidence: 0.6,
              enableRepair: true,
              repairThreshold: 0.7,
              maxRepairAttempts: 2
            }
          );
          
          summaryConfidence = qualityResult.summaryConfidence;
          
          if (qualityResult.repairAttempted) {
            if (qualityResult.repairSuccessful && qualityResult.repairedSummary) {
              finalSummary = qualityResult.repairedSummary;
              summaryConfidence = qualityResult.repairedConfidence || summaryConfidence;
              console.log(`🔧 Page ${pageNum}: Summary repaired successfully (${(summaryConfidence * 100).toFixed(1)}% confidence)`);
            } else {
              console.log(`⚠️ Page ${pageNum}: Summary repair failed, using original`);
            }
          } else if (qualityResult.passed) {
            console.log(`✅ Page ${pageNum}: Summary quality acceptable (${(summaryConfidence * 100).toFixed(1)}% confidence)`);
          } else {
            console.log(`⚠️ Page ${pageNum}: Summary below quality threshold but no repair attempted`);
          }
          
          // Log quality gate details
          qualityResult.logs.forEach(log => console.log(`📊 Page ${pageNum}: ${log}`));
          
        } catch (qualityError) {
          console.warn(`⚠️ Page ${pageNum}: Quality gate failed - ${qualityError.message}`, qualityError);
        }
        
        // Update summary in UI
        setSummary(finalSummary);
        setSummLoading(false);
        
        // 5. SAVE TO DATABASE (following AdminProcessing pattern)
        console.log(`💾 Page ${pageNum}: Saving to database...`);
        
        await callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: pageNum,
          ocr_text: cleanedOcrText,
          summary_md: finalSummary,
          ocr_confidence: ocrConfidence,
          confidence: summaryConfidence,
          // RAG tracking fields (mirroring admin process)
          rag_pages_sent: ragPagesSent,
          rag_pages_found: ragPagesFound,
          rag_pages_sent_list: ragPagesSentList,
          rag_context_chars: ragContextChars,
          rag_metadata: {
            ragEnabled: ragEnabled,
            ragPagesUsed: ragPagesSent,
            ragPagesIncluded: ragPagesIncluded,
            ragThreshold: 0.4,
            ragMaxPages: 3
          }
        });
        
        // Generate embedding for RAG indexing (async, non-blocking)
        console.log('🎯 About to call generateEmbeddingForCurrentPage in comprehensive flow with cleanedOcrText length:', cleanedOcrText?.length);
        generateEmbeddingForCurrentPage(cleanedOcrText);
        
        // Update localStorage cache
        localStorage.setItem(ocrKey, cleanedOcrText);
        localStorage.setItem(sumKey, finalSummary);
        
        const processingTime = Date.now() - pageStartTime;
        console.log(`🎉 Page ${pageNum}: Comprehensive processing completed in ${Math.round(processingTime / 1000)}s`);
        
        toast.success(rtl ? "تم إعادة توليد النص والملخص بنجاح مع فحص الجودة" : "Successfully regenerated OCR and summary with quality checks");
        
      } catch (processingError) {
        console.error(`❌ Page ${pageNum}: Processing error:`, processingError);
        throw processingError;
      }
      
    } catch (error) {
      console.error('Force regenerate error:', error);
      setOcrLoading(false);
      setSummLoading(false);
      toast.error(rtl ? `فشل في إعادة التوليد: ${error.message}` : `Failed to regenerate content: ${error.message}`);
    }
  };

  // Function to add table data and run summarization
  const addTableDataAndSummarize = async () => {
    const tableData = `

--- SECTION: الجدول 6-1 ---
المذيب
KF (°C/m)
°C درجة التجمد
الماء
1.86
0.0
البنزين
5.12
5.5
رابع كلوريد الكربون
29.8
-23.0
الإيثانول
1.99
-114.1
الكلوروفورم
4.68
-63.5`;

    const updatedText = extractedText + tableData;
    setExtractedText(updatedText);
    
    // Run summarization with the updated text
    await summarizeExtractedText(updatedText, true);
  };

  // Post-processing function to ensure all numbered questions are answered
  const checkAndCompleteMissingQuestions = async (generatedSummary: string, originalText: string) => {
    try {
      // Extract question numbers from original text
      const extractQuestionNumbers = (text: string): number[] => {
        const matches = text.match(/(?:^|\s)(\d{1,3})[\u002E\u06D4]\s*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z]/gm);
        if (!matches) return [];
        
        const numbers = matches
          .map(match => {
            const num = match.trim().match(/(\d{1,3})/);
            return num ? parseInt(num[1], 10) : 0;
          })
          .filter(num => num > 0 && num < 200)
          .sort((a, b) => a - b);
        
        return [...new Set(numbers)];
      };

      const requiredIds = extractQuestionNumbers(originalText);
      if (requiredIds.length === 0) return;

      console.log(`Post-processing: Found ${requiredIds.length} questions: [${requiredIds.join(', ')}]`);

      // Extract answered question numbers from summary
      const answeredIds = extractQuestionNumbers(generatedSummary);
      const missingIds = requiredIds.filter(id => !answeredIds.includes(id));

      if (missingIds.length === 0) {
        console.log('Post-processing: All questions answered ✓');
        return;
      }

      console.log(`Post-processing: Missing questions: [${missingIds.join(', ')}]`);

      // Call qa-stream for each missing question
      let additionalAnswers = '';
      for (const questionId of missingIds) {
        try {
          const question = `حل السؤال رقم ${questionId} من النص المعطى`;
          const answer = await callQAStreamForQuestion(question, generatedSummary, originalText);
          
          if (answer.trim()) {
            additionalAnswers += `\n\n**${questionId}. [من النص]**\n${answer}`;
          }
        } catch (qaError) {
          console.error(`Failed to get answer for question ${questionId}:`, qaError);
        }
      }

      if (additionalAnswers.trim()) {
        // Append missing answers to the summary
        const updatedSummary = generatedSummary + 
          (generatedSummary.includes('### حل المسائل') ? additionalAnswers : 
           `\n\n### حل المسائل إضافية${additionalAnswers}`);
        
        setSummary(updatedSummary);
        localStorage.setItem(sumKey, updatedSummary);
        
        console.log(`Post-processing: Added ${missingIds.length} missing answers ✓`);
      }
    } catch (error) {
      console.error('Post-processing error:', error);
    }
  };

  // Helper function to call qa-stream for individual questions
  const callQAStreamForQuestion = async (question: string, summary: string, pageText: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      let fullAnswer = '';
      
      const eventSource = new EventSource(
        `https://ukznsekygmipnucpouoy.supabase.co/functions/v1/qa-stream?` +
        `question=${encodeURIComponent(question)}&` +
        `summary=${encodeURIComponent(summary.substring(0, 2000))}&` +
        `context=${encodeURIComponent(pageText.substring(0, 3000))}&` +
        `lang=${rtl ? 'arabic' : 'english'}`
      );

      const timeout = setTimeout(() => {
        eventSource.close();
        resolve(fullAnswer);
      }, 30000);

      eventSource.onmessage = (event) => {
        try {
          if (event.data === '[DONE]') {
            clearTimeout(timeout);
            eventSource.close();
            resolve(fullAnswer);
            return;
          }
          
          const parsed = JSON.parse(event.data);
          if (parsed.text) {
            fullAnswer += parsed.text;
          }
        } catch (e) {
          console.log ('Failed to parse QA data:', event.data);
        }
      };

      eventSource.onerror = (error) => {
        clearTimeout(timeout);
        eventSource.close();
        resolve(fullAnswer); // Return partial answer instead of rejecting
      };
    });
  };

  const handleSmartSummarizeClick = async () => {
    // Check if we already have a summary (either in state or database)
    if (summary?.trim()) {
      // If we have a summary, stream it again for better UX
      await streamExistingSummary(summary);
      return;
    }
    
    // Check if we have extracted text to summarize
    if (extractedText?.trim()) {
      summarizeExtractedText();
    } else {
      // No text yet, extract it first
      await extractTextFromPage();
    }
  };

  const handleWheelNav = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    
    const now = Date.now();
    if (now - (containerRef.current as any)?.lastWheelNav < 300) return;
    (containerRef.current as any).lastWheelNav = now;
    
    if (e.deltaY > 0) goNext();
    else if (e.deltaY < 0) goPrev();
  };

  console.log('DEBUG: BookViewer render - Page:', index + 1, 'extractedText length:', extractedText.length, 'summary length:', summary.length, 'displaySrc:', displaySrc ? displaySrc.substring(0, 50) + '...' : 'null');

  return (
    <section className={cn("w-full min-h-screen", rtl && "[direction:rtl]")}>
      {isMobile ? (
        <div className="min-h-screen">
          <MobileReaderChrome
            title={title}
            progressText={L.progress(index + 1, total, Math.round(((index + 1) / total) * 100))}
            rtl={rtl}
            onToggleThumbnails={() => setThumbnailsOpen(!thumbnailsOpen)}
            onOpenInsights={() => setDrawerOpen(true)}
            onPrev={goPrev}
            onNext={goNext}
            canPrev={index > 0}
            canNext={index < total - 1}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onCenter={centerImage}
            onToggleFullscreen={toggleFullscreen}
            fullscreenButton={<FullscreenButton />}
          />
          
          <div className="pt-16 pb-4">
            <TouchGestureHandler
              onSwipeLeft={rtl ? goPrev : goNext}
              onSwipeRight={rtl ? goNext : goPrev}
              onPinch={(scale) => setZoom(prev => Math.min(Z.max, Math.max(Z.min, prev * scale)))}
              className="min-h-[60vh]"
            >
              <div className="flex items-center justify-center p-4">
                {displaySrc ? (
                  <img
                    src={displaySrc}
                    alt={pages[index]?.alt}
                    className="max-w-full max-h-full object-contain"
                    style={{ transform: `scale(${zoom})` }}
                  />
                ) : (
                  <LoadingProgress type="image" progress={pageProgress} rtl={rtl} />
                )}
              </div>
            </TouchGestureHandler>
          </div>
          
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{rtl ? "مساعد القراءة الذكي" : "AI Reading Assistant"}</DrawerTitle>
              </DrawerHeader>
              <div className="p-4">
                <Tabs value={insightTab} onValueChange={v => setInsightTab(v as any)}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="summary">{rtl ? "الملخص" : "Summary"}</TabsTrigger>
                    <TabsTrigger value="qa">{rtl ? "المدرس الذكي" : "AI Tutor"}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="summary" className="mt-4">
                    <Button 
                      className="w-full" 
                      onClick={handleSmartSummarizeClick}
                      disabled={ocrLoading || summLoading}
                    >
                      {ocrLoading || summLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {rtl ? "لخص هذه الصفحة" : "Summarize this page"}
                    </Button>
                    
                    {/* RAG Toggle */}
                    {bookId && (
                      <div className="flex items-center gap-2 mt-3 p-2 bg-muted/30 rounded text-xs">
                        <Switch
                          id="rag-toggle-mobile"
                          checked={ragEnabled}
                          onCheckedChange={toggleRag}
                          disabled={ocrLoading || summLoading}
                        />
                        <Label htmlFor="rag-toggle-mobile" className="text-xs">
                          {rtl ? "استخدم الصفحات السابقة" : "Use previous pages"}
                        </Label>
                      </div>
                    )}
                    
                    {/* Add Table Data Button - Only show on page 50 */}
                    {index + 1 === 50 && (
                      <Button 
                        className="w-full mt-2" 
                        variant="outline"
                        onClick={addTableDataAndSummarize}
                        disabled={ocrLoading || summLoading}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {rtl ? "إضافة الجدول 6-1 وإعادة التلخيص" : "Add Table 6-1 and Re-summarize"}
                      </Button>
                    )}
                    
                    {summary && (
                      <div className="mt-4">
                        {/* RAG Context Indicator */}
                        {(ragEnabled && lastRagPagesUsed > 0) || (storedRagMetadata?.ragEnabled && storedRagMetadata?.ragPagesUsed > 0) ? (
                          <div className="mb-3 flex items-center gap-2 flex-wrap">
                             <Badge 
                               variant="outline" 
                               className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200 px-2 py-1"
                             >
                               {rtl 
                                 ? `استخدام سياق من ${storedRagMetadata?.ragPagesUsed || lastRagPagesUsed} صفحة سابقة`
                                 : `Using context from ${storedRagMetadata?.ragPagesUsed || lastRagPagesUsed} previous pages`
                               }
                             </Badge>
                              {ragPagesSent > 0 && (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs bg-green-50 text-green-700 border-green-200 px-2 py-1"
                                >
                                  {rtl 
                                     ? `أرسل ${ragPagesSent} فعليًا إلى Gemini`
                                     : `Actually sent ${ragPagesSent} to Gemini`
                                   }
                                 </Badge>
                               )}
                            {storedRagMetadata?.ragPagesIncluded && storedRagMetadata.ragPagesIncluded.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {rtl ? 'الصفحات: ' : 'Pages: '}
                                {storedRagMetadata.ragPagesIncluded.map((p: any, i: number) => (
                                  <span key={i} className="mr-1">
                                    {p.pageNumber}{p.similarity ? ` (${(p.similarity * 100).toFixed(0)}%)` : ''}
                                    {i < storedRagMetadata.ragPagesIncluded.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                        <EnhancedSummary
                          summary={summary}
                          onSummaryChange={newSummary => {
                            setSummary(newSummary);
                            try {
                              localStorage.setItem(sumKey, newSummary);
                            } catch {}
                          }}
                          onRegenerate={() => {
                            if (extractedText) {
                              summarizeExtractedText(extractedText);
                            } else {
                              toast.error(rtl ? "يجب استخراج النص أولاً" : "Extract text first");
                            }
                          }}
                          isRegenerating={summLoading}
                          confidence={ocrQuality ?? summaryConfidence}
                          pageNumber={index + 1}
                          rtl={rtl}
                          title={title}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="qa" className="mt-4">
                    <QAChat 
                      summary={summary || extractedText} 
                      rtl={rtl} 
                      title={title} 
                      page={index + 1} 
                      ocrData={{
                        pageContext: {
                          page_title: title || 'Unknown',
                          page_type: 'content',
                          has_formulas: /\$|\[|\]|\\/.test(summary || extractedText),
                          has_questions: /\d+\.\s/.test(summary || extractedText) || /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(summary || extractedText),
                          has_examples: /مثال|example/i.test(summary || extractedText)
                        }
                      }}
                    />
                  </TabsContent>
                </Tabs>
                
                {/* Extracted Text Section for Mobile */}
                <div className="mt-4">
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-2 p-3 hover:bg-muted/50 cursor-pointer rounded border">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-sm font-medium">{rtl ? "النص المستخرج من الصفحة" : "Extracted Text from Page"}</span>
                        <ChevronDown className="h-4 w-4 ml-auto transition-transform" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-3 border-x border-b rounded-b">
                        {extractedText ? (
                          <div 
                            className={cn(
                              "text-sm leading-relaxed bg-muted/30 p-3 rounded border max-h-48 overflow-y-auto",
                              "whitespace-pre-wrap",
                              rtl && "text-right font-arabic"
                            )}
                            dir={rtl ? "rtl" : "ltr"}
                          >
                            {extractedText}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded border text-center">
                            <p className={rtl ? "text-right" : "text-left"}>
                              {rtl ? "لم يتم استخراج النص من هذه الصفحة بعد. استخدم زر 'لخص هذه الصفحة' لاستخراج النص." : "No text has been extracted from this page yet. Use the 'Summarize this page' button to extract text."}
                            </p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
          
          {/* OCR Content for Mobile */}
          <div className="px-4">
            <IndexableOCRContent
              ocrText={extractedText}
              pageNumber={index + 1}
              rtl={rtl}
              onForceRegenerate={forceRegenerate}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-screen flex gap-4">
          {/* Thumbnail Sidebar */}
          <div className={cn("flex-shrink-0 transition-all duration-300", !thumbnailsOpen && "w-0 overflow-hidden")}>
            <ThumbnailSidebar
              pages={pages}
              currentIndex={index}
              onPageSelect={setIndex}
              isOpen={thumbnailsOpen}
              onToggle={() => setThumbnailsOpen(!thumbnailsOpen)}
              rtl={rtl}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto">
            {/* Book Title */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate(`/admin/processing?bookId=${bookId}`)}
                className="flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Process Book
              </Button>
            </div>

            {/* Page Area */}
            <FullscreenMode rtl={rtl}>
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <TouchGestureHandler
                    onSwipeLeft={rtl ? goPrev : goNext}
                    onSwipeRight={rtl ? goNext : goPrev}
                    onPinch={scale => setZoom(prev => Math.min(Z.max, Math.max(Z.min, prev * scale)))}
                    className="relative"
                  >
                    <div 
                      ref={containerRef}
                      className="relative group w-full border rounded-lg overflow-hidden max-h-[70vh]"
                      onWheel={handleWheelNav}
                      role="img"
                      aria-label={`${pages[index]?.alt} - Page ${index + 1} of ${total}`}
                      tabIndex={0}
                    >
                      <TransformWrapper
                        ref={(instance) => {
                          if (instance) {
                            zoomApiRef.current = instance;
                          }
                        }}
                        initialScale={zoom}
                        minScale={Z.min}
                        maxScale={Z.max}
                        limitToBounds={false}
                        onTransformed={refState => {
                          const { scale, positionX, positionY } = refState.state;
                          setTransformState({ scale, positionX, positionY });
                          setZoom(scale);
                        }}
                        onPanningStart={() => setIsPanning(true)}
                        onPanningStop={() => setIsPanning(false)}
                      >
                        <TransformComponent 
                          wrapperClass="w-full h-[50vh] md:h-[60vh] lg:h-[70vh]"
                          contentClass="flex items-center justify-center"
                        >
                          {displaySrc ? (
                            <img
                              src={displaySrc}
                              alt={pages[index]?.alt}
                              loading="eager"
                              decoding="async"
                              fetchPriority="high"
                              draggable={false}
                              onLoad={e => {
                                setImageLoading(false);
                                const imgEl = e.currentTarget;
                                setNaturalSize({
                                  width: imgEl.naturalWidth,
                                  height: imgEl.naturalHeight
                                });
                              }}
                              className="max-w-full max-h-full object-contain select-none"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <LoadingProgress type="image" progress={pageProgress} rtl={rtl} />
                            </div>
                          )}
                        </TransformComponent>
                      </TransformWrapper>

                      {/* Advanced Zoom Controls */}
                      <ZoomControls
                        zoom={zoom}
                        minZoom={Z.min}
                        maxZoom={Z.max}
                        zoomStep={Z.step}
                        mode={zoomMode}
                        onZoomIn={zoomIn}
                        onZoomOut={zoomOut}
                        onFitWidth={fitToWidth}
                        onFitHeight={fitToHeight}
                        onActualSize={actualSize}
                        onCenter={centerImage}
                        onToggleFullscreen={toggleFullscreen}
                        onPrev={index > 0 ? goPrev : undefined}
                        onNext={index < total - 1 ? goNext : undefined}
                        rtl={rtl}
                        side="right"
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </TouchGestureHandler>

                  {/* Mobile Controls Overlay */}
                  {isMobile && (
                    <MobileControlsOverlay
                      progressText={`${index + 1} / ${total}`}
                      rtl={rtl}
                      onPrev={goPrev}
                      onNext={goNext}
                      canPrev={index > 0}
                      canNext={index < total - 1}
                      onZoomIn={zoomIn}
                      onZoomOut={zoomOut}
                      onCenter={centerImage}
                      onToggleFullscreen={toggleFullscreen}
                    />
                  )}

                  {/* Navigation Controls */}
                  <div className={cn("mt-4 grid grid-cols-3 items-center gap-2 px-4 pb-4", rtl && "[direction:rtl]")}>
                    <Button 
                      onClick={goPrev} 
                      variant="secondary" 
                      disabled={index === 0}
                      className="justify-self-start"
                    >
                      {rtl ? `${L.previous} →` : `← ${L.previous}`}
                    </Button>
                    
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {index + 1} / {total}
                      </span>
                      <form 
                        className="flex items-center gap-2"
                        onSubmit={e => {
                          e.preventDefault();
                          const n = parseInt(gotoInput, 10);
                          if (!Number.isNaN(n)) jumpToPage(n);
                        }}
                      >
                        <Input
                          type="number"
                          min={1}
                          max={total}
                          placeholder={rtl ? "إلى" : "Go to"}
                          value={gotoInput}
                          onChange={e => setGotoInput(e.target.value)}
                          className="w-20"
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {rtl ? "اذهب" : "Go"}
                        </Button>
                      </form>
                      <FullscreenButton rtl={rtl} />
                    </div>
                    
                    <Button 
                      onClick={goNext} 
                      variant="default" 
                      disabled={index === total - 1}
                      className="justify-self-end"
                    >
                      {rtl ? `← ${L.next}` : `${L.next} →`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </FullscreenMode>

            {/* Error Handler */}
            {lastError && (
              <ImprovedErrorHandler
                error={lastError}
                onRetry={() => extractTextFromPage()}
                isRetrying={ocrLoading || summLoading}
                retryCount={retryCount}
                context={ocrLoading ? (rtl ? "استخراج النص" : "OCR") : (rtl ? "التلخيص" : "Summarization")}
                rtl={rtl}
              />
            )}


            {/* AI Reading Assistant */}
            <div ref={insightsRef}>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>{rtl ? "مساعد القراءة الذكي" : "AI Reading Assistant"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs value={insightTab} onValueChange={v => setInsightTab(v as any)} className="w-full">
                    <TabsList className="grid grid-cols-2 w-full">
                      <TabsTrigger value="summary">
                        {rtl ? "ملخص الصفحة" : "Page Summary"}
                      </TabsTrigger>
                      <TabsTrigger value="qa">
                        {rtl ? "المدرس الإفتراضي" : "AI Tutor"}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="mt-4">
                      <Button 
                        className="w-full bg-[#4285f4] hover:bg-[#3367d6]" 
                        onClick={handleSmartSummarizeClick}
                        disabled={ocrLoading || summLoading}
                      >
                        {ocrLoading || summLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span>
                              {rtl
                                ? (ocrLoading ? `جارٍ استخراج النص... ${Math.round(ocrProgress)}%` : "جارٍ التلخيص...")
                                : (ocrLoading ? `Extracting text... ${Math.round(ocrProgress)}%` : "Summarizing...")}
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            <span>{rtl ? "لخص هذه الصفحة" : "Summarize this page"}</span>
                          </>
                        )}
                      </Button>
                      
                      {/* RAG Toggle for Desktop */}
                      {bookId && (
                        <div className="flex items-center gap-2 mt-3 p-2 bg-muted/30 rounded text-xs">
                          <Switch
                            id="rag-toggle-desktop"
                            checked={ragEnabled}
                            onCheckedChange={toggleRag}
                            disabled={ocrLoading || summLoading}
                          />
                          <Label htmlFor="rag-toggle-desktop" className="text-xs">
                            {rtl ? "استخدم الصفحات السابقة" : "Use previous pages"}
                          </Label>
                        </div>
                      )}
                      
                      
                      {!summary && (
                        <div className="mt-3 text-sm text-muted-foreground border rounded-md p-3">
                          {rtl ? "لا يوجد ملخص بعد. اضغط \"لخص هذه الصفحة\" لإنشائه." : "No summary yet. Click 'Summarize this page' to generate one."}
                        </div>
                      )}
                      
                      {summary && (
                        <div className="mt-3">
                          <EnhancedSummary
                            summary={summary}
                            onSummaryChange={newSummary => {
                              setSummary(newSummary);
                              try {
                                localStorage.setItem(sumKey, newSummary);
                              } catch {}
                            }}
                            onRegenerate={() => {
                              if (extractedText) {
                                summarizeExtractedText(extractedText);
                              } else {
                                toast.error(rtl ? "يجب استخراج النص أولاً" : "Extract text first");
                              }
                            }}
                            isRegenerating={summLoading}
                            confidence={ocrQuality ?? summaryConfidence}
                            pageNumber={index + 1}
                            rtl={rtl}
                            title={title}
                          />
                          
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="qa" className="mt-4">
                      <QAChat 
                        summary={summary || extractedText} 
                        rtl={rtl} 
                        title={title} 
                        page={index + 1} 
                        ocrData={{
                          pageContext: {
                            page_title: title || 'Unknown',
                            page_type: 'content',
                            has_formulas: /\$|\[|\]|\\/.test(summary || extractedText),
                            has_questions: /\d+\.\s/.test(summary || extractedText) || /[اشرح|وضح|قارن|حدد|لماذا|كيف|ماذا|أين|متى]/.test(summary || extractedText),
                            has_examples: /مثال|example/i.test(summary || extractedText)
                          }
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* OCR Content - Now indexable */}
            <IndexableOCRContent
              ocrText={extractedText}
              pageNumber={index + 1}
              rtl={rtl}
              onForceRegenerate={forceRegenerate}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default BookViewer;