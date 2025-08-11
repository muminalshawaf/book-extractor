import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string }; zoom?: number; fetchPriority?: "high" | "low" }>(
  ({ page, zoom = 1, fetchPriority }, ref) => {
    const [loaded, setLoaded] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      setLoaded(false);
    }, [page.src]);

    // Simulated indeterminate-like progress while loading (caps at 90% until image decodes)
    useEffect(() => {
      setProgress(0);
      if (!loaded) {
        const id = window.setInterval(() => {
          setProgress((prev) => {
            const next = prev + (prev < 60 ? 5 : prev < 80 ? 2 : 1);
            return Math.min(next, 90);
          });
        }, 120);
        return () => window.clearInterval(id);
      }
    }, [page.src, loaded]);

    return (
      <div className="bg-card h-full w-full" ref={ref} aria-busy={!loaded}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          {!loaded && (
            <>
              <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 max-w-md">
                <Progress value={progress} aria-label="Page load progress" />
              </div>
              <span className="sr-only">Loading page image...</span>
            </>
          )}
          <img
            src={page.src}
            alt={page.alt}
            loading="lazy"
            decoding="async"
            fetchPriority={fetchPriority}
            onLoad={() => { setLoaded(true); setProgress(100); }}
            className="max-w-full object-contain select-none transition-opacity duration-300"
            style={{
              opacity: loaded ? 1 : 0,
              transform: zoom !== 1 ? `scale(${zoom})` : undefined,
              transformOrigin: "center top",
              transition: "opacity 0.3s ease, transform 0.2s ease-out",
              maxHeight: "78vh",
            }}
          />
        </div>
      </div>
    );
  }
);

BookPageView.displayName = "BookPageView";
