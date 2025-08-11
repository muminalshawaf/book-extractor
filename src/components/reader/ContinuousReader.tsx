import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { BookPage } from "@/components/BookViewer";
import { BookPageView } from "@/components/BookPageView";
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
                <BookPageView
                  key={page?.src || `page-${i}`}
                  page={{ src: page?.src, alt: page?.alt }}
                  zoom={i === index ? zoom : 1}
                  fetchPriority={i === index ? "high" : "low"}
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
