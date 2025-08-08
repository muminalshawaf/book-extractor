import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TouchGestureHandlerProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPinch?: (scale: number) => void;
  onPinchEnd?: (finalScale: number) => void;
  className?: string;
  disabled?: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
}

export const TouchGestureHandler: React.FC<TouchGestureHandlerProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  onPinch,
  onPinchEnd,
  className,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<TouchPoint | null>(null);
  const [initialDistance, setInitialDistance] = useState<number>(0);
  const [currentScale, setCurrentScale] = useState<number>(1);

  const getDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (disabled) return;

    if (e.touches.length === 1) {
      // Single touch for swipe
      const touch = e.touches[0];
      setTouchStart({ x: touch.clientX, y: touch.clientY });
    } else if (e.touches.length === 2) {
      // Two touches for pinch
      const distance = getDistance(e.touches[0], e.touches[1]);
      setInitialDistance(distance);
      setCurrentScale(1);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (disabled) return;

    if (e.touches.length === 2 && initialDistance > 0) {
      // Pinch gesture
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / initialDistance;
      setCurrentScale(scale);
      onPinch?.(scale);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (disabled) return;

    if (e.touches.length === 0 && touchStart) {
      // Swipe gesture
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        // Check if it's a horizontal swipe (more horizontal than vertical movement)
        if (absDeltaX > absDeltaY && absDeltaX > 50) {
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        }
      }
      setTouchStart(null);
    }

    if (e.touches.length === 0 && initialDistance > 0) {
      // End pinch gesture
      onPinchEnd?.(currentScale);
      setInitialDistance(0);
      setCurrentScale(1);
    }
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, touchStart, initialDistance, currentScale]);

  return (
    <div
      ref={containerRef}
      className={cn("touch-manipulation", className)}
      style={{ touchAction: disabled ? 'auto' : 'none' }}
    >
      {children}
    </div>
  );
};