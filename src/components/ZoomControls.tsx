import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Maximize2, Monitor, Move, Percent } from "lucide-react";
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
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  minZoom,
  maxZoom,
  zoomStep,
  mode,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitHeight,
  onActualSize,
  rtl = false,
  showMiniMap = false,
  onToggleMiniMap,
  iconsOnly = false,
}) => {
  

  return (
    <Card className="shadow-sm">
      <CardContent className={cn("p-2", iconsOnly ? "px-2" : "p-3")}> 
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}> 
          {/* Zoom out */}
          <Button
            size="icon"
            variant="outline"
            onClick={onZoomOut}
            disabled={zoom <= minZoom}
            aria-label={rtl ? "تصغير" : "Zoom out"}
            className="h-8 w-8"
          >
            <Minus className="h-3 w-3" />
          </Button>

          {/* Current zoom display (hidden in iconsOnly) */}
          {!iconsOnly && (
            <div className="min-w-[60px] text-center font-mono text-muted-foreground">
              {Math.round(zoom * 100)}%
            </div>
          )}

          {/* Zoom in */}
          <Button
            size="icon"
            variant="outline"
            onClick={onZoomIn}
            disabled={zoom >= maxZoom}
            aria-label={rtl ? "تكبير" : "Zoom in"}
            className="h-8 w-8"
          >
            <Plus className="h-3 w-3" />
          </Button>

          {!iconsOnly && <Separator orientation="vertical" className="h-6" />}

          {/* Fit controls (icons only when iconsOnly) */}
          <Button
            size={iconsOnly ? "icon" : "sm"}
            variant={mode === "fit-width" ? "default" : "outline"}
            onClick={onFitWidth}
            title={rtl ? "ملائمة العرض" : "Fit width"}
            className={iconsOnly ? "h-8 w-8" : "h-8 px-3"}
            aria-label={rtl ? "ملائمة العرض" : "Fit width"}
          >
            <Monitor className="h-3 w-3" />
            {!iconsOnly && (rtl ? "عرض" : "Width")}
          </Button>

          <Button
            size={iconsOnly ? "icon" : "sm"}
            variant={mode === "fit-height" ? "default" : "outline"}
            onClick={onFitHeight}
            title={rtl ? "ملائمة الارتفاع" : "Fit height"}
            className={iconsOnly ? "h-8 w-8" : "h-8 px-3"}
            aria-label={rtl ? "ملائمة الارتفاع" : "Fit height"}
          >
            <Maximize2 className="h-3 w-3" />
            {!iconsOnly && (rtl ? "ارتفاع" : "Height")}
          </Button>

          <Button
            size={iconsOnly ? "icon" : "sm"}
            variant={mode === "actual-size" ? "default" : "outline"}
            onClick={onActualSize}
            title={rtl ? "الحجم الفعلي" : "Actual size"}
            className={iconsOnly ? "h-8 w-8" : "h-8 px-3"}
            aria-label={rtl ? "الحجم الفعلي" : "Actual size"}
          >
            {iconsOnly ? <Percent className="h-3 w-3" /> : "100%"}
          </Button>

          {/* Mini-map toggle */}
          {onToggleMiniMap && zoom > 1 && (
            <>
              {!iconsOnly && <Separator orientation="vertical" className="h-6" />}
              <Button
                size={iconsOnly ? "icon" : "sm"}
                variant={showMiniMap ? "default" : "outline"}
                onClick={onToggleMiniMap}
                title={rtl ? "خريطة مصغرة" : "Mini-map"}
                className={iconsOnly ? "h-8 w-8" : "h-8 px-3"}
                aria-label={rtl ? "خريطة مصغرة" : "Mini-map"}
              >
                <Move className="h-3 w-3" />
                {!iconsOnly && (rtl ? "خريطة" : "Map")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};