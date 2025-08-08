import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const total = pages.length;
  const imgKey = `${index}`; // used to retrigger animation on page change
  const containerRef = useRef<HTMLDivElement | null>(null);

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
  const debounceRef = useRef<number | null>(null);

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

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));

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

  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100;

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
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{L.autosaves}</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={clearNote} aria-label={L.clear}>
                      {L.clear}
                    </Button>
                    <Button variant="outline" onClick={copyNote} aria-label={L.copy}>
                      {L.copy}
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
            <div className="flex items-center justify-center">
              <div
                key={imgKey}
                className={cn(
                  "relative w-full max-w-[900px] overflow-hidden rounded-lg border",
                  "animate-fade-in"
                )}
              >
                <img
                  src={pages[index]?.src}
                  alt={pages[index]?.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block select-none"
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
