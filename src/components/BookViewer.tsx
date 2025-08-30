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
import { useNavigate } from "react-router-dom";
import { MobileControlsOverlay } from "@/components/reader/MobileControlsOverlay";

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
  const [index, setIndex] = useState(0);
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

  // Navigation functions
  const goPrev = () => setIndex(i => Math.max(0, i - 1));
  const goNext = () => setIndex(i => Math.min(total - 1, i + 1));
  const jumpToPage = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), total);
    setIndex(clamped - 1);
  }, [total]);

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
    img.onload = () => {
      if (!active) return;
      setDisplaySrc(nextSrc);
      setImageLoading(false);
      setPageProgress(100);
    };
    img.onerror = () => {
      if (!active) return;
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

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || 
          (e.target as HTMLElement)?.tagName === "TEXTAREA" || 
          (e.target as HTMLElement)?.contentEditable === "true") {
        return;
      }
      
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          rtl ? goNext() : goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          rtl ? goPrev() : goNext();
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          goNext();
          break;
        case "Backspace":
          e.preventDefault();
          goPrev();
          break;
        case "+":
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
      }
    };
    
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, rtl]);

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
      try {
        const { data, error } = await supabase
          .from('page_summaries')
          .select('ocr_text, summary_md, confidence, ocr_confidence')
          .eq('book_id', dbBookId)
          .eq('page_number', index + 1)
          .maybeSingle();
          
        if (error) {
          console.warn('Supabase fetch error:', error);
          return;
        }
        if (cancelled) return;
        
        const ocr = (data?.ocr_text ?? '').trim();
        const sum = (data?.summary_md ?? '').trim();
        
        setExtractedText(ocr);
        setSummary(sum);
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

  const extractTextFromPage = async () => {
    setOcrLoading(true);
    setOcrProgress(0);
    setExtractedText("");
    setSummary("");
    setLastError(null);
    
    try {
      const imageSrc = pages[index]?.src;
      const isExternal = imageSrc.startsWith('http') && !imageSrc.includes(window.location.origin);
      let imageBlob: Blob | null = null;

      if (isExternal) {
        try {
          const proxyUrl = `https://ukznsekygmipnucpouoy.supabase.co/functions/v1/image-proxy?url=${encodeURIComponent(imageSrc)}`;
          const response = await fetch(proxyUrl, {
            headers: {
              'Accept': 'image/*',
              'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrem5zZWt5Z21pcG51Y3BvdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MjY4NzMsImV4cCI6MjA3MDIwMjg3M30.5gvy46gGEU-B9O3cutLNmLoX62dmEvKLC236yeaQ6So`
            }
          });
          if (!response.ok) throw new Error(`Proxy failed: ${response.status}`);
          imageBlob = await response.blob();
        } catch (e) {
          console.log('Proxy fetch failed, trying direct:', e);
          const directResponse = await fetch(imageSrc);
          imageBlob = await directResponse.blob();
        }
      } else {
        const response = await fetch(imageSrc);
        imageBlob = await response.blob();
      }

      setOcrProgress(25);
      
      // Run OCR with optimized settings for Arabic physics textbook
      console.log('Starting OCR for image blob:', imageBlob.size, 'bytes');
      
      // Simplified, proven OCR strategies that actually work
      let bestResult = null;
      const strategies = [
        // Strategy 1: Basic Arabic OCR with minimal preprocessing
        {
          lang: 'ara+eng',
          psm: 6, // Uniform block of text - most reliable
          preprocess: {
            upsample: true,
            targetMinWidth: 1200,
            denoise: false,
            binarize: false,
            adaptiveBinarization: true,
            contrastNormalize: false,
            cropMargins: false,
            deskew: false
          },
          autoRotate: true
        },
        // Strategy 2: Full page segmentation
        {
          lang: 'ara+eng',
          psm: 3, // Fully automatic page segmentation
          preprocess: {
            upsample: true,
            targetMinWidth: 1000,
            denoise: true,
            binarize: false,
            adaptiveBinarization: false,
            contrastNormalize: false,
            cropMargins: false,
            deskew: false
          },
          autoRotate: false
        },
        // Strategy 3: Basic settings - fallback
        {
          lang: 'ara+eng',
          psm: 4, // Variable-size blocks
          preprocess: false, // No preprocessing at all
          autoRotate: false
        }
      ];
      
      // Try each strategy with proper error handling and result logging
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`Trying OCR strategy ${i + 1}/${strategies.length}:`, strategies[i]);
          const result = await runLocalOcr(imageBlob, {
            ...strategies[i],
            onProgress: (progress) => setOcrProgress(25 + (progress * 60 / strategies.length / 100) + (i * 60 / strategies.length))
          });
          
          console.log(`Strategy ${i + 1} result:`, {
            textLength: result?.text?.length || 0,
            confidence: result?.confidence,
            preview: result?.text?.substring(0, 100) + (result?.text?.length > 100 ? '...' : '')
          });
          
          // Select best result based on text length and confidence
          if (result?.text && result.text.trim().length > 0) {
            if (!bestResult || 
                result.text.length > bestResult.text.length || 
                (result.text.length === bestResult.text.length && result.confidence > bestResult.confidence)) {
              bestResult = result;
            }
          }
          
          // Early exit if we got good results
          if (result?.text?.length > 50 && result?.confidence > 70) {
            console.log(`Good result found with strategy ${i + 1}, using it`);
            bestResult = result;
            break;
          }
          
        } catch (error) {
          console.error(`Strategy ${i + 1} failed:`, error);
        }
      }
      
      const ocrResult = bestResult;
      console.log('Final OCR result:', {
        textLength: ocrResult?.text?.length || 0,
        confidence: ocrResult?.confidence,
        preview: ocrResult?.text?.substring(0, 300)
      });
      
      setOcrProgress(75);
      
      if (ocrResult?.text?.trim()) {
        const cleanText = ocrResult.text.trim();
        setExtractedText(cleanText);
        localStorage.setItem(ocrKey, cleanText);
        
        // Save to database and generate summary
        await callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: index + 1,
          ocr_text: cleanText,
          ocr_confidence: ocrResult.confidence ? (ocrResult.confidence > 1 ? ocrResult.confidence / 100 : ocrResult.confidence) : 0.8
        });
        
        setOcrProgress(90);
        
        // Generate summary
        await summarizeExtractedText(cleanText);
      }
      
      setOcrProgress(100);
    } catch (error) {
      console.error('OCR Error:', error);
      setLastError(error instanceof Error ? error : String(error));
      toast.error(rtl ? "فشل في استخراج النص" : "Failed to extract text");
    } finally {
      setOcrLoading(false);
    }
  };

  const summarizeExtractedText = async (text: string = extractedText) => {
    if (!text?.trim()) {
      toast.error(rtl ? "لا يوجد نص لتلخيصه" : "No text to summarize");
      return;
    }
    
    setSummLoading(true);
    setSummaryProgress(0);
    setSummary("");
    
    try {
      console.log('Starting summary generation for text:', text.substring(0, 100));
      
      // Use streaming for real-time summary generation
      const response = await fetch(`https://ukznsekygmipnucpouoy.supabase.co/functions/v1/summarize-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrem5zZWt5Z21pcG51Y3BvdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MjY4NzMsImV4cCI6MjA3MDIwMjg3M30.5gvy46gGEU-B9O3cutLNmLoX62dmEvKLC236yeaQ6So`
        },
        body: JSON.stringify({
          text: text.trim(),
          book_id: dbBookId,
          page_number: index + 1,
          lang: rtl ? 'arabic' : 'english'  // Fixed parameter name
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
      let fullSummary = '';

      console.log('Starting to read streaming response...');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

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
                setSummaryProgress(Math.min(95, fullSummary.length / 10)); // Rough progress estimate
              }
            } catch (e) {
              console.log('Failed to parse streaming data:', line.slice(6));
            }
          }
        }
      }

      if (fullSummary.trim()) {
        localStorage.setItem(sumKey, fullSummary);
        setSummaryConfidence(0.8); // Default confidence for streaming
        toast.success(rtl ? "تم إنشاء الملخص بنجاح" : "Summary generated successfully");
        
        // Save complete summary to database
        try {
          await callFunction('save-page-summary', {
            book_id: dbBookId,
            page_number: index + 1,
            summary_md: fullSummary,
            confidence: 0.8
          });
        } catch (saveError) {
          console.error('Failed to save summary to database:', saveError);
        }
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

  const handleSmartSummarizeClick = () => {
    if (extractedText) {
      summarizeExtractedText();
    } else {
      extractTextFromPage();
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

  return (
    <section className={cn("w-full min-h-screen", rtl && "[direction:rtl]")}>
      {isMobile ? (
        <div className="min-h-screen">
          {/* Mobile controls would go here */}
          <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b p-2 flex items-center justify-between">
            <Button onClick={goPrev} disabled={index === 0} size="sm">
              {rtl ? "السابق" : "Previous"}
            </Button>
            <span className="text-sm">{index + 1} / {total}</span>
            <Button onClick={goNext} disabled={index === total - 1} size="sm">
              {rtl ? "التالي" : "Next"}
            </Button>
          </div>
          
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
          
          <Drawer>
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
                          onSummaryChange={setSummary}
                          onRegenerate={() => summarizeExtractedText()}
                          isRegenerating={summLoading}
                          confidence={summaryConfidence}
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
              </div>
            </DrawerContent>
          </Drawer>
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
                          placeholder={rtl ? "اذهب إلى" : "Go to"}
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
                onRetry={extractTextFromPage}
                isRetrying={ocrLoading || summLoading}
                retryCount={retryCount}
                context={ocrLoading ? (rtl ? "استخراج النص" : "OCR") : (rtl ? "التلخيص" : "Summarization")}
                rtl={rtl}
              />
            )}

            {/* OCR Content - Now indexable */}
            <details className="border rounded-lg bg-card shadow-sm">
              <summary className="cursor-pointer p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">
                    {rtl ? "النص المستخرج (OCR)" : "Extracted Text (OCR)"}
                  </h3>
                  <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => { e.preventDefault(); extractTextFromPage(); }}
                      disabled={ocrLoading}
                    >
                      {ocrLoading ? (rtl ? "جارٍ..." : "Working...") : (rtl ? "تشغيل OCR" : "Run OCR")}
                    </Button>
                  </div>
                </div>
              </summary>
              <div className="px-4 pb-4">
                {extractedText ? (
                  <div 
                    className={cn(
                      "text-sm leading-relaxed bg-muted/30 p-3 rounded border max-h-64 overflow-y-auto font-mono whitespace-pre-wrap",
                      rtl && "text-right"
                    )}
                    dir={rtl ? "rtl" : "ltr"}
                  >
                    {extractedText}
                  </div>
                ) : (
                  <div className={cn("text-center text-muted-foreground py-4", rtl && "text-right")}>
                    {rtl ? "لا يوجد نص مستخرج بعد" : "No OCR text extracted yet"}
                  </div>
                )}
              </div>
            </details>

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
          </div>
        </div>
      )}
    </section>
  );
};

export default BookViewer;