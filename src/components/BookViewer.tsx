import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, Loader2 } from "lucide-react";
import { runLocalOcr } from '@/lib/ocr/localOcr';
import QAChat from "@/components/QAChat";
import MathRenderer from "@/components/MathRenderer";
import { callFunction } from "@/lib/functionsClient";
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
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
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
  const Z = { min: 0.75, max: 2, step: 0.25 } as const;
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
const [summary, setSummary] = useState("");
  const [summLoading, setSummLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  
  // New state for enhanced features
  const [ocrProgress, setOcrProgress] = useState(0);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  
  // Phase 2 enhancements
  const [zoomMode, setZoomMode] = useState<ZoomMode>("custom");
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
  
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
  const [isMobile, setIsMobile] = useState(false);
  const [gotoInput, setGotoInput] = useState<string>("");

  // Batch processing state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const goPrev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  const jumpToPage = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), total);
    setIndex(clamped - 1);
  }, [total]);

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

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

      setSummaryProgress(100);
      try { localStorage.setItem(sumKey, accumulated); } catch {}
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

  // Enhanced zoom functions
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(Z.min, +(z - Z.step).toFixed(2)));
    setZoomMode("custom");
  }, []);
  
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(Z.max, +(z + Z.step).toFixed(2)));
    setZoomMode("custom");
  }, []);
  
  const fitToWidth = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 32; // padding
      const newZoom = Math.min(Z.max, containerWidth / 800);
      setZoom(newZoom);
      setZoomMode("fit-width");
    }
  }, []);
  
  const fitToHeight = useCallback(() => {
    if (containerRef.current) {
      const containerHeight = containerRef.current.clientHeight - 32; // padding
      const newZoom = Math.min(Z.max, containerHeight / 1100);
      setZoom(newZoom);
      setZoomMode("fit-height");
    }
  }, []);
  
  const actualSize = useCallback(() => {
    setZoom(1);
    setZoomMode("actual-size");
  }, []);

  // Process first 10 pages: OCR -> summarize -> save
  const processFirstTenPages = async () => {
    if (batchRunning) return;
    const bookIdentifier = (bookId || title || 'book');
    const limit = Math.min(10, total);
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: limit });

    toast.message(rtl ? 'بدء معالجة أول 10 صفحات' : 'Starting first 10 pages');

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

    try {
      for (let i = 0; i < limit; i++) {
        setBatchProgress({ current: i + 1, total: limit });
        const page = pages[i];
        if (!page) continue;

        // OCR
        const blob = await getImageBlob(page.src);
        const ocrRes = await runLocalOcr(blob, {
          lang: rtl ? 'ara+eng' : 'eng',
          psm: 6,
          preprocess: {
            upsample: true,
            targetMinWidth: 1400,
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
      }

      toast.success(rtl ? 'اكتملت معالجة 10 صفحات' : 'Processed 10 pages successfully');
    } catch (e: any) {
      console.error('Batch processing failed:', e);
      toast.error((rtl ? 'فشل المعالجة: ' : 'Processing failed: ') + (e?.message || e));
    } finally {
      setBatchRunning(false);
    }
  };

  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100;

  // Drag-to-pan when zoomed in
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const onPanStart = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    const el = containerRef.current;
    if (!el) return;
    setIsPanning(true);
    panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
  }, [zoom]);

  const onPanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || zoom <= 1) return;
    const el = containerRef.current;
    if (!el || !panRef.current) return;
    const dx = e.clientX - panRef.current.x;
    const dy = e.clientY - panRef.current.y;
    el.scrollLeft = panRef.current.left - dx;
    el.scrollTop = panRef.current.top - dy;
  }, [isPanning, zoom]);

  const onPanEnd = useCallback(() => {
    if (!isPanning) return;
    setIsPanning(false);
    const el = containerRef.current;
    if (el) el.style.cursor = zoom > 1 ? 'grab' : '';
    panRef.current = null;
  }, [isPanning, zoom]);

  return (
    <section aria-label={`${title} viewer`} dir={rtl ? "rtl" : "ltr"} className="w-full" itemScope itemType="https://schema.org/CreativeWork">
      <div className="flex gap-4">
        {/* Thumbnail Sidebar */}
        <div className={cn("flex-shrink-0", !thumbnailsOpen && "w-0 overflow-hidden")}>
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
        <div className="flex-1 flex flex-col gap-6">

        {/* Top Bar */}
        <div className="flex items-center justify-between bg-card rounded-lg p-4 shadow-sm">
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
            showMiniMap={showMiniMap}
            onToggleMiniMap={() => setShowMiniMap(!showMiniMap)}
            rtl={rtl}
          />
          <FullscreenButton rtl={rtl} />
        </div>

        {/* Page Area with Fullscreen */}
        <FullscreenMode rtl={rtl}>
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" itemProp="name">{title}</CardTitle>
              <div className="flex items-center gap-2">
                <AccessibilityPanel 
                  isOpen={accessibilityPanelOpen}
                  onToggle={() => setAccessibilityPanelOpen(!accessibilityPanelOpen)}
                  rtl={rtl}
                />
                <PerformanceMonitor 
                  isOpen={performanceMonitorOpen}
                  onToggle={() => setPerformanceMonitorOpen(!performanceMonitorOpen)}
                  rtl={rtl}
                />
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
                disabled={!isMobile}
                className="relative"
              >
                <div 
                  ref={containerRef}
                  className={cn(
                    "relative w-full overflow-auto border rounded-lg mb-4", 
                    zoom > 1 && "cursor-grab",
                    isMobile && "book-viewer-mobile"
                  )}
                  style={{ 
                    maxHeight: '70vh'
                  }}
                  onMouseDown={onPanStart}
                  onMouseMove={onPanMove}
                  onMouseUp={onPanEnd}
                  onMouseLeave={onPanEnd}
                  role="img"
                  aria-label={`${pages[index]?.alt} - Page ${index + 1} of ${total}`}
                  tabIndex={0}
                >
                  <div className="flex items-start justify-center min-w-[820px] min-h-[1120px] py-2">
                    <img
                      src={pages[index]?.src}
                      alt={pages[index]?.alt}
                      loading="eager"
                      decoding="async"
                      onLoadStart={() => setImageLoading(true)}
                      onLoad={() => {
                        setImageLoading(false);
                        // Update container dimensions for mini-map
                        if (containerRef.current) {
                          setContainerDimensions({
                            width: containerRef.current.clientWidth,
                            height: containerRef.current.clientHeight
                          });
                        }
                      }}
                      onError={() => setImageLoading(false)}
                      style={{ 
                        transform: `scale(${zoom})`,
                        transformOrigin: 'center top',
                        transition: 'transform 0.2s ease-out'
                      }}
                      className="select-none max-w-full max-h-full object-contain will-change-transform"
                      itemProp="image"
                      aria-describedby={`page-${index}-description`}
                    />
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <LoadingProgress 
                          type="image" 
                          progress={getPreloadStatus(pages[index]?.src) === "loaded" ? 100 : 50} 
                          rtl={rtl} 
                        />
                      </div>
                    )}
                  </div>
                  <div id={`page-${index}-description`} className="sr-only">
                    {rtl ? `صفحة ${index + 1} من ${total}` : `Page ${index + 1} of ${total}`}
                  </div>
                </div>
              </TouchGestureHandler>
              <div className={cn("mt-4 flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
                <Button
                  onClick={goPrev}
                  variant="secondary"
                  disabled={index === 0}
                  aria-label={L.previous}
                  className={cn(isMobile && "min-h-[48px] min-w-[48px]")}
                >
                  {rtl ? `${L.previous} →` : "← " + L.previous}
                </Button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="tabular-nums">{index + 1}</span>
                    <Separator orientation="vertical" className="h-5" />
                    <span className="tabular-nums">{total}</span>
                  </div>
                  <form
                    className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = parseInt(gotoInput, 10);
                      if (!Number.isNaN(n)) {
                        jumpToPage(n);
                      }
                    }}
                    aria-label={rtl ? "اذهب إلى صفحة معينة" : "Jump to page"}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={total}
                      placeholder={rtl ? "اذهب إلى صفحة" : "Go to page"}
                      value={gotoInput}
                      onChange={(e) => setGotoInput(e.target.value)}
                      className="w-24"
                      aria-label={rtl ? "أدخل رقم الصفحة" : "Enter page number"}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      {rtl ? "اذهب" : "Go"}
                    </Button>
                  </form>
                </div>
                <Button
                  onClick={goNext}
                  variant="default"
                  disabled={index === total - 1}
                  aria-label={L.next}
                  className={cn(isMobile && "min-h-[48px] min-w-[48px]")}
                >
                  {rtl ? `← ${L.next}` : L.next + " →"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mini-map overlay */}
          {showMiniMap && zoom > 1 && containerRef.current && (
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
              onNavigate={(x, y) => {
                if (containerRef.current) {
                  containerRef.current.scrollLeft = x;
                  containerRef.current.scrollTop = y;
                }
              }}
              rtl={rtl}
            />
          )}
        </FullscreenMode>

        {/* Content Search */}
        <ContentSearch
          pages={allExtractedTexts}
          currentPageIndex={index}
          onPageChange={setIndex}
          onHighlight={setSearchHighlight}
          rtl={rtl}
        />
        
        {/* Debug info */}
        <div className="p-2 bg-muted rounded text-xs">
          <p>Debug: Available pages with text: {Object.keys(allExtractedTexts).join(', ') || 'None'}</p>
          <p>Debug: Current page has text: {allExtractedTexts[index] ? 'Yes' : 'No'}</p>
          <p>Debug: Total pages with extracted text: {Object.keys(allExtractedTexts).length}</p>
        </div>

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

        {/* OCR (Extracted Text) */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{rtl ? "النص المستخرج (OCR)" : "OCR Text"}</CardTitle>
              <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={extractTextFromPage}
                  disabled={ocrLoading || batchRunning}
                >
                  {ocrLoading ? (rtl ? "جارٍ..." : "Working...") : (rtl ? "تشغيل OCR" : "Run OCR")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!extractedText || batchRunning}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(extractedText);
                      toast.success(rtl ? "تم نسخ النص" : "Copied");
                    } catch {
                      toast.error(rtl ? "فشل النسخ" : "Copy failed");
                    }
                  }}
                >
                  {rtl ? "نسخ" : "Copy"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={processFirstTenPages}
                  disabled={batchRunning}
                >
                  {batchRunning
                    ? (rtl ? `جارٍ المعالجة ${batchProgress.current}/${batchProgress.total}` : `Processing ${batchProgress.current}/${batchProgress.total}`)
                    : (rtl ? "معالجة أول 10 صفحات" : "Process first 10 pages")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              dir={rtl ? "rtl" : "ltr"}
              value={extractedText}
              placeholder={rtl ? "لا يوجد نص مستخرج بعد. اضغط تشغيل OCR." : "No extracted text yet. Click Run OCR."}
              className="min-h-40"
            />
          </CardContent>
        </Card>

        {/* Enhanced Summary */}
        <EnhancedSummary
          summary={summary}
          onSummaryChange={(newSummary) => {
            setSummary(newSummary);
            try { localStorage.setItem(sumKey, newSummary); } catch {}
          }}
          onRegenerate={() => {
            if (extractedText) {
              summarizeExtractedText(extractedText);
            } else {
              toast.error(rtl ? "يجب استخراج النص أولاً" : "Extract text first");
            }
          }}
          isRegenerating={summLoading}
          confidence={summaryConfidence}
          pageNumber={index + 1}
          rtl={rtl}
          title={title}
        />

        {/* AI Q&A at the bottom */}
        <QAChat summary={summary || extractedText} rtl={rtl} title={title} page={index + 1} />
        </div>
      </div>
    </section>
  );
};

export default BookViewer;
