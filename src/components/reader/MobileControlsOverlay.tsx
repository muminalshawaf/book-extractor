import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Grid3X3, Sparkles, ZoomIn, ZoomOut } from "lucide-react";

interface MobileControlsOverlayProps {
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

export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
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
}) => {
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top row */}
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}> 
          <Button size="icon" variant="outline" onClick={onToggleThumbnails} aria-label={rtl ? "المصغرات" : "Thumbnails"} className="pointer-events-auto h-10 w-10">
            <Grid3X3 className="h-5 w-5" />
          </Button>
        </div>
        <div className="pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-card/80 border text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-card/60">
            {progressText}
          </div>
        </div>
        <div className="pointer-events-auto">{fullscreenButton}</div>
      </div>

      {/* Right zoom rail */}
      <div className={cn("absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2", rtl && "left-3 right-auto")}> 
        <Button size="icon" variant="outline" onClick={onZoomIn} aria-label={rtl ? "تكبير" : "Zoom in"} className="pointer-events-auto h-10 w-10">
          <ZoomIn className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="outline" onClick={onZoomOut} aria-label={rtl ? "تصغير" : "Zoom out"} className="pointer-events-auto h-10 w-10">
          <ZoomOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 pb-[max(env(safe-area-inset-bottom),12px)] px-3">
        <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}> 
          <Button variant="secondary" onClick={onPrev} disabled={!canPrev} aria-label={rtl ? "السابق" : "Previous"} className="pointer-events-auto h-12 w-12 rounded-full">
            <PrevIcon className="h-5 w-5" />
          </Button>

          <Button onClick={onOpenInsights} aria-label={rtl ? "لوحة الرؤى" : "Insights"} className="pointer-events-auto h-12 px-5 rounded-full">
            <Sparkles className="h-5 w-5 mr-2" />
            <span className="text-sm">{rtl ? "الرؤى" : "Insights"}</span>
          </Button>

          <Button variant="default" onClick={onNext} disabled={!canNext} aria-label={rtl ? "التالي" : "Next"} className="pointer-events-auto h-12 w-12 rounded-full">
            <NextIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
