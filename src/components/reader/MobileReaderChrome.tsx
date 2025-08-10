import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Grid3X3, Sparkles, ZoomIn, ZoomOut } from "lucide-react";

interface MobileReaderChromeProps {
  title: string;
  progressText: string;
  rtl?: boolean;
  onToggleThumbnails: () => void;
  onOpenInsights: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  fullscreenButton?: React.ReactNode;
}

export function MobileReaderChrome({
  title,
  progressText,
  rtl = false,
  onToggleThumbnails,
  onOpenInsights,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onZoomIn,
  onZoomOut,
  fullscreenButton,
}: MobileReaderChromeProps) {
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  return (
    <>
      {/* Top app bar */}
      <div className="fixed top-0 inset-x-0 z-30 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70 border-b">
        <div className="mx-auto max-w-screen-md px-3 py-2">
          <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}> 
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onToggleThumbnails} aria-label={rtl ? "المصغرات" : "Thumbnails"}>
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 text-center truncate">
              <div className="text-base font-medium truncate" itemProp="name">{title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 select-none">{progressText}</div>
            </div>
            <div className="flex items-center gap-2">
              {fullscreenButton}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-screen-md px-3 py-2">
          <div className={cn("grid grid-cols-5 items-center gap-2", rtl && "direction-rtl")}> 
            <Button variant="secondary" className="h-12" onClick={onPrev} disabled={!canPrev} aria-label={rtl ? "السابق" : "Previous"}>
              <PrevIcon className="h-5 w-5" />
            </Button>
            <Button variant="secondary" className="h-12" onClick={onZoomOut} aria-label={rtl ? "تصغير" : "Zoom out"}>
              <ZoomOut className="h-5 w-5" />
            </Button>

            <Button className="h-12" onClick={onOpenInsights} aria-label={rtl ? "لوحة الرؤى" : "Insights"}>
              <Sparkles className="h-5 w-5 mr-2" />
              <span className="text-sm">{rtl ? "الرؤى" : "Insights"}</span>
            </Button>

            <Button variant="secondary" className="h-12" onClick={onZoomIn} aria-label={rtl ? "تكبير" : "Zoom in"}>
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button variant="secondary" className="h-12" onClick={onNext} disabled={!canNext} aria-label={rtl ? "التالي" : "Next"}>
              <NextIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content underlap */}
      <div className="pt-[56px] pb-[72px]" aria-hidden />
    </>
  );
}
