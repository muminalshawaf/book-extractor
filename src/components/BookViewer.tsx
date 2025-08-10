import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, Loader2, ChevronDown, Menu, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { runLocalOcr } from '@/lib/ocr/localOcr';
import QAChat from "@/components/QAChat";
import MathRenderer from "@/components/MathRenderer";
import { callFunction } from "@/lib/functionsClient";
import { supabase } from "@/integrations/supabase/client";
import { LoadingProgress } from "@/components/LoadingProgress";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ThumbnailSidebar } from "@/components/ThumbnailSidebar";
import { FullscreenMode, FullscreenButton } from "./FullscreenMode";
import { ZoomControls, ZoomMode } from "@/components/ZoomControls";
import { MiniMap } from "@/components/MiniMap";
import { useImagePreloader } from "@/hooks/useImagePreloader";
import { EnhancedSummary } from "@/components/EnhancedSummary";
import { ContentSearch } from "@/components/ContentSearch";
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
  bookId?: string; // used for per-book caching keys
}

export const BookViewer: React.FC<BookViewerProps> = ({
  pages,
  title = "Book",
  rtl = false,
  labels = {},
  bookId,
}) => {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const Z = { min: 0.25, max: 4, step: 0.1 } as const;
  const dims = useMemo(
    () => ({
      width: Math.round(800 * zoom),
      height: Math.round(1100 * zoom),
      minWidth: Math.round(320 * zoom),
      maxWidth: Math.round(900 * zoom),
      minHeight: Math.round(480 * zoom),
      maxHeight: Math.round(1400 * zoom),
    }),
    [zoom]
  );
  const total = pages.length;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomApiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [transformState, setTransformState] = useState<{ scale: number; positionX: number; positionY: number }>({ scale: 1, positionX: 0, positionY: 0 });
  const lastWheelNavRef = useRef<number>(0);
// const flipRef = useRef<any>(null);

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
    progress:
      labels.progress ??
      ((c: number, t: number, p: number) => `Page ${c} of ${t} • ${p}%`),
  } as const;

// Caching keys and state
const cacheId = useMemo(() => (bookId || title), [bookId, title]);
const ocrKey = useMemo(() => `book:ocr:${cacheId}:${index}`, [cacheId, index]);
const sumKey = useMemo(() => `book:summary:${cacheId}:${index}`, [cacheId, index]);
const dbBookId = useMemo(() => (bookId || title || 'book'), [bookId, title]);
const [summary, setSummary] = useState("");
  const [summLoading, setSummLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  
  // New state for enhanced features
  const [ocrProgress, setOcrProgress] = useState(0);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  // Image display fallback handling
  const [displaySrc, setDisplaySrc] = useState<string>(pages[0]?.src || "");
  const [triedWeserv, setTriedWeserv] = useState(false);
  const [triedNoCache, setTriedNoCache] = useState(false);
  
  
  useEffect(() => {
    setDisplaySrc(pages[index]?.src || "");
    setTriedWeserv(false);
    setTriedNoCache(false);
    setImageLoading(true);
  }, [index, pages]);

  const onImgError = () => {
    const original = pages[index]?.src || "";
    if (!triedWeserv && original) {
      const hostless = original.replace(/^https?:\/\//, '');
      const wes = `https://images.weserv.nl/?url=${encodeURIComponent(hostless)}&output=jpg`;
      setTriedWeserv(true);
      setDisplaySrc(wes);
      setImageLoading(true);
      return;
    }
    if (!triedNoCache && original) {
      const sep = original.includes('?') ? '&' : '?';
      setTriedNoCache(true);
      setDisplaySrc(`${original}${sep}nocache=${Date.now()}`);
      setImageLoading(true);
      return;
    }
    setImageLoading(false);
    toast.error(rtl ? "تعذّر تحميل صورة الصفحة" : "Failed to load page image");
  };
  const [zoomMode, setZoomMode] = useState<ZoomMode>("custom");
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });
  const [readerMode, setReaderMode] = useState<'page' | 'continuous'>("page");
  const continuousRef = useRef<ContinuousReaderRef | null>(null);
  
  // Image preloading
  const { getPreloadStatus } = useImagePreloader(pages, index);
  
  // Phase 3 enhancements
  const [searchHighlight, setSearchHighlight] = useState("");
  const [lastError, setLastError] = useState<Error | string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [summaryConfidence, setSummaryConfidence] = useState<number | undefined>();
  
  // Store extracted text for all pages for search
  const [allExtractedTexts, setAllExtractedTexts] = useState<Record<number, string>>({});
  
  // Phase 4 enhancements
  const [accessibilityPanelOpen, setAccessibilityPanelOpen] = useState(false);
  const [performanceMonitorOpen, setPerformanceMonitorOpen] = useState(false);
  const isMobile = useIsMobile();
  const insightsRef = useRef<HTMLDivElement | null>(null);
  const [gotoInput, setGotoInput] = useState<string>("");
  const [controlsOpen, setControlsOpen] = useState(true);
  const [insightTab, setInsightTab] = useState<'summary' | 'qa'>('summary');

// Batch processing state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  // Page range selection for batch processing
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(10);

  const goPrev = () => {
    setIndex((i) => {
      const ni = Math.max(0, i - 1);
      if (readerMode === 'continuous') {
        continuousRef.current?.scrollToIndex(ni);
      }
      return ni;
    });
  };

  const goNext = () => {
    setIndex((i) => {
      const ni = Math.min(total - 1, i + 1);
      if (readerMode === 'continuous') {
        continuousRef.current?.scrollToIndex(ni);
      }
      return ni;
    });
  };

  const jumpToPage = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), total);
    const target = clamped - 1;
    setIndex(target);
    if (readerMode === 'continuous') {
      continuousRef.current?.scrollToIndex(target);
    }
  }, [total, readerMode]);

  // Enhanced keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if typing in input fields
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
        case "t":
        case "T":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setThumbnailsOpen(!thumbnailsOpen);
          }
          break;
        case "s":
        case "S":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (!ocrLoading && !summLoading) {
              extractTextFromPage();
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, rtl, thumbnailsOpen, ocrLoading, summLoading]);

  // Load cached data on page change
  useEffect(() => {
    try {
      const cachedText = localStorage.getItem(ocrKey) || "";
      const cachedSummary = localStorage.getItem(sumKey) || "";
      if (cachedText) {
        setExtractedText(cachedText);
        setAllExtractedTexts(prev => ({ ...prev, [index]: cachedText }));
      }
      if (cachedSummary) setSummary(cachedSummary);
      
      // Clear error state when changing pages
      setLastError(null);
      setRetryCount(0);
    } catch {}
  }, [index, ocrKey, sumKey]);

  // Fetch OCR and summary from Supabase for current page
  useEffect(() => {
    let cancelled = false;
    const fetchFromDb = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('page_summaries')
          .select('ocr_text, summary_md')
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

        // Always mirror DB state. If no value in DB, fields should be empty
        setExtractedText(ocr);
        setAllExtractedTexts(prev => ({ ...prev, [index]: ocr }));
        setSummary(sum);

        try {
          if (ocr) localStorage.setItem(ocrKey, ocr); else localStorage.removeItem(ocrKey);
          if (sum) localStorage.setItem(sumKey, sum); else localStorage.removeItem(sumKey);
        } catch {}
      } catch (e) {
        console.warn('Failed to fetch page from DB:', e);
      }
    };
    fetchFromDb();
    return () => { cancelled = true; };
  }, [index, dbBookId, ocrKey, sumKey]);


// Reset state when switching books
useEffect(() => {
  setIndex(0);
  setSummary("");
  setExtractedText("");
  setAllExtractedTexts({});
  setLastError(null);
}, [bookId, pages]);

// Enhanced OCR function with better error handling
  const extractTextFromPage = async () => {
    setOcrLoading(true);
    setOcrProgress(0);
    setExtractedText("");
    setSummary("");
    setLastError(null);
    
    try {
      console.log('Starting OCR process...');
      const imageSrc = pages[index]?.src;
      console.log('Image source:', imageSrc);
      
      let imageBlob: Blob | null = null;
      
      // If external image, try proxy and public image CDN fallbacks
      const isExternal = imageSrc.startsWith('http') && !imageSrc.includes(window.location.origin);
      if (isExternal) {
        // 1) Try Supabase Edge Function proxy
        try {
          console.log('Trying Supabase image-proxy...');
          const proxyUrl = `/functions/v1/image-proxy?url=${encodeURIComponent(imageSrc)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error(`Proxy failed: ${response.status}`);
          const ct = response.headers.get('content-type') || '';
          if (!ct.includes('image')) throw new Error(`Proxy returned non-image (content-type: ${ct})`);
          imageBlob = await response.blob();
          console.log('Image fetched via proxy successfully');
        } catch (e) {
          console.log('Proxy fetch failed, will try weserv fallback:', e);
        }

        // 2) Fallback to images.weserv.nl (public image proxy with CORS)
        if (!imageBlob) {
          try {
            const hostless = imageSrc.replace(/^https?:\/\//, '');
            const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(hostless)}&output=jpg`;
            console.log('Trying weserv proxy:', weservUrl);
            const wesRes = await fetch(weservUrl, { headers: { 'Accept': 'image/*' } });
            if (!wesRes.ok) throw new Error(`weserv failed: ${wesRes.status}`);
            const ct2 = wesRes.headers.get('content-type') || '';
            if (!ct2.includes('image')) throw new Error(`weserv returned non-image (content-type: ${ct2})`);
            imageBlob = await wesRes.blob();
            console.log('Image fetched via weserv successfully');
          } catch (wesErr) {
            console.log('weserv proxy failed:', wesErr);
          }
        }
      }

      // 3) Local images or last-resort canvas conversion
      if (!imageBlob) {
        console.log('Attempting to load image via HTMLImageElement + canvas...');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageSrc;
        });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        imageBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to convert canvas to blob'));
          }, 'image/jpeg', 0.9);
        });
        console.log('Image converted to blob via canvas');
      }

      if (!imageBlob) {
        throw new Error('Unable to load image due to CORS or network restrictions');
      }
      
      console.log('Running enhanced local OCR...');
      setOcrProgress(20);
      const result = await runLocalOcr(imageBlob, {
        lang: rtl ? 'ara+eng' : 'eng',
        psm: 6,
        preprocess: {
          upsample: true,
          targetMinWidth: 1400,
          denoise: true,
          binarize: true,
          cropMargins: true,
        },
        onProgress: (p) => setOcrProgress(Math.max(20, Math.min(95, p))),
      });
      setOcrProgress(100);
      const text = result.text;
      
      console.log('OCR completed, extracted text length:', text.length);
      console.log('First 200 chars:', text.substring(0, 200));
      
      if (!text.trim()) {
        throw new Error(rtl ? "لم يتم العثور على نص في الصورة" : "No text found in image");
      }
      
      setExtractedText(text);
      setAllExtractedTexts(prev => ({ ...prev, [index]: text }));
      try { localStorage.setItem(ocrKey, text); } catch {}
      console.log('Starting summarization...');
      await summarizeExtractedText(text);
      toast.success(rtl ? "تم استخراج النص من الصفحة بنجاح" : "Text extracted successfully");
      setRetryCount(0); // Reset retry count on success
    } catch (error: any) {
      console.error('OCR error details:', error);
      const errorMsg = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      setLastError(error);
      setRetryCount(prev => prev + 1);
      toast.error(rtl ? `فشل في استخراج النص: ${errorMsg}` : `Failed to extract text: ${errorMsg}`);
    } finally {
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };

  // Enhanced summarization function with confidence scoring (streaming)
  const summarizeExtractedText = async (text: string) => {
    setSummLoading(true);
    setSummaryProgress(0);
    try {
      console.log('Starting summarization with text length:', text.length);
      setSummary('');
      setSummaryConfidence(0.8);

      const streamUrl = "https://ukznsekygmipnucpouoy.supabase.co/functions/v1/summarize-stream";
      const lang = rtl ? 'ar' : 'en';
      let accumulated = '';
      let lastFlush = 0;

      const flush = () => {
        setSummary(accumulated);
      };

      // Prefer EventSource for smaller payloads
      const canUseES = text.length <= 3000; // safe size when base64 encoded
      if (canUseES) {
        await new Promise<void>((resolve, reject) => {
          const params = new URLSearchParams();
          const b64 = btoa(unescape(encodeURIComponent(text)));
          params.set('text_b64', b64);
          params.set('lang', lang);
          params.set('page', String(index + 1));
          params.set('title', title);

          const es = new EventSource(`${streamUrl}?${params.toString()}`);

          es.onmessage = (ev) => {
            let chunk = ev.data;
            try { const j = JSON.parse(chunk); chunk = j?.text ?? chunk; } catch {}
            accumulated += chunk;
            const now = (globalThis.performance?.now?.() ?? Date.now());
            if (now - lastFlush > 150) { flush(); lastFlush = now; }
          };
          es.addEventListener('done', () => { flush(); es.close(); resolve(); });
          es.onerror = (err) => { es.close(); reject(err); };
        });
      } else {
        // Fallback to POST streaming
        const res = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          body: JSON.stringify({ text, lang, page: index + 1, title }),
        });
        if (!res.ok || !res.body) throw new Error(`Stream request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          for (const evt of events) {
            const lines = evt.split(/\r?\n/);
            for (const ln of lines) {
              if (ln.startsWith('data:')) {
                const raw = ln.slice(5);
                if (raw.trim() === '[DONE]') continue;
                let chunk = raw;
                try { const j = JSON.parse(raw); chunk = j?.text ?? chunk; } catch {}
                accumulated += chunk;
                const now = (globalThis.performance?.now?.() ?? Date.now());
                if (now - lastFlush > 150) { flush(); lastFlush = now; }
              }
            }
          }
        }
        flush();
      }

      if (!accumulated.trim()) { throw new Error('Empty streamed summary'); }
      setSummaryProgress(100);
      try { localStorage.setItem(sumKey, accumulated); } catch {}
      // Save to DB
      try {
        await callFunction('save-page-summary', {
          book_id: dbBookId,
          page_number: index + 1,
          ocr_text: text,
          summary_md: accumulated,
        });
      } catch (saveErr) {
        console.warn('Failed to save summary to DB:', saveErr);
      }
      toast.success(rtl ? "تم إنشاء الملخص" : "Summary ready");
      setRetryCount(0);
    } catch (e: any) {
      console.error('Summarize stream error, falling back:', e);
      try {
        setSummaryProgress(25);
        const data = await callFunction<{ summary?: string; error?: string; confidence?: number }>('summarize', {
          text,
          lang: rtl ? 'ar' : 'en',
          page: index + 1,
          title,
        });
        setSummaryProgress(75);
        if (data?.error) throw new Error(data.error);
        const s = data?.summary || '';
        setSummary(s);
        setSummaryConfidence(data?.confidence || 0.8);
        setSummaryProgress(100);
        try { localStorage.setItem(sumKey, s); } catch {}
        try {
          await callFunction('save-page-summary', {
            book_id: dbBookId,
            page_number: index + 1,
            ocr_text: text,
            summary_md: s,
          });
        } catch (saveErr) {
          console.warn('Failed to save summary to DB:', saveErr);
        }
        toast.success(rtl ? 'تم إنشاء الملخص' : 'Summary ready');
        setRetryCount(0);
      } catch (err: any) {
        console.error('Summarize error details:', err);
        const errorMsg = err?.message || String(err);
        setLastError(err);
        setRetryCount(prev => prev + 1);
        toast.error(rtl ? `فشل التلخيص: ${errorMsg}` : `Failed to summarize: ${errorMsg}`);
      }
    } finally {
      setSummLoading(false);
      setSummaryProgress(0);
    }
  };

  // Helper: stream pre-saved summary to UI as if AI is responding
  const simulateStreaming = async (full: string) => {
    setSummary("");
    setSummLoading(true);
    setSummaryProgress(0);
    const totalLen = full.length;
    const steps = Math.min(80, Math.max(10, Math.ceil(totalLen / 40)));
    const chunkSize = Math.max(10, Math.ceil(totalLen / steps));
    let pos = 0;
    while (pos < totalLen) {
      const chunk = full.slice(pos, pos + chunkSize);
      pos += chunkSize;
      setSummary((prev) => prev + chunk);
      await new Promise((r) => setTimeout(r, 20));
    }
    setSummaryProgress(100);
    setSummLoading(false);
    try { localStorage.setItem(sumKey, full); } catch {}
  };

  // Smart summarize button: prefer DB if available, otherwise process page
  const handleSmartSummarizeClick = async () => {
    if (ocrLoading || summLoading) return;
    setLastError(null);
    setInsightTab('summary');
    insightsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const { data, error } = await (supabase as any)
        .from('page_summaries')
        .select('ocr_text, summary_md')
        .eq('book_id', dbBookId)
        .eq('page_number', index + 1)
        .maybeSingle();

      if (error) {
        console.warn('Supabase read error:', error);
      }

      const storedSummary = (data?.summary_md || '').trim();
      const storedOcr = (data?.ocr_text || '').trim();

      if (storedSummary) {
        if (storedOcr) {
          setExtractedText(storedOcr);
          setAllExtractedTexts(prev => ({ ...prev, [index]: storedOcr }));
          try { localStorage.setItem(ocrKey, storedOcr); } catch {}
        }
        await simulateStreaming(storedSummary);
        toast.message(rtl ? 'تم استرجاع ملخص محفوظ' : 'Loaded saved summary');
        return;
      }
    } catch (e) {
      console.warn('DB check failed, proceeding to generate:', e);
    }

    // If nothing in DB, follow processing flow for this page
    if (extractedText) {
      await summarizeExtractedText(extractedText);
    } else {
      await extractTextFromPage();
    }
  };

  // Utility to compute best-fit scale for current container
  const getFitScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 1;
    const containerWidth = el.clientWidth - 32;
    const containerHeight = el.clientHeight - 32;
    const fitWidthScale = containerWidth / 800;
    const fitHeightScale = containerHeight / 1100;
    return Math.min(fitWidthScale, fitHeightScale);
  }, []);

  // Enhanced zoom functions (prefer engine API in Slides mode)
  const zoomOut = useCallback(() => {
    if (readerMode === 'page' && zoomApiRef.current) {
      zoomApiRef.current.zoomOut(Z.step, 200, 'easeOut');
      setZoomMode('custom');
    } else {
      setZoom((z) => Math.max(Z.min, +(z - Z.step).toFixed(2)));
      setZoomMode('custom');
    }
  }, [readerMode]);
  
  const zoomIn = useCallback(() => {
    if (readerMode === 'page' && zoomApiRef.current) {
      zoomApiRef.current.zoomIn(Z.step, 200, 'easeOut');
      setZoomMode('custom');
    } else {
      setZoom((z) => Math.min(Z.max, +(z + Z.step).toFixed(2)));
      setZoomMode('custom');
    }
  }, [readerMode]);
  
  const fitToWidth = useCallback(() => {
    const el = containerRef.current;
    const newZoom = el ? Math.min(Z.max, (el.clientWidth - 32) / 800) : 1;
    if (readerMode === 'page' && zoomApiRef.current) {
      zoomApiRef.current.setTransform(transformState.positionX, transformState.positionY, newZoom, 200, 'easeOut');
    } else {
      setZoom(newZoom);
    }
    setZoomMode('fit-width');
  }, [readerMode, transformState.positionX, transformState.positionY]);
  
  const fitToHeight = useCallback(() => {
    const el = containerRef.current;
    const newZoom = el ? Math.min(Z.max, (el.clientHeight - 32) / 1100) : 1;
    if (readerMode === 'page' && zoomApiRef.current) {
      zoomApiRef.current.setTransform(transformState.positionX, transformState.positionY, newZoom, 200, 'easeOut');
    } else {
      setZoom(newZoom);
    }
    setZoomMode('fit-height');
  }, [readerMode, transformState.positionX, transformState.positionY]);
  
  const actualSize = useCallback(() => {
    if (readerMode === 'page' && zoomApiRef.current) {
      zoomApiRef.current.setTransform(transformState.positionX, transformState.positionY, 1, 200, 'easeOut');
    } else {
      setZoom(1);
    }
    setZoomMode('actual-size');
  }, [readerMode, transformState.positionX, transformState.positionY]);

  // Process whole book: OCR -> summarize -> save (skips already-processed pages)
  const processFirstTenPages = async () => {
    if (batchRunning) return;
    const bookIdentifier = (bookId || title || 'book');

    setBatchRunning(true);
    try {
      // 1) Find pages already processed to avoid duplicate work
      const { data: existingRows, error: existingErr } = await (supabase as any)
        .from('page_summaries')
        .select('page_number')
        .eq('book_id', bookIdentifier);
      if (existingErr) {
        console.warn('Failed to fetch existing pages:', existingErr);
      }
      const processed = new Set<number>((existingRows || []).map((r: any) => r.page_number));

      // 2) Build processing queue for selected range (only missing pages)
      const s = Math.max(1, Math.min(total, Math.floor(rangeStart || 1)));
      const e = Math.max(1, Math.min(total, Math.floor(rangeEnd || s)));
      if (s > e) {
        toast.error(rtl ? 'الرجاء تحديد نطاق صحيح: البداية أقل من أو تساوي النهاية' : 'Please select a valid range: start <= end');
        return;
      }

      const toProcessIndices: number[] = [];
      for (let i = s - 1; i <= e - 1; i++) {
        const pageNo = i + 1;
        if (!processed.has(pageNo)) toProcessIndices.push(i);
      }

      const limit = toProcessIndices.length;
      setBatchProgress({ current: 0, total: limit });

      if (limit === 0) {
        toast.info(rtl ? 'النطاق المحدد مُعالج مسبقًا' : 'Selected range already processed');
        return;
      }

      toast.message(rtl ? `بدء معالجة الصفحات من ${s} إلى ${e}` : `Starting pages ${s} to ${e}`);

      const getImageBlob = async (imageSrc: string): Promise<Blob> => {
        let imageBlob: Blob | null = null;
        const isExternal = imageSrc.startsWith('http') && !imageSrc.includes(window.location.origin);
        if (isExternal) {
          try {
            const proxyUrl = `/functions/v1/image-proxy?url=${encodeURIComponent(imageSrc)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Proxy failed: ${response.status}`);
            const ct = response.headers.get('content-type') || '';
            if (!ct.includes('image')) throw new Error(`Proxy returned non-image (content-type: ${ct})`);
            imageBlob = await response.blob();
          } catch {}
          if (!imageBlob) {
            try {
              const hostless = imageSrc.replace(/^https?:\/\//, '');
              const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(hostless)}&output=jpg`;
              const wesRes = await fetch(weservUrl, { headers: { 'Accept': 'image/*' } });
              if (!wesRes.ok) throw new Error(`weserv failed: ${wesRes.status}`);
              const ct2 = wesRes.headers.get('content-type') || '';
              if (!ct2.includes('image')) throw new Error(`weserv returned non-image (content-type: ${ct2})`);
              imageBlob = await wesRes.blob();
            } catch {}
          }
        }
        if (!imageBlob) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve as any;
            img.onerror = reject as any;
            img.src = imageSrc;
          });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not get canvas context');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          imageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            }, 'image/jpeg', 0.9);
          });
        }
        return imageBlob;
      };

      // 3) Process queue sequentially to avoid CPU overload and function timeouts
      for (let k = 0; k < toProcessIndices.length; k++) {
        const i = toProcessIndices[k];
        setBatchProgress({ current: k + 1, total: limit });
        const page = pages[i];
        if (!page) continue;

        try {
          // OCR
          const blob = await getImageBlob(page.src);
          const ocrRes = await runLocalOcr(blob, {
            lang: rtl ? 'ara+eng' : 'eng',
            psm: 6,
            preprocess: {
              upsample: true,
              targetMinWidth: 1200, // slightly lower for speed in batch
              denoise: true,
              binarize: true,
              cropMargins: true,
            },
          });
          const text = ocrRes.text || '';

          // Summarize (non-stream for batch reliability)
          const data = await callFunction<{ summary?: string; error?: string }>('summarize', {
            text,
            lang: rtl ? 'ar' : 'en',
            page: i + 1,
            title,
          });
          if (data?.error) throw new Error(data.error);
          const summaryMd = data?.summary || '';

          // Save to DB via Edge Function
          await callFunction('save-page-summary', {
            book_id: bookIdentifier,
            page_number: i + 1,
            ocr_text: text,
            summary_md: summaryMd,
          });
        } catch (pageErr: any) {
          console.warn(`Failed processing page ${i + 1}:`, pageErr);
          // Continue with next page
        }

        // Yield to the browser to keep UI responsive
        await new Promise((r) => setTimeout(r, 0));
      }

      toast.success(rtl ? 'اكتملت معالجة الصفحات المحددة' : 'Processed selected pages successfully');
    } catch (e: any) {
      console.error('Batch processing failed:', e);
      toast.error((rtl ? 'فشل المعالجة: ' : 'Processing failed: ') + (e?.message || e));
    } finally {
      setBatchRunning(false);
    }
  };

  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100;

  // Pan/zoom engine state (managed by react-zoom-pan-pinch)
  const [isPanning, setIsPanning] = useState(false);

  const handleWheelNav = useCallback((e: React.WheelEvent) => {
    if (readerMode !== 'page') return;
    if (e.ctrlKey || e.metaKey) return; // let ctrl/cmd+wheel zoom
    if (isPanning) return;
    const el = containerRef.current;
    if (!el) return;
    const now = (globalThis.performance?.now?.() ?? Date.now());

    // Compute "fit" scale and whether content is pannable (larger than viewport)
    const containerWidth = el.clientWidth;
    const containerHeight = el.clientHeight;
    const imgW = naturalSize.width || 800;
    const imgH = naturalSize.height || 1100;
    const contentW = imgW * transformState.scale;
    const contentH = imgH * transformState.scale;
    const pannable = contentW > containerWidth + 1 || contentH > containerHeight + 1;
    if (pannable) return; // don't navigate via wheel when zoomed in

    const fitWidthScale = containerWidth / imgW;
    const fitHeightScale = containerHeight / imgH;
    const fitScale = Math.min(fitWidthScale, fitHeightScale);

    // Only navigate when at or below fit scale
    if (transformState.scale <= fitScale + 0.0001) {
      e.preventDefault();
      if (now - lastWheelNavRef.current < 300) return; // throttle navigation
      lastWheelNavRef.current = now;
      if (e.deltaY > 0) goNext(); else goPrev();
    }
  }, [readerMode, isPanning, transformState.scale, naturalSize]);

  const panningEnabled = useMemo(() => {
    const el = containerRef.current;
    if (!el) return false;
    const wrapperW = el.clientWidth;
    const wrapperH = el.clientHeight;
    const imgW = naturalSize.width || 800;
    const imgH = naturalSize.height || 1100;
    const contentW = imgW * transformState.scale;
    const contentH = imgH * transformState.scale;
    return contentW > wrapperW + 1 || contentH > wrapperH + 1;
  }, [transformState.scale, naturalSize, readerMode, index]);

  return (
    <section aria-label={`${title} viewer`} dir={rtl ? "rtl" : "ltr"} className="w-full" itemScope itemType="https://schema.org/CreativeWork">
      {isMobile ? (
        <div className="flex flex-col gap-4">

          {/* Viewer */}
          <FullscreenMode rtl={rtl}>
            <Card className="shadow-none border-none bg-transparent animate-fade-in">
              <CardHeader className="sr-only">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg" itemProp="name">{title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <KeyboardShortcuts rtl={rtl} />
                    <div className="text-sm text-muted-foreground select-none">
                      {L.progress(index + 1, total, progressPct)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <TouchGestureHandler
                  onSwipeLeft={rtl ? goPrev : goNext}
                  onSwipeRight={rtl ? goNext : goPrev}
                  onPinch={(scale) => {
                    const newZoom = Math.min(Z.max, Math.max(Z.min, zoom * scale));
                    setZoom(newZoom);
                    setZoomMode("custom");
                  }}
                  disabled={!isMobile || readerMode === 'continuous'}
                  className="relative"
                >
                  <div 
                    ref={containerRef}
                    className={cn(
                      "relative w-full overflow-hidden",
                      !isMobile && "border rounded-lg mb-4",
                      panningEnabled ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
                      isMobile && "book-viewer-mobile"
                    )}
                    style={{}}
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
                      centerZoomedOut
                      limitToBounds
                      panning={{ disabled: !panningEnabled }}
                      wheel={{ activationKeys: ["Control", "Meta"], step: Z.step }}
                      doubleClick={{ disabled: false, step: 0.5, mode: "zoomIn" }}
                      onTransformed={(refState) => {
                        const { scale, positionX, positionY } = refState.state;
                        setTransformState({ scale, positionX, positionY });
                        setZoomMode("custom");
                        setZoom(scale);
                      }}
                      onPanningStart={() => setIsPanning(true)}
                      onPanningStop={() => setIsPanning(false)}
                    >
                      <TransformComponent
                        wrapperClass="w-full h-svh"
                        contentClass="flex items-start justify-center py-2"
                      >
                        <img
                          src={displaySrc}
                          alt={pages[index]?.alt}
                          loading="eager"
                          decoding="async"
                          draggable={false}
                          onLoadStart={() => setImageLoading(true)}
                          onLoad={(e) => {
                            setImageLoading(false);
                            const imgEl = e.currentTarget;
                            setNaturalSize({ width: imgEl.naturalWidth, height: imgEl.naturalHeight });
                            if (containerRef.current) {
                              setContainerDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
                            }
                          }}
                          onError={onImgError}
                          className="select-none max-w-full max-h-full object-contain will-change-transform"
                          itemProp="image"
                          aria-describedby={`page-${index}-description`}
                        />
                      </TransformComponent>
                    </TransformWrapper>

                    <MobileControlsOverlay
                      progressText={L.progress(index + 1, total, progressPct)}
                      rtl={rtl}
                      onToggleThumbnails={() => setThumbnailsOpen(!thumbnailsOpen)}
                      onOpenInsights={() => insightsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      onPrev={goPrev}
                      onNext={goNext}
                      canPrev={index > 0}
                      canNext={index < total - 1}
                      onZoomIn={zoomIn}
                      onZoomOut={zoomOut}
                      fullscreenButton={<FullscreenButton rtl={rtl} />}
                    />

                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <LoadingProgress type="image" progress={getPreloadStatus(pages[index]?.src) === "loaded" ? 100 : 50} rtl={rtl} />
                      </div>
                    )}

                    <div id={`page-${index}-description`} className="sr-only">
                      {rtl ? `صفحة ${index + 1} من ${total}` : `Page ${index + 1} of ${total}`}
                    </div>
                  </div>
                </TouchGestureHandler>

              </CardContent>
            </Card>
          </FullscreenMode>

          {/* Insights under reader (mobile) */}
          <div ref={insightsRef} className="px-3 pt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{rtl ? "لوحة الرؤى" : "Insight Panel"}</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <Tabs value={insightTab} onValueChange={(v) => setInsightTab(v as any)} className="w-full">
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="summary">{rtl ? "ملخص الصفحة" : "Page Summary"}</TabsTrigger>
                    <TabsTrigger value="qa">
                      {rtl ? (
                        <span className="inline-flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          <span>المدرس الإفتراضي</span>
                        </span>
                      ) : (
                        "Ask the doc"
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="mt-4 m-0">
                    <Button className="w-full" variant="default" onClick={handleSmartSummarizeClick} disabled={ocrLoading || summLoading}>
                      <>
                        {(ocrLoading || summLoading) ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{rtl ? "جارٍ التلخيص..." : "Summarizing..."}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className={cn("h-4 w-4", rtl ? "ml-2" : "mr-2")} />
                            <span>{rtl ? "المدرس الإفتراضي" : "AI Tutor"}</span>
                          </>
                        )}
                      </>
                    </Button>
                    {!summary && (
                      <div className="mt-3 text-sm text-muted-foreground border rounded-md p-3">
                        {rtl ? "لا يوجد ملخص بعد. اضغط \"لخص هذه الصفحة\" لإنشائه." : "No summary yet. Click Summarize this page to generate one."}
                      </div>
                    )}
                    {lastError && (
                      <div className="mt-3">
                        <ImprovedErrorHandler error={lastError} onRetry={extractTextFromPage} isRetrying={ocrLoading || summLoading} retryCount={retryCount} context={ocrLoading ? (rtl ? "استخراج النص" : "OCR") : (rtl ? "التلخيص" : "Summarization")} rtl={rtl} />
                      </div>
                    )}
                    {summary && (
                      <div className="mt-3">
                        <EnhancedSummary
                          summary={summary}
                          onSummaryChange={(newSummary) => { setSummary(newSummary); try { localStorage.setItem(sumKey, newSummary); } catch {} }}
                          onRegenerate={() => { if (extractedText) { summarizeExtractedText(extractedText); } else { toast.error(rtl ? "يجب استخراج النص أولاً" : "Extract text first"); } }}
                          isRegenerating={summLoading}
                          confidence={summaryConfidence}
                          pageNumber={index + 1}
                          rtl={rtl}
                          title={title}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="qa" className="mt-4 m-0">
                    <QAChat summary={summary || extractedText} rtl={rtl} title={title} page={index + 1} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="gap-4">
          {/* LEFT: Viewer */}
          <ResizablePanel defaultSize={70} minSize={55}>
            <div className="flex gap-4">
              {/* Thumbnail Sidebar */}
              <div className={cn("flex-shrink-0 animate-fade-in transition-all duration-300", !thumbnailsOpen && "w-0 overflow-hidden")}>
                <ThumbnailSidebar
                  pages={pages}
                  currentIndex={index}
                  onPageSelect={(i) => { setIndex(i); if (readerMode === 'continuous') { continuousRef.current?.scrollToIndex(i); } }}
                  isOpen={thumbnailsOpen}
                  onToggle={() => setThumbnailsOpen(!thumbnailsOpen)}
                  rtl={rtl}
                />
              </div>

              {/* Main Content */}
              <div className="flex-1 flex flex-col gap-6">
                {/* Content Search (above zoom controls) */}
                <ContentSearch pages={allExtractedTexts} currentPageIndex={index} onPageChange={setIndex} onHighlight={setSearchHighlight} rtl={rtl} />

                {/* Collapsible Desktop Toolbar */}
                <div className="hidden md:block">
                  <Collapsible open={controlsOpen} onOpenChange={setControlsOpen}>
                    <div className="sticky top-0 z-20">
                      <div className="flex items-center justify-between bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70 rounded-lg p-2 shadow-sm border">
                        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                          <CollapsibleTrigger asChild>
                            <Button size="icon" variant="outline" aria-label={rtl ? "إظهار/إخفاء الأدوات" : "Toggle controls"}>
                              <ChevronDown className={cn("h-4 w-4 transition-transform", controlsOpen ? "rotate-180" : "rotate-0")} />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")} aria-label={rtl ? "إجراءات" : "Actions"}>
                          <Button size="icon" variant="outline" onClick={zoomOut} aria-label={rtl ? "تصغير" : "Zoom out"} className="h-9 w-9">
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="outline" onClick={zoomIn} aria-label={rtl ? "تكبير" : "Zoom in"} className="h-9 w-9">
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <FullscreenButton rtl={rtl} />
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="mt-2">
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
                            showMiniMap={showMiniMap && readerMode === 'page'}
                            onToggleMiniMap={() => setShowMiniMap(!showMiniMap)}
                            rtl={rtl}
                            iconsOnly
                          />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </div>


                {/* Page Area with Fullscreen */}
                <FullscreenMode rtl={rtl}>
                  <Card className="shadow-sm animate-fade-in">
                    <CardContent>
                      <TouchGestureHandler
                        onSwipeLeft={rtl ? goPrev : goNext}
                        onSwipeRight={rtl ? goNext : goPrev}
                        onPinch={(scale) => {
                          const newZoom = Math.min(Z.max, Math.max(Z.min, zoom * scale));
                          setZoom(newZoom);
                          setZoomMode("custom");
                        }}
                        disabled={!isMobile || readerMode === 'continuous'}
                        className="relative"
                      >
                        {readerMode === 'page' ? (
                          <div 
                            ref={containerRef}
                            className={cn(
                              "relative w-full border rounded-lg mb-4 overflow-hidden",
                              panningEnabled ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
                              isMobile && "book-viewer-mobile"
                            )}
                            style={{ maxHeight: '78vh' }}
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
                              centerZoomedOut
                              limitToBounds
                              panning={{ disabled: !panningEnabled }}
                              wheel={{ activationKeys: ["Control", "Meta"], step: Z.step }}
                              doubleClick={{ disabled: false, step: 0.5, mode: "zoomIn" }}
                              onTransformed={(refState) => {
                                const { scale, positionX, positionY } = refState.state;
                                setTransformState({ scale, positionX, positionY });
                                setZoomMode("custom");
                                setZoom(scale);
                              }}
                              onPanningStart={() => setIsPanning(true)}
                              onPanningStop={() => setIsPanning(false)}
                            >
                              <TransformComponent
                                wrapperClass="w-full h-[78vh]"
                                contentClass="flex items-start justify-center py-2"
                              >
                                <img
                                  src={displaySrc}
                                  alt={pages[index]?.alt}
                                  loading="eager"
                                  decoding="async"
                                  draggable={false}
                                  onLoadStart={() => setImageLoading(true)}
                                  onLoad={(e) => {
                                    setImageLoading(false);
                                    const imgEl = e.currentTarget;
                                    setNaturalSize({ width: imgEl.naturalWidth, height: imgEl.naturalHeight });
                                    if (containerRef.current) {
                                      setContainerDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
                                    }
                                  }}
                                  onError={onImgError}
                                  className="select-none max-w-full max-h-full object-contain will-change-transform"
                                  itemProp="image"
                                  aria-describedby={`page-${index}-description`}
                                />
                              </TransformComponent>
                            </TransformWrapper>

                            {imageLoading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                                <LoadingProgress type="image" progress={getPreloadStatus(pages[index]?.src) === "loaded" ? 100 : 50} rtl={rtl} />
                              </div>
                            )}

                            <div id={`page-${index}-description`} className="sr-only">
                              {rtl ? `صفحة ${index + 1} من ${total}` : `Page ${index + 1} of ${total}`}
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full overflow-hidden border rounded-lg mb-4" style={{ maxHeight: '70vh' }}>
                            <ContinuousReader
                              ref={continuousRef}
                              pages={pages}
                              index={index}
                              onIndexChange={setIndex}
                              zoom={zoom}
                              rtl={rtl}
                              onScrollerReady={(el) => {
                                containerRef.current = el as HTMLDivElement;
                                setContainerDimensions({ width: el.clientWidth, height: el.clientHeight });
                              }}
                            />
                          </div>
                        )}
                      </TouchGestureHandler>
                      <div className={cn("mt-4 flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
                        <Button onClick={goPrev} variant="secondary" disabled={index === 0} aria-label={L.previous} className={cn(isMobile && "min-h-[48px] min-w-[48px]")}>{rtl ? `${L.previous} →` : "← " + L.previous}</Button>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="tabular-nums">{index + 1}</span>
                            <Separator orientation="vertical" className="h-5" />
                            <span className="tabular-nums">{total}</span>
                          </div>
                          <form className={cn("flex items-center gap-2", rtl && "flex-row-reverse")} onSubmit={(e) => { e.preventDefault(); const n = parseInt(gotoInput, 10); if (!Number.isNaN(n)) jumpToPage(n); }} aria-label={rtl ? "اذهب إلى صفحة معينة" : "Jump to page"}>
                            <Input type="number" inputMode="numeric" min={1} max={total} placeholder={rtl ? "اذهب إلى صفحة" : "Go to page"} value={gotoInput} onChange={(e) => setGotoInput(e.target.value)} className="w-24" aria-label={rtl ? "أدخل رقم الصفحة" : "Enter page number"} />
                            <Button type="submit" variant="outline" size="sm">{rtl ? "اذهب" : "Go"}</Button>
                          </form>
                        </div>
                        <Button onClick={goNext} variant="default" disabled={index === total - 1} aria-label={L.next} className={cn(isMobile && "min-h-[48px] min-w-[48px]")}>{rtl ? `← ${L.next}` : L.next + " →"}</Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Mini-map overlay */}
                  {readerMode === 'page' && showMiniMap && zoom > 1 && containerRef.current && (
                    <MiniMap
                      imageSrc={pages[index]?.src}
                      imageAlt={pages[index]?.alt}
                      containerWidth={containerDimensions.width}
                      containerHeight={containerDimensions.height}
                      imageWidth={800}
                      imageHeight={1100}
                      scrollLeft={containerRef.current.scrollLeft}
                      scrollTop={containerRef.current.scrollTop}
                      zoom={zoom}
                      onNavigate={(x, y) => { if (containerRef.current) { containerRef.current.scrollLeft = x; containerRef.current.scrollTop = y; } }}
                      rtl={rtl}
                    />
                  )}
                </FullscreenMode>

                {/* Error Handler */}
                {lastError && (
                  <ImprovedErrorHandler error={lastError} onRetry={extractTextFromPage} isRetrying={ocrLoading || summLoading} retryCount={retryCount} context={ocrLoading ? (rtl ? "استخراج النص" : "OCR") : (rtl ? "التلخيص" : "Summarization")} rtl={rtl} />
                )}

                {/* OCR (Extracted Text) */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{rtl ? "النص المستخرج (OCR)" : "OCR Text"}</CardTitle>
                      <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}> 
                        <Button variant="outline" size="sm" onClick={extractTextFromPage} disabled={ocrLoading || batchRunning}>
                          {ocrLoading ? (rtl ? "جارٍ..." : "Working...") : (rtl ? "تشغيل OCR" : "Run OCR")}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={!extractedText || batchRunning} onClick={async () => { try { await navigator.clipboard.writeText(extractedText); toast.success(rtl ? "تم نسخ النص" : "Copied"); } catch { toast.error(rtl ? "فشل النسخ" : "Copy failed"); } }}>
                          {rtl ? "نسخ" : "Copy"}
                        </Button>
                        <Input type="number" inputMode="numeric" min={1} max={total} value={rangeStart} onChange={(e) => setRangeStart(Math.max(1, Math.min(total, parseInt(e.target.value || '1', 10))))} className="w-20" placeholder={rtl ? "من" : "From"} aria-label={rtl ? "من الصفحة" : "From page"} disabled={batchRunning} />
                        <span className="text-muted-foreground">-</span>
                        <Input type="number" inputMode="numeric" min={1} max={total} value={rangeEnd} onChange={(e) => setRangeEnd(Math.max(1, Math.min(total, parseInt(e.target.value || String(total), 10))))} className="w-20" placeholder={rtl ? "إلى" : "To"} aria-label={rtl ? "إلى الصفحة" : "To page"} disabled={batchRunning} />
                        <Button variant="default" size="sm" onClick={processFirstTenPages} disabled={batchRunning}>
                          {batchRunning ? (rtl ? `جارٍ المعالجة ${batchProgress.current}/${batchProgress.total}` : `Processing ${batchProgress.current}/${batchProgress.total}`) : (rtl ? `معالجة من ${rangeStart} إلى ${rangeEnd}` : `Process ${rangeStart}-${rangeEnd}`)}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea readOnly dir={rtl ? "rtl" : "ltr"} value={extractedText} placeholder={rtl ? "لا يوجد نص مستخرج بعد. اضغط تشغيل OCR." : "No extracted text yet. Click Run OCR."} className="min-h-40" />
                  </CardContent>
                </Card>

                {/* Insight Panel under reader (desktop) */}
                <div ref={insightsRef}>
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        <span className="inline-flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          <span>{rtl ? "مساعد القراءة الذكي" : "AI Reading Assistant"}</span>
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      <Tabs value={insightTab} onValueChange={(v) => setInsightTab(v as any)} className="w-full">
                        <TabsList className="grid grid-cols-2 w-full">
                          <TabsTrigger value="summary">{rtl ? "ملخص الصفحة" : "Page Summary"}</TabsTrigger>
                           <TabsTrigger value="qa">
                             {rtl ? (
                               <span className="inline-flex items-center gap-2">
                                 <Sparkles className="h-4 w-4" />
                                 <span>المدرس الإفتراضي</span>
                               </span>
                             ) : (
                               "Ask the doc"
                             )}
                           </TabsTrigger>
                        </TabsList>

                        <TabsContent value="summary" className="mt-4 m-0">
                          <Button className="w-full" variant="default" onClick={handleSmartSummarizeClick} disabled={ocrLoading || summLoading}>
                            <>
                              {(ocrLoading || summLoading) ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>{rtl ? "جارٍ التلخيص..." : "Summarizing..."}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className={cn("h-4 w-4", rtl ? "ml-2" : "mr-2")} />
                                  <span>قم بتلخيص هذه الصفحة</span>
                                </>
                              )}
                            </>
                          </Button>
                          {!summary && (
                            <div className="mt-3 text-sm text-muted-foreground border rounded-md p-3">
                              {rtl ? "لا يوجد ملخص بعد. اضغط \"لخص هذه الصفحة\" لإنشائه." : "No summary yet. Click Summarize this page to generate one."}
                            </div>
                          )}
                          {lastError && (
                            <div className="mt-3">
                              <ImprovedErrorHandler error={lastError} onRetry={extractTextFromPage} isRetrying={ocrLoading || summLoading} retryCount={retryCount} context={ocrLoading ? (rtl ? "استخراج النص" : "OCR") : (rtl ? "التلخيص" : "Summarization")} rtl={rtl} />
                            </div>
                          )}
                          {summary && (
                            <div className="mt-3">
                              <EnhancedSummary summary={summary} onSummaryChange={(newSummary) => { setSummary(newSummary); try { localStorage.setItem(sumKey, newSummary); } catch {} }} onRegenerate={() => { if (extractedText) { summarizeExtractedText(extractedText); } else { toast.error(rtl ? "يجب استخراج النص أولاً" : "Extract text first"); } }} isRegenerating={summLoading} confidence={summaryConfidence} pageNumber={index + 1} rtl={rtl} title={title} />
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="qa" className="mt-4 m-0">
                          <QAChat summary={summary || extractedText} rtl={rtl} title={title} page={index + 1} />
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </ResizablePanel>

        </ResizablePanelGroup>
      )}
    </section>
  );
};

export default BookViewer;
