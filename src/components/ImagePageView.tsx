import React, { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImagePageViewProps {
  page: { pageNumber: number; alt: string };
  imageUrl: string;
  zoom?: number;
}

export const ImagePageView = React.forwardRef<HTMLDivElement, ImagePageViewProps>(
  ({ page, imageUrl, zoom = 1 }, ref) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    
    console.log('ImagePageView rendering:', { pageNumber: page.pageNumber, imageUrl, zoom });

    const handleLoad = () => {
      console.log('Image loaded successfully for page:', page.pageNumber);
      setLoading(false);
      setError(false);
    };

    const handleError = () => {
      console.error('Image load error for page:', page.pageNumber, 'URL:', imageUrl);
      setLoading(false);
      setError(true);
    };

    const handleRetry = () => {
      setLoading(true);
      setError(false);
    };

    return (
      <div className="bg-card h-full w-full relative" ref={ref}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          
          {loading && !error && (
            <>
              <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading page {page.pageNumber}...</p>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/90">
              <div className="text-center p-6 max-w-md">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Failed to load page</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Unable to load page {page.pageNumber}
                </p>
                <Button onClick={handleRetry} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <img
            src={imageUrl}
            alt={page.alt}
            className={cn(
              "max-w-full max-h-full object-contain rounded-lg select-none",
              (loading || error) && "opacity-0"
            )}
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: 'center center'
            }}
            onLoad={handleLoad}
            onError={handleError}
            draggable={false}
          />
        </div>
      </div>
    );
  }
);

ImagePageView.displayName = "ImagePageView";