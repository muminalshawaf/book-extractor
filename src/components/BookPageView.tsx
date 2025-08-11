import React, { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string } }>(
  ({ page }, ref) => {
    const [loaded, setLoaded] = useState(false);

    return (
      <div className="bg-card h-full w-full" ref={ref}>
        <div className="flex items-center justify-center h-full w-full p-3 relative">
          {!loaded && (
            <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
          )}
          <img
            src={page.src}
            alt={page.alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className="max-w-full max-h-full object-contain select-none transition-opacity duration-300"
            style={{ opacity: loaded ? 1 : 0 }}
          />
        </div>
      </div>
    );
  }
);

BookPageView.displayName = "BookPageView";
