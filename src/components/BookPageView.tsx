import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string }; zoom?: number; fetchPriority?: "high" | "low" }>(
  ({ page, zoom = 1, fetchPriority }, ref) => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      setLoaded(false);
    }, [page.src]);

    return (
      <div className="bg-card h-full w-full" ref={ref} aria-busy={!loaded}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          {!loaded && (
            <>
              <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
              <span className="sr-only">Loading page image...</span>
            </>
          )}
          <img
            src={page.src}
            alt={page.alt}
            loading="lazy"
            decoding="async"
            fetchPriority={fetchPriority}
            onLoad={() => setLoaded(true)}
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
