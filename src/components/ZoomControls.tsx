import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Maximize2, Maximize, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ZoomMode = "fit-width" | "fit-height" | "actual-size" | "custom";

interface ZoomControlsProps {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  mode: ZoomMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onActualSize: () => void;
  rtl?: boolean;
  showMiniMap?: boolean;
  onToggleMiniMap?: () => void;
  iconsOnly?: boolean;
  onCenter?: () => void;
  onToggleFullscreen?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  side?: "left" | "right";
  className?: string;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onCenter,
  onToggleFullscreen,
  onPrev,
  onNext,
  rtl = false,
  side = "right",
  className,
}) => {
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1/2 -translate-y-1/2 z-10",
        side === "left" ? "left-2 md:left-3" : "right-2 md:right-3",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        className
      )}
      aria-label={rtl ? "عناصر تحكم القراءة" : "Reading controls"}
    >
      <div className="flex flex-col gap-2">
        {onPrev && (
          <Button
            size="icon"
            variant="secondary"
            className="pointer-events-auto shadow-sm"
            onClick={onPrev}
            aria-label={rtl ? "الصفحة السابقة" : "Previous page"}
          >
            <PrevIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="secondary"
          className="pointer-events-auto shadow-sm"
          onClick={onZoomIn}
          aria-label={rtl ? "تكبير" : "Zoom in"}
        >
          <Plus className="h-4 w-4" />
        </Button>
        {onToggleFullscreen && (
          <Button
            size="icon"
            variant="secondary"
            className="pointer-events-auto shadow-sm"
            onClick={onToggleFullscreen}
            aria-label={rtl ? "ملء الشاشة" : "Full screen"}
          >
            <Maximize className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="secondary"
          className="pointer-events-auto shadow-sm"
          onClick={onCenter}
          aria-label={rtl ? "توسيط" : "Center"}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="pointer-events-auto shadow-sm"
          onClick={onZoomOut}
          aria-label={rtl ? "تصغير" : "Zoom out"}
        >
          <Minus className="h-4 w-4" />
        </Button>
        {onNext && (
          <Button
            size="icon"
            variant="secondary"
            className="pointer-events-auto shadow-sm"
            onClick={onNext}
            aria-label={rtl ? "الصفحة التالية" : "Next page"}
          >
            <NextIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

