import React, { useCallback, useRef, useState, useEffect } from "react";
import Draggable, { DraggableData, DraggableEvent } from "react-draggable";
import { cn } from "@/lib/utils";

interface FreeformImageViewerProps {
  src: string;
  alt: string;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
  onLoadStart?: () => void;
  className?: string;
  loading?: "eager" | "lazy";
  minZoom?: number;
  maxZoom?: number;
  disabled?: boolean;
}

export const FreeformImageViewer: React.FC<FreeformImageViewerProps> = ({
  src,
  alt,
  zoom,
  onZoomChange,
  onLoad,
  onError,
  onLoadStart,
  className,
  loading = "eager",
  minZoom = 0.25,
  maxZoom = 4,
  disabled = false
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset position when zoom changes significantly
  useEffect(() => {
    if (zoom <= 1.1) {
      setPosition({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Handle image load to get natural dimensions
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    onLoad?.(e);
  }, [onLoad]);

  // Handle drag events
  const handleDrag = useCallback((e: DraggableEvent, data: DraggableData) => {
    setPosition({ x: data.x, y: data.y });
  }, []);

  const handleStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleStop = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY;
      const zoomSpeed = 0.1;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + (delta > 0 ? -zoomSpeed : zoomSpeed)));
      onZoomChange?.(newZoom);
    }
  }, [zoom, minZoom, maxZoom, onZoomChange]);

  // Handle pinch gestures for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
    }
  }, []);

  const scaledWidth = dimensions.width * zoom;
  const scaledHeight = dimensions.height * zoom;
  const containerWidth = containerRef.current?.clientWidth || 800;
  const containerHeight = containerRef.current?.clientHeight || 600;

  // Allow dragging if image is larger than container
  const canDragX = scaledWidth > containerWidth;
  const canDragY = scaledHeight > containerHeight;
  
  // Calculate bounds to prevent dragging too far
  const maxX = canDragX ? (scaledWidth - containerWidth) / 2 : 0;
  const maxY = canDragY ? (scaledHeight - containerHeight) / 2 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden w-full h-full flex items-center justify-center",
        className
      )}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <Draggable
        position={position}
        onDrag={handleDrag}
        onStart={handleStart}
        onStop={handleStop}
        disabled={disabled || (!canDragX && !canDragY)}
        bounds={{
          left: -maxX,
          right: maxX,
          top: -maxY,
          bottom: maxY
        }}
        nodeRef={imageRef}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoadStart={onLoadStart}
          onLoad={handleImageLoad}
          onError={onError}
          className={cn(
            "select-none max-w-none object-contain transition-transform duration-200 ease-out",
            isDragging ? "cursor-grabbing" : canDragX || canDragY ? "cursor-grab" : "cursor-default"
          )}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
            width: dimensions.width || "auto",
            height: dimensions.height || "auto"
          }}
        />
      </Draggable>
    </div>
  );
};

export default FreeformImageViewer;