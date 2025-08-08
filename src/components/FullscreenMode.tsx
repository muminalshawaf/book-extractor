import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullscreenModeProps {
  children: React.ReactNode;
  rtl?: boolean;
}

export const FullscreenMode: React.FC<FullscreenModeProps> = ({ children, rtl = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isFullscreen]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col">
        {/* Minimal fullscreen header */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleFullscreen}
            className="bg-background/80 backdrop-blur-sm"
            title={rtl ? "خروج من ملء الشاشة" : "Exit fullscreen"}
          >
            <Minimize className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleFullscreen}
        title={rtl ? "ملء الشاشة (F)" : "Fullscreen (F)"}
        className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm hover:bg-accent"
      >
        <Maximize className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
};