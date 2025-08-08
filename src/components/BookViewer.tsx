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

interface BookViewerProps {
  pages: BookPage[];
  title?: string;
}

export const BookViewer: React.FC<BookViewerProps> = ({ pages, title = "Book" }) => {
  const [index, setIndex] = useState(0);
  const total = pages.length;
  const imgKey = `${index}`; // used to retrigger animation on page change
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(note);
      toast.success("Note copied to clipboard");
    } catch {
      toast.error("Unable to copy note");
    }
  };

  const clearNote = () => {
    setNote("");
    saveNote("");
    toast("Notes cleared for this page");
  };

  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100;

  return (
    <section aria-label={`${title} viewer`} className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,380px)] gap-6 items-start">
        {/* Page Area */}
        <Card ref={containerRef} className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{title}</CardTitle>
              <div className="text-sm text-muted-foreground select-none">
                Page {index + 1} of {total} • {progressPct}%
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div key={imgKey} className={cn("relative w-full max-w-[900px] overflow-hidden rounded-lg border", "animate-fade-in")}> 
                <img
                  src={pages[index]?.src}
                  alt={pages[index]?.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block select-none"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button onClick={goPrev} variant="secondary" disabled={index === 0} aria-label="Previous page">
                ← Previous
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="tabular-nums">{index + 1}</span>
                <Separator orientation="vertical" className="h-5" />
                <span className="tabular-nums">{total}</span>
              </div>
              <Button onClick={goNext} variant="default" disabled={index === total - 1} aria-label="Next page">
                Next →
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notes Sidebar */}
        <aside className="w-full">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">Notes for page {index + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => handleChange(e.target.value)}
                  placeholder="Write your thoughts here…"
                  aria-label="Notes"
                  className="min-h-[220px]"
                />
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Autosaves locally</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={clearNote} aria-label="Clear notes">
                      Clear
                    </Button>
                    <Button variant="outline" onClick={copyNote} aria-label="Copy notes">
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
};

export default BookViewer;
