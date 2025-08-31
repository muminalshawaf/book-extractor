import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, Minus, Maximize2 } from "lucide-react";

interface MobileControlsOverlayProps {
  progressText: string;
  rtl?: boolean;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onCenter?: () => void;
  onToggleFullscreen?: () => void;
}


export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
  progressText,
  rtl = false,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onZoomIn,
  onZoomOut,
  onCenter,
  onToggleFullscreen,
}) => {
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top row */}
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")} />
        <div className="pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-card/80 border text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-card/60">
            {progressText}
          </div>
        </div>
        
      </div>


      {/* Bottom bar with navigation and zoom controls */}
      <div className="absolute inset-x-0 bottom-0 pb-[max(env(safe-area-inset-bottom),12px)] px-3">
        <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            {canPrev && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onPrev}
                className="pointer-events-auto bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                aria-label={rtl ? "الصفحة السابقة" : "Previous page"}
              >
                <PrevIcon className="h-4 w-4" />
              </Button>
            )}
            {canNext && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onNext}
                className="pointer-events-auto bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                aria-label={rtl ? "الصفحة التالية" : "Next page"}
              >
                <NextIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            {onZoomOut && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onZoomOut}
                className="pointer-events-auto bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                aria-label={rtl ? "تصغير" : "Zoom out"}
              >
                <Minus className="h-4 w-4" />
              </Button>
            )}
            {onCenter && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onCenter}
                className="pointer-events-auto bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                aria-label={rtl ? "توسيط" : "Center"}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
            {onZoomIn && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onZoomIn}
                className="pointer-events-auto bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
                aria-label={rtl ? "تكبير" : "Zoom in"}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
