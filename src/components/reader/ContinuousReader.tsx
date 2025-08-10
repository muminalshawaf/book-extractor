import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { BookPage } from "@/components/reader/SimpleBookViewer";
import { cn } from "@/lib/utils";

export type ContinuousReaderRef = {
  scrollToIndex: (index: number) => void;
  getScrollerElement: () => HTMLElement | null;
};

interface ContinuousReaderProps {
  pages: BookPage[];
  index: number;
  onIndexChange: (index: number) => void;
  zoom: number;
  rtl?: boolean;
  onScrollerReady?: (el: HTMLElement) => void;
}

export const ContinuousReader = forwardRef<ContinuousReaderRef, ContinuousReaderProps>(
  ({ pages, index, onIndexChange, zoom, rtl = false, onScrollerReady }, ref) => {
    const virtuosoRef = useRef<any>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);

    useImperativeHandle(ref, () => ({
      scrollToIndex: (i: number) => {
        virtuosoRef.current?.scrollToIndex({ index: i, align: "start", behavior: "smooth" });
      },
      getScrollerElement: () => scrollerRef.current,
    }));

    return (
      <div className="w-full h-[70vh] md:h-[78vh] lg:h-[85vh]" role="region" aria-label="Continuous reader" aria-live="polite">
        <Virtuoso
          ref={virtuosoRef}
          totalCount={pages.length}
          initialTopMostItemIndex={index}
          rangeChanged={(range) => {
            const mid = Math.round((range.startIndex + range.endIndex) / 2);
            if (Number.isFinite(mid)) onIndexChange(mid);
          }}
          scrollerRef={(refEl) => {
            if (refEl) {
              scrollerRef.current = refEl as unknown as HTMLElement;
              onScrollerReady?.(refEl as unknown as HTMLElement);
            }
          }}
          itemContent={(i) => {
            const page = pages[i];
            return (
              <div className={cn("flex items-start justify-center py-2 md:py-3 lg:py-4", rtl && "direction-rtl")}
                   aria-label={`${page?.alt} - Page ${i + 1} of ${pages.length}`}>
                <img
                  src={page?.src}
                  alt={page?.alt}
                  loading="lazy"
                  decoding="async"
                  className="select-none max-w-full object-contain"
                  style={{
                    transform: i === index ? `scale(${zoom})` : undefined,
                    transformOrigin: "center top",
                    transition: "transform 0.2s ease-out",
                    maxHeight: "78vh",
                  }}
                />
              </div>
            );
          }}
        />
      </div>
    );
  }
);

ContinuousReader.displayName = "ContinuousReader";

export default ContinuousReader;
