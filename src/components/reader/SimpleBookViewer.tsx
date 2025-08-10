import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, ChevronDown, Menu, ZoomIn, ZoomOut } from "lucide-react";
import { FreeformImageViewer } from "@/components/reader/FreeformImageViewer";
import { useImagePreloader } from "@/hooks/useImagePreloader";
import { ZoomMode } from "@/components/ZoomControls";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

export type BookPage = {
  src: string;
  alt: string;
};

type Labels = {
  previous?: string;
  next?: string;
  progress?: (current: number, total: number, pct: number) => string;
};

interface SimpleBookViewerProps {
  pages: BookPage[];
  title?: string;
  rtl?: boolean;
  labels?: Labels;
  bookId?: string;
}

export const SimpleBookViewer: React.FC<SimpleBookViewerProps> = ({
  pages,
  title = "Book",
  rtl = false,
  labels = {},
  bookId
}) => {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const Z = {
    min: 0.25,
    max: 4,
    step: 0.1
  } as const;
  
  const total = pages.length;
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastWheelNavRef = useRef<number>(0);
  const isMobile = useIsMobile();
  
  const [zoomMode, setZoomMode] = useState<ZoomMode>("custom");
  const [imageLoading, setImageLoading] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);

  const L = {
    previous: labels.previous ?? "Previous",
    next: labels.next ?? "Next",
    progress: labels.progress ?? ((c: number, t: number, p: number) => `Page ${c} of ${t} • ${p}%`)
  } as const;

  // Caching for last page
  const cacheId = useMemo(() => bookId || title, [bookId, title]);

  // Image preloading
  const { getPreloadStatus } = useImagePreloader(pages, index);

  const goPrev = () => {
    setIndex(i => Math.max(0, i - 1));
  };
  
  const goNext = () => {
    setIndex(i => Math.min(total - 1, i + 1));
  };
  
  const jumpToPage = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), total);
    const target = clamped - 1;
    setIndex(target);
  }, [total]);

  // Enhanced keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
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

  // Restore last page when switching books
  useEffect(() => {
    let startIndex = 0;
    try {
      const key = `book:lastPage:${cacheId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) {
          const clamped = Math.min(Math.max(1, n), total);
          startIndex = clamped - 1;
        }
      }
    } catch {}
    setIndex(startIndex);
  }, [cacheId, pages, total]);

  // Persist last page on change
  useEffect(() => {
    try {
      const key = `book:lastPage:${cacheId}`;
      localStorage.setItem(key, String(index + 1));
    } catch {}
  }, [index, cacheId]);

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(Z.max, zoom + Z.step);
    setZoom(newZoom);
    setZoomMode('custom');
  }, [zoom]);
  
  const zoomOut = useCallback(() => {
    const newZoom = Math.max(Z.min, zoom - Z.step);
    setZoom(newZoom);
    setZoomMode('custom');
  }, [zoom]);

  const fitToWidth = useCallback(() => {
    const el = containerRef.current;
    const newZoom = el ? Math.min(Z.max, (el.clientWidth - 32) / 800) : 1;
    setZoom(newZoom);
    setZoomMode('fit-width');
  }, []);
  
  const fitToHeight = useCallback(() => {
    const el = containerRef.current;
    const newZoom = el ? Math.min(Z.max, (el.clientHeight - 32) / 1100) : 1;
    setZoom(newZoom);
    setZoomMode('fit-height');
  }, []);
  
  const actualSize = useCallback(() => {
    setZoom(1);
    setZoomMode('actual-size');
  }, []);

  // Handle wheel navigation (without conflicting with zoom)
  const handleWheelNav = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return; // let ctrl/cmd+wheel zoom
    
    const now = globalThis.performance?.now?.() ?? Date.now();
    const timeSince = now - lastWheelNavRef.current;
    if (timeSince < 100) return; // throttle
    
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const delta = isHorizontal ? e.deltaX : e.deltaY;
    
    if (Math.abs(delta) > 10) {
      if (delta > 0) {
        rtl ? goPrev() : goNext();
      } else {
        rtl ? goNext() : goPrev();  
      }
      lastWheelNavRef.current = now;
    }
  }, [rtl, goPrev, goNext]);

  const progressPct = total > 1 ? Math.round((index + 1) / total * 100) : 100;
  const panningEnabled = zoom > 1.1;

  return (
    <section aria-label={`${title} viewer`} dir={rtl ? "rtl" : "ltr"} className="w-full">
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="flex-none">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate('/library')} aria-label="Back to library">
                <Menu className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                {L.progress(index + 1, total, progressPct)}
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setControlsOpen(!controlsOpen)}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", controlsOpen && "rotate-180")} />
              </Button>
            </div>
          </div>

          {/* Controls Panel */}
          <Collapsible open={controlsOpen} onOpenChange={setControlsOpen}>
            <CollapsibleContent>
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  {/* Navigation */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goPrev}
                      disabled={index === 0}
                      aria-label={L.previous}
                    >
                      {L.previous}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goNext}
                      disabled={index === total - 1}
                      aria-label={L.next}
                    >
                      {L.next}
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <span className="text-sm">Page {index + 1} of {total}</span>
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={zoomOut} disabled={zoom <= Z.min}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-sm min-w-[4rem] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button variant="outline" size="sm" onClick={zoomIn} disabled={zoom >= Z.max}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <Button variant="outline" size="sm" onClick={fitToWidth}>
                      Fit Width
                    </Button>
                    <Button variant="outline" size="sm" onClick={fitToHeight}>
                      Fit Height
                    </Button>
                    <Button variant="outline" size="sm" onClick={actualSize}>
                      100%
                    </Button>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <div 
            ref={containerRef} 
            className="w-full h-full border-t"
            onWheel={handleWheelNav}
            role="img" 
            aria-label={`${pages[index]?.alt} - Page ${index + 1} of ${total}`} 
            tabIndex={0}
          >
            <FreeformImageViewer
              src={pages[index]?.src}
              alt={pages[index]?.alt}
              zoom={zoom}
              onZoomChange={setZoom}
              onLoadStart={() => setImageLoading(true)}
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
              className="w-full h-full"
              minZoom={Z.min}
              maxZoom={Z.max}
              disabled={!panningEnabled}
            />
            
            {/* Loading overlay */}
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="text-sm text-muted-foreground">Loading...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SimpleBookViewer;