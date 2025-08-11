import React, { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string }; zoom?: number; fetchPriority?: "high" | "low"; pageNumber?: number }>(
  ({ page, zoom = 1, fetchPriority, pageNumber }, ref) => {
    const [loaded, setLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Reset loading state when page changes
    useEffect(() => {
      setLoaded(false);
      setImageError(false);
    }, [page.src]);

    return (
      <div className="bg-card h-full w-full" ref={ref} aria-busy={!loaded}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          {!loaded && !imageError && (
            <div className="absolute inset-3 md:inset-4 flex flex-col items-center justify-center">
              <Skeleton className="w-full h-full rounded-md bg-muted/60 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-background/80 rounded-lg px-3 py-2 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {pageNumber ? `Loading page ${pageNumber}...` : "Loading page..."}
                  </span>
                </div>
              </div>
            </div>
          )}
          {imageError && (
            <div className="absolute inset-3 md:inset-4 flex items-center justify-center">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-center">
                <span className="text-sm text-destructive">Failed to load page {pageNumber || ""}</span>
              </div>
            </div>
          )}
          <img
            src={page.src}
            alt={page.alt}
            loading="lazy"
            decoding="async"
            {...(fetchPriority && { fetchpriority: fetchPriority })}
            onLoad={() => {
              setLoaded(true);
              setImageError(false);
            }}
            onError={() => {
              setLoaded(true);
              setImageError(true);
            }}
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
