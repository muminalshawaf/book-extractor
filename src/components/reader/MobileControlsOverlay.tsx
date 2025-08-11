import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ZoomOut } from "lucide-react";

interface MobileControlsOverlayProps {
  progressText: string;
  rtl?: boolean;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  
  onZoomOut: () => void;
}


export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
  progressText,
  rtl = false,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onZoomOut,
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

      {/* Right zoom rail */}
      <div className={cn("absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2", rtl && "left-3 right-auto")}> 
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


          <Button variant="default" onClick={onNext} disabled={!canNext} aria-label={rtl ? "التالي" : "Next"} className="pointer-events-auto h-12 w-12 rounded-full">
            <NextIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
