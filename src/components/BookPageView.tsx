import React, { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string }; zoom?: number; fetchPriority?: "high" | "low" }>(
  ({ page, zoom = 1, fetchPriority }, ref) => {
    const [loaded, setLoaded] = useState(false);
    const [progress, setProgress] = useState(0);

    const [displaySrc, setDisplaySrc] = useState<string | null>(null);

    useEffect(() => {
      let isActive = true;
      let objectUrl: string | null = null;
      setLoaded(false);
      setProgress(0);
      setDisplaySrc(null);

      const controller = new AbortController();

      (async () => {
        try {
          const res = await fetch(page.src, { signal: controller.signal, cache: "force-cache" });
          if (!res.ok) throw new Error(`Failed to load image: ${res.status}`);

          const contentLength = res.headers.get("content-length");
          let total = contentLength ? parseInt(contentLength, 10) : 0;

          if (res.body) {
            const reader = res.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                received += value.length;
                if (isActive) {
                  if (total > 0) {
                    const pct = Math.min(99, Math.round((received / total) * 100));
                    setProgress(pct);
                  } else {
                    setProgress((p) => Math.min(95, p + 2));
                  }
                }
              }
            }

            const blob = new Blob(chunks);
            objectUrl = URL.createObjectURL(blob);
          } else {
            // Fallback if streaming unsupported
            objectUrl = page.src;
          }

          if (!isActive) return;

          const img = new Image();
          img.decoding = "async";
          img.src = objectUrl!;
          try { await img.decode(); } catch { /* noop */ }

          if (!isActive) return;
          setDisplaySrc(objectUrl!);
          setLoaded(true);
          setProgress(100);
        } catch (err) {
          if (!isActive) return;
          setDisplaySrc(null);
        }
      })();

      return () => {
        isActive = false;
        controller.abort();
        if (objectUrl && objectUrl.startsWith("blob:")) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [page.src]);

    const isLoading = !displaySrc || !loaded;

    // Simulated indeterminate-like progress while loading (caps at 90% until image decodes)
    useEffect(() => {
      if (isLoading && progress === 0) {
        const id = window.setInterval(() => {
          setProgress((prev) => {
            const next = prev + (prev < 60 ? 5 : prev < 80 ? 2 : 1);
            return Math.min(next, 90);
          });
        }, 120);
        return () => window.clearInterval(id);
      }
    }, [page.src, isLoading, progress]);

    return (
      <div className="bg-card h-full w-full" ref={ref} aria-busy={isLoading}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          {isLoading && (
            <>
              <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <Loader2 className="h-8 w-8 animate-spin text-foreground" aria-hidden="true" />
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 max-w-md">
                <Progress value={progress} aria-label="Page load progress" />
              </div>
              <span className="sr-only">Loading page image...</span>
            </>
          )}
          {displaySrc && (
            <img
              src={displaySrc}
              alt={page.alt}
              decoding="async"
              fetchPriority={fetchPriority}
              className="max-w-full object-contain select-none"
              style={{
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: "center top",
                maxHeight: "78vh",
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

BookPageView.displayName = "BookPageView";
