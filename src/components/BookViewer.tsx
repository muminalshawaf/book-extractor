import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, Loader2, ChevronDown, Menu, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { runLocalOcr } from '@/lib/ocr/localOcr';
import { removeBackgroundFromBlob, captionImageFromBlob } from '@/lib/vision';
import QAChat from "@/components/QAChat";
import MathRenderer from "@/components/MathRenderer";
import { callFunction } from "@/lib/functionsClient";
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
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
import { ContinuousReader, ContinuousReaderRef } from "@/components/reader/ContinuousReader";
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileControlsOverlay } from "@/components/reader/MobileControlsOverlay";
import { MobileReaderChrome } from "@/components/reader/MobileReaderChrome";
import { IndexableOCRContent } from "@/components/seo/IndexableOCRContent";
import { AutomateSection } from "./AutomateSection";

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
  const zoomApiRef = useRef<ReactZoomPanPinchRef | null>(null);
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
  const zoomIn = () => setZoom(prev => Math.min(Z.max, prev + Z.step));
  const zoomOut = () => setZoom(prev => Math.max(Z.min, prev - Z.step));
  const resetZoom = () => setZoom(1);

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
    } catch {}
  }, [index, ocrKey, sumKey]);

  // Fetch from Supabase
  useEffect(() => {
    let cancelled = false;
    const fetchFromDb = async () => {
      console.log('Fetching from database:', { book_id: dbBookId, page_number: index + 1 });
      try {
        const { data, error } = await supabase
          .from('page_summaries')
          .select('ocr_text, summary_md, confidence, ocr_confidence')
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
          ocrPreview: ocr.substring(0, 100) + '...'
        });
        
        console.log('DEBUG: Before setting state - current extractedText length:', extractedText.length);
        console.log('DEBUG: Before setting state - current summary length:', summary.length);
        
        setExtractedText(ocr);
        setSummary(sum);
        
        console.log('DEBUG: State update called with OCR length:', ocr.length, 'Summary length:', sum.length);
        setSummaryConfidence(typeof data?.confidence === 'number' ? data.confidence : undefined);
        setOcrQuality(typeof data?.ocr_confidence === 'number' ? data.ocr_confidence : undefined);
        
        try {
          if (ocr) localStorage.setItem(ocrKey, ocr);
          else localStorage.removeItem(ocrKey);
          if (sum) localStorage.setItem(sumKey, sum);
          else localStorage.removeItem(sumKey);
        } catch {}
      } catch (e) {
        console.warn('Failed to fetch page from DB:', e);
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
          language: rtl ? 'ar' : 'en'
        }
      });

      setOcrProgress(60);

      if (geminiError) {
        throw new Error(`Google Gemini OCR failed: ${geminiError.message || geminiError}`);
      }
      
      if (!geminiResult?.text || geminiResult.text.trim().length <= 3) {
        throw new Error('Google Gemini OCR returned empty or insufficient text');
      }

      const result = {
        text: geminiResult.text,
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
        
        // Force UI refresh to show the extracted text
        setExtractedText(cleanText);
        setOcrQuality(result.confidence ? (result.confidence > 1 ? result.confidence / 100 : result.confidence) : 0.8);
        
      } catch (saveError) {
        console.error('Failed to save OCR text to database:', saveError);
        // Continue with summary generation even if save fails
        toast.error(rtl ? "فشل في حفظ النص المستخرج" : "Failed to save extracted text");
      }
      
      setOcrProgress(90);
      
      // Generate summary
      await summarizeExtractedText(cleanText, force);
      
      setOcrProgress(100);
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
    
    const words = existingSummary.split(' ');
    let currentText = '';
    
    // Stream the existing summary word by word for better UX
    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? ' ' : '') + words[i];
      setSummary(currentText);
      setSummaryProgress((i + 1) / words.length * 100);
      await new Promise(resolve => setTimeout(resolve, 30)); // Small delay between words
    }
    
    setSummLoading(false);
    toast.success(rtl ? "تم تحميل الملخص المحفوظ" : "Loaded cached summary");
  };

  const summarizeExtractedText = async (text: string = extractedText, force = false) => {
    if (!text?.trim()) {
      toast.error(rtl ? "لا يوجد نص لتلخيصه" : "No text to summarize");
      return;
    }
    
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
      let fullSummary = '';
      let useEventSource = trimmedText.length <= 4000;
      
      if (useEventSource) {
        console.log('Using EventSource for smaller text');
        
        try {
          const textB64 = btoa(unescape(encodeURIComponent(trimmedText)));
          const eventSource = new EventSource(
            `https://ukznsekygmipnucpouoy.supabase.co/functions/v1/summarize-stream?` +
            `text_b64=${encodeURIComponent(textB64)}&` +
            `book_id=${encodeURIComponent(dbBookId)}&` +
            `page_number=${index + 1}&` +
            `lang=${rtl ? 'arabic' : 'english'}`
          );

          await new Promise<void>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout;
            
            eventSource.onopen = () => {
              console.log('EventSource opened');
              timeoutId = setTimeout(() => {
                eventSource.close();
                reject(new Error('EventSource timeout'));
              }, 120000);
            };

            eventSource.onmessage = (event) => {
              try {
                if (event.data === 'ok') {
                  // Skip the initial "ok" message
                  return;
                }
                
                if (event.data === '[DONE]') {
                  console.log('EventSource stream completed');
                  clearTimeout(timeoutId);
                  eventSource.close();
                  resolve();
                  return;
                }
                
                const parsed = JSON.parse(event.data);
                if (parsed.text) {
                  fullSummary += parsed.text;
                  setSummary(fullSummary);
                  setSummaryProgress(Math.min(95, fullSummary.length / 10));
                }
              } catch (e) {
                console.log('Failed to parse EventSource data:', event.data);
              }
            };

            eventSource.onerror = (error) => {
              console.error('EventSource error:', error);
              clearTimeout(timeoutId);
              eventSource.close();
              reject(new Error('EventSource connection failed'));
            };
          });
        } catch (eventSourceError) {
          console.warn('EventSource failed, falling back to fetch:', eventSourceError);
          // If EventSource got partial content, save it and try to complete with fetch
          if (fullSummary.trim()) {
            console.log('EventSource got partial content, keeping it and trying fetch:', fullSummary.length, 'characters');
            // Keep the partial summary visible while we try fetch
            setSummary(fullSummary);
            setSummaryProgress(50);
          }
          // Always try fetch as fallback
          useEventSource = false;
        }
      }
      
      if (!useEventSource) {
        console.log('Using fetch POST method');
        
        // Reset fullSummary when using fetch fallback to avoid duplication
        if (fullSummary.trim()) {
          console.log('Resetting existing partial summary for fresh fetch attempt');
          fullSummary = '';
          setSummary('');
        }
        
        const response = await fetch(`https://ukznsekygmipnucpouoy.supabase.co/functions/v1/summarize-stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // No Authorization header to prevent buffering
          },
          body: JSON.stringify({
            text: trimmedText,
            book_id: dbBookId,
            page_number: index + 1,
            lang: rtl ? 'arabic' : 'english'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        console.log('Starting to read streaming response...');

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Split on double newlines for more robust frame parsing
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            const lines = frame.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    console.log('Stream completed');
                    break;
                  }
                  
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    fullSummary += parsed.text;
                    setSummary(fullSummary);
                    setSummaryProgress(Math.min(95, fullSummary.length / 10));
                  }
                } catch (e) {
                  console.log('Failed to parse streaming data:', line.slice(6));
                }
              }
            }
          }
        }
      }

      if (fullSummary.trim()) {
        // Remove duplicate content and limit summary size
        const cleanSummary = fullSummary.split('### نظرة عامة')[0] + 
                           (fullSummary.includes('### نظرة عامة') ? '### نظرة عامة' + fullSummary.split('### نظرة عامة')[1] : '');
        const trimmedSummary = cleanSummary.substring(0, 8000); // Limit to 8KB
        
        localStorage.setItem(sumKey, trimmedSummary);
        setSummary(trimmedSummary);
        setSummaryConfidence(0.8);
        
        // Post-process: Check for missing numbered questions and complete them (non-blocking)
        checkAndCompleteMissingQuestions(trimmedSummary, trimmedText).catch(error => {
          console.error('Post-processing failed:', error);
        });
        
        toast.success(rtl ? "تم إنشاء الملخص بنجاح" : "Summary generated successfully");
        
        // Save complete summary to database (async, non-blocking)
        callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: index + 1,
          summary_md: trimmedSummary,
          confidence: 0.8
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
      // Clear existing data
      setExtractedText("");
      setSummary("");
      localStorage.removeItem(ocrKey);
      localStorage.removeItem(sumKey);
      
      // Force regenerate OCR and summary
      await extractTextFromPage(true);
      
      toast.success(rtl ? "تم إعادة توليد النص والملخص بنجاح" : "Successfully regenerated OCR and summary");
    } catch (error) {
      console.error('Force regenerate error:', error);
      toast.error(rtl ? "فشل في إعادة التوليد" : "Failed to regenerate content");
    }
  };

  // Automation functions for batch processing
  const handleNavigateToPage = useCallback((page: number) => {
    jumpToPage(page);
  }, [jumpToPage]);

  const handleExtractAndSummarize = useCallback(async (pageNumber: number) => {
    console.log(`Automation: Starting extraction and summarization for page ${pageNumber}`);
    
    try {
      // Ensure we're on the correct page first
      console.log(`Automation: Current page index: ${index + 1}, target page: ${pageNumber}`);
      
      if (index + 1 !== pageNumber) {
        console.log(`Automation: Page mismatch! Navigating to page ${pageNumber}...`);
        jumpToPage(pageNumber);
        
        // Wait for navigation and state update to complete with longer intervals
        let navigationAttempts = 0;
        const maxNavigationAttempts = 15;
        
        // Wait for React state to update - give it some initial time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check navigation success by getting current URL page parameter
        while (navigationAttempts < maxNavigationAttempts) {
          const urlParams = new URLSearchParams(window.location.search);
          const currentUrlPage = parseInt(urlParams.get('page') || '1');
          
          console.log(`Automation: Waiting for navigation... attempt ${navigationAttempts + 1}, URL page: ${currentUrlPage}, target: ${pageNumber}`);
          
          if (currentUrlPage === pageNumber) {
            console.log(`Automation: Navigation successful! URL shows page ${currentUrlPage}`);
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 800));
          navigationAttempts++;
        }
        
        if (navigationAttempts >= maxNavigationAttempts) {
          const urlParams = new URLSearchParams(window.location.search);
          const currentUrlPage = parseInt(urlParams.get('page') || '1');
          throw new Error(`Failed to navigate to page ${pageNumber}. Current URL page: ${currentUrlPage} after ${maxNavigationAttempts} attempts`);
        }
        
        // Additional wait for page to fully render
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      console.log(`Automation: Successfully on page ${pageNumber}, starting OCR extraction...`);
      
      // Force regeneration to ensure fresh extraction for the current page
      await extractTextFromPage(true);
      
      // Wait for both OCR and summarization to complete
      let attempts = 0;
      const maxAttempts = 45; // Increased to 45 seconds max wait
      let lastHasText = false;
      let lastHasSummary = false;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        
        // Check the database directly for this specific page
        const { data } = await supabase
          .from('page_summaries')
          .select('ocr_text, summary_md')
          .eq('book_id', dbBookId)
          .eq('page_number', pageNumber)
          .maybeSingle();
        
        const hasText = !!data?.ocr_text?.trim();
        const hasSummary = !!data?.summary_md?.trim();
        
        // Log progress when status changes
        if (hasText !== lastHasText || hasSummary !== lastHasSummary) {
          console.log(`Automation: Page ${pageNumber} progress - OCR: ${hasText ? 'COMPLETE' : 'PENDING'}, Summary: ${hasSummary ? 'COMPLETE' : 'PENDING'}`);
          lastHasText = hasText;
          lastHasSummary = hasSummary;
        }
        
        // Success condition: both OCR text and summary are present
        if (hasText && hasSummary) {
          console.log(`Automation: Page ${pageNumber} processing completed successfully after ${attempts} seconds`);
          return;
        }
        
        // If we have text but no summary, and summarization is not loading, something might be wrong
        if (hasText && !hasSummary && !summLoading && attempts > 10) {
          console.warn(`Automation: Page ${pageNumber} has OCR text but summarization seems stuck. Checking loading states...`);
          console.log(`Automation: OCR Loading: ${ocrLoading}, Summary Loading: ${summLoading}`);
        }
        
        // Periodic progress log
        if (attempts % 5 === 0) {
          console.log(`Automation: Page ${pageNumber} waiting... ${attempts}/${maxAttempts}s`);
        }
      }
      
      // If we reach here, the process didn't complete in time
      const finalCheck = await supabase
        .from('page_summaries')
        .select('ocr_text, summary_md')
        .eq('book_id', dbBookId)
        .eq('page_number', pageNumber)
        .maybeSingle();
        
      const finalHasText = !!finalCheck.data?.ocr_text?.trim();
      const finalHasSummary = !!finalCheck.data?.summary_md?.trim();
      
      console.error(`Automation: Page ${pageNumber} processing timeout after ${maxAttempts} seconds`);
      console.error(`Automation: Final status - OCR: ${finalHasText ? 'COMPLETE' : 'MISSING'}, Summary: ${finalHasSummary ? 'COMPLETE' : 'MISSING'}`);
      
      throw new Error(`Processing timeout: Page ${pageNumber} - OCR: ${finalHasText ? '✓' : '✗'}, Summary: ${finalHasSummary ? '✓' : '✗'}`);
      
    } catch (error) {
      console.error(`Automation: Error processing page ${pageNumber}:`, error);
      throw error;
    }
  }, [extractTextFromPage, ocrLoading, summLoading, dbBookId, supabase, index, jumpToPage]);

  const checkIfPageProcessed = useCallback(async (pageNumber: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('page_summaries')
        .select('ocr_text, summary_md')
        .eq('book_id', dbBookId)
        .eq('page_number', pageNumber)
        .maybeSingle();

      if (error) {
        console.warn('Error checking page processed status:', error);
        return false;
      }

      const hasOcr = data?.ocr_text?.trim();
      const hasSummary = data?.summary_md?.trim();
      
      return !!(hasOcr && hasSummary);
    } catch (error) {
      console.warn('Failed to check if page is processed:', error);
      return false;
    }
  }, [dbBookId]);

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
                    
                    {summary && (
                      <div className="mt-4">
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
            <div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
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
                        ref={zoomApiRef as any}
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

                      {/* Zoom controls would go here */}
                      <div className="absolute top-2 right-2 flex gap-2">
                        <Button onClick={zoomOut} size="sm" variant="outline">
                          <ZoomOut className="h-3 w-3" />
                        </Button>
                        <Button onClick={zoomIn} size="sm" variant="outline">
                          <ZoomIn className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </TouchGestureHandler>

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
                          value=""
                          onChange={e => setGotoInput("")}
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
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* Automate Processing Section */}
            <AutomateSection
              bookTitle={title}
              totalPages={total}
              currentPage={index + 1}
              rtl={rtl}
              onNavigateToPage={handleNavigateToPage}
              onExtractAndSummarize={handleExtractAndSummarize}
              checkIfPageProcessed={checkIfPageProcessed}
            />

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