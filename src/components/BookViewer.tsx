import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Minus, Plus, Loader2 } from "lucide-react";
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
}

export const BookViewer: React.FC<BookViewerProps> = ({
  pages,
  title = "Book",
  rtl = false,
  labels = {},
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

  // Notes per page (localStorage persistence)
  const storageKey = useMemo(() => `book:notes:${title}:${index}`, [title, index]);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [summLoading, setSummLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // OCR cache key and state
  const ocrKey = useMemo(() => `book:ocr:${title}:${index}`, [title, index]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  useEffect(() => {
    const existing = localStorage.getItem(storageKey) ?? "";
    setNote(existing);
  }, [storageKey]);

  const saveNote = useCallback(
    (value: string) => {
      try {
        localStorage.setItem(storageKey, value);
      } catch (e) {
        // ignore quota errors gracefully
      }
    },
    [storageKey]
  );

  const handleChange = (v: string) => {
    setNote(v);
    // simple debounce to reduce writes
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => saveNote(v), 400);
  };

  const goPrev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  // keyboard navigation (RTL-aware)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rtl) {
        if (e.key === "ArrowLeft") goNext();
        if (e.key === "ArrowRight") goPrev();
      } else {
        if (e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowRight") goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, rtl]);

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(note);
      toast.success(L.toastCopied);
    } catch {
      toast.error(L.toastCopyFailed);
    }
  };

  const clearNote = () => {
    setNote("");
    saveNote("");
    toast(L.toastCleared);
  };

  const summarizeNotes = async () => {
    if (!note.trim()) {
      toast.error(rtl ? "يرجى كتابة ملاحظتك أولاً" : "Please write a note first");
      return;
    }
    setSummLoading(true);
    try {
      const res = await fetch("/functions/v1/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note, lang: rtl ? "ar" : "en", page: index + 1, title }),
      });
      if (!res.ok) throw new Error("summarize-failed");
      const data = await res.json();
      setSummary(data.summary || "");
      toast.success(rtl ? "تم إنشاء الملخص" : "Summary ready");
    } catch (e) {
      toast.error(rtl ? "تعذّر إنشاء الملخص" : "Failed to summarize");
    } finally {
      setSummLoading(false);
    }
  };

  // OCR the current page image and summarize via DeepSeek
  const summarizePage = async () => {
    try {
      setOcrLoading(true);
      setOcrProgress(0);

      let text = localStorage.getItem(ocrKey) ?? "";

      if (!text) {
        const { recognize } = await import("tesseract.js");
        const primaryLang = rtl ? "ara" : "eng";
        
        // Get proxied image URL to avoid CORS issues
        const getProxiedImage = async (imageUrl: string) => {
          try {
            const response = await fetch("/functions/v1/proxy-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: imageUrl }),
            });
            
            if (!response.ok) throw new Error("Proxy failed");
            return response.blob();
          } catch {
            // Fallback to original URL if proxy fails
            return imageUrl;
          }
        };

        const runRecognize = async (lang: string) => {
          const imageSource = await getProxiedImage(pages[index]?.src);
          const result = await recognize(imageSource, lang, {
            logger: (m: any) => {
              if (m.status === "recognizing text" && typeof m.progress === "number") {
                setOcrProgress(Math.round(m.progress * 100));
              }
            },
          });
          return result?.data?.text?.trim() ?? "";
        };

        text = await runRecognize(primaryLang);
        if (!text && primaryLang !== "eng") {
          // fallback to English if Arabic data isn't available
          text = await runRecognize("eng");
        }

        if (text) {
          try { localStorage.setItem(ocrKey, text); } catch {}
        }
      }

      if (!text) {
        toast.error(rtl ? "تعذّر استخراج نص الصفحة" : "Couldn't extract page text");
        return;
      }

      setSummLoading(true);
      const res = await fetch("/functions/v1/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: rtl ? "ar" : "en", page: index + 1, title }),
      });
      if (!res.ok) throw new Error("summarize-failed");
      const data = await res.json();
      setSummary(data.summary || "");
      toast.success(rtl ? "تم تلخيص الصفحة" : "Page summarized");
    } catch (e) {
      toast.error(rtl ? "فشل تلخيص الصفحة" : "Failed to summarize page");
    } finally {
      setSummLoading(false);
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };
  const zoomOut = useCallback(() => setZoom((z) => Math.max(Z.min, +(z - Z.step).toFixed(2))), []);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(Z.max, +(z + Z.step).toFixed(2))), []);
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
    <section aria-label={`${title} viewer`} dir={rtl ? "rtl" : "ltr"} className="w-full">
      <div
        className={cn(
          "grid grid-cols-1 gap-6 items-start",
          rtl
            ? "lg:grid-cols-[minmax(280px,380px)_1fr]"
            : "lg:grid-cols-[1fr_minmax(280px,380px)]"
        )}
      >
        {/* Notes Sidebar (RTL-first) */}
        <aside className="w-full">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">{L.notesTitle(index + 1)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder={rtl ? "اكتب ملاحظاتك هنا…" : "Write your thoughts here…"}
                  aria-label={rtl ? "ملاحظات" : "Notes"}
                  className="min-h-[220px]"
                />
                {summary && (
                  <div className="p-3 rounded-md bg-muted/50 animate-fade-in">
                    <div className="text-xs font-medium mb-1">{rtl ? "ملخص الملاحظات" : "Notes summary"}</div>
                    <div className="text-sm leading-6 whitespace-pre-wrap">{summary}</div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{L.autosaves}</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={clearNote} aria-label={L.clear}>
                      {L.clear}
                    </Button>
                    <Button variant="outline" onClick={copyNote} aria-label={L.copy}>
                      {L.copy}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={summarizePage}
                      disabled={ocrLoading || summLoading}
                      aria-label={rtl ? "تلخيص الصفحة" : "Summarize page"}
                    >
                      {ocrLoading || summLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {rtl ? "جارٍ معالجة الصفحة…" : "Processing page…"}
                          {ocrLoading && ocrProgress ? <span className="tabular-nums"> {ocrProgress}%</span> : null}
                        </div>
                      ) : (
                        rtl ? "تلخيص الصفحة" : "Summarize page"
                      )}
                    </Button>
                    <Button variant="default" onClick={summarizeNotes} disabled={summLoading || !note.trim()} aria-label={rtl ? "تلخيص الملاحظات" : "Summarize notes"}>
                      {summLoading ? (
                        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {rtl ? "جارٍ التلخيص…" : "Summarizing…"}</div>
                      ) : (
                        rtl ? "تلخيص الملاحظات" : "Summarize notes"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Page Area */}
        <Card ref={containerRef} className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{title}</CardTitle>
              <div className="text-sm text-muted-foreground select-none">
                {L.progress(index + 1, total, progressPct)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              ref={containerRef}
              className={cn("relative w-full overflow-auto border rounded-lg mb-4", zoom > 1 && "cursor-grab")}
              style={{ 
                maxHeight: '70vh'
              }}
              onMouseDown={onPanStart}
              onMouseMove={onPanMove}
              onMouseUp={onPanEnd}
              onMouseLeave={onPanEnd}
            >
              <div className="flex items-start justify-center min-w-[820px] min-h-[1120px] py-2">
                <img
                  src={pages[index]?.src}
                  alt={pages[index]?.alt}
                  loading="eager"
                  decoding="async"
                  style={{ 
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center top',
                    transition: 'transform 0.2s ease-out'
                  }}
                  className="select-none max-w-full max-h-full object-contain"
                />
              </div>
            </div>
            <div className={cn("mt-4 flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
              <Button
                onClick={goPrev}
                variant="secondary"
                disabled={index === 0}
                aria-label={L.previous}
              >
                {rtl ? `${L.previous} →` : "← " + L.previous}
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="tabular-nums">{index + 1}</span>
                <Separator orientation="vertical" className="h-5" />
                <span className="tabular-nums">{total}</span>
                <Separator orientation="vertical" className="h-5" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={zoomOut}
                  disabled={zoom <= Z.min}
                  aria-label={rtl ? "تصغير" : "Zoom out"}
                  className="hover-scale"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={zoomIn}
                  disabled={zoom >= Z.max}
                  aria-label={rtl ? "تكبير" : "Zoom in"}
                  className="hover-scale"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button
                onClick={goNext}
                variant="default"
                disabled={index === total - 1}
                aria-label={L.next}
              >
                {rtl ? `← ${L.next}` : L.next + " →"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default BookViewer;
