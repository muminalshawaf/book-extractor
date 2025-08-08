import React, { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MiniMapProps {
  imageSrc: string;
  imageAlt: string;
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
  onNavigate: (x: number, y: number) => void;
  rtl?: boolean;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  imageSrc,
  imageAlt,
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  scrollLeft,
  scrollTop,
  zoom,
  onNavigate,
  rtl = false,
}) => {
  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapSize = 200; // Fixed mini-map size
  
  // Calculate scale factor to fit image in mini-map
  const scale = Math.min(miniMapSize / imageWidth, miniMapSize / imageHeight);
  const scaledImageWidth = imageWidth * scale;
  const scaledImageHeight = imageHeight * scale;
  
  // Calculate viewport rectangle dimensions and position
  const viewportWidth = (containerWidth / zoom) * scale;
  const viewportHeight = (containerHeight / zoom) * scale;
  const viewportLeft = (scrollLeft / zoom) * scale;
  const viewportTop = (scrollTop / zoom) * scale;

  const handleMiniMapClick = (e: React.MouseEvent) => {
    if (!miniMapRef.current) return;
    
    const rect = miniMapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert click position back to scroll coordinates
    const scrollX = Math.max(0, (x / scale - containerWidth / zoom / 2) * zoom);
    const scrollY = Math.max(0, (y / scale - containerHeight / zoom / 2) * zoom);
    
    onNavigate(scrollX, scrollY);
  };

  return (
    <Card className={cn("fixed bottom-4 shadow-lg z-10", rtl ? "left-4" : "right-4")}>
      <CardContent className="p-2">
        <div
          ref={miniMapRef}
          className="relative cursor-crosshair border rounded"
          style={{
            width: scaledImageWidth,
            height: scaledImageHeight,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: `${scaledImageWidth}px ${scaledImageHeight}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
          onClick={handleMiniMapClick}
        >
          {/* Viewport indicator */}
          <div
            className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
            style={{
              left: Math.max(0, Math.min(viewportLeft, scaledImageWidth - viewportWidth)),
              top: Math.max(0, Math.min(viewportTop, scaledImageHeight - viewportHeight)),
              width: Math.min(viewportWidth, scaledImageWidth),
              height: Math.min(viewportHeight, scaledImageHeight),
            }}
          />
        </div>
        <div className="text-xs text-muted-foreground text-center mt-1">
          {rtl ? "خريطة التنقل" : "Navigation"}
        </div>
      </CardContent>
    </Card>
  );
};