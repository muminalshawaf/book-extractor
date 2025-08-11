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
      setLoaded(false);
      setProgress(0);
      setDisplaySrc(null);

      const img = new Image();
      img.decoding = "async";
      img.src = page.src;
      img.onload = () => {
        if (!isActive) return;
        setDisplaySrc(page.src);
        setLoaded(true);
        setProgress(100);
      };
      img.onerror = () => {
        if (!isActive) return;
        setDisplaySrc(null);
      };

      return () => { isActive = false; };
    }, [page.src]);

    const isLoading = !displaySrc || !loaded;

    // Simulated indeterminate-like progress while loading (caps at 90% until image decodes)
    useEffect(() => {
      setProgress(0);
      if (isLoading) {
        const id = window.setInterval(() => {
          setProgress((prev) => {
            const next = prev + (prev < 60 ? 5 : prev < 80 ? 2 : 1);
            return Math.min(next, 90);
          });
        }, 120);
        return () => window.clearInterval(id);
      }
    }, [page.src, isLoading]);

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
