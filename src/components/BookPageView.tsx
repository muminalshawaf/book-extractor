import React, { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';

// Set worker source for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export const BookPageView = React.forwardRef<HTMLDivElement, { 
  page: { pageNumber: number; alt: string };
  pdfUrl: string;
  zoom?: number; 
  fetchPriority?: "high" | "low" 
}>(
  ({ page, pdfUrl, zoom = 1, fetchPriority }, ref) => {
    console.log('BookPageView rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });
    
    const [loaded, setLoaded] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [pdfLoaded, setPdfLoaded] = useState(false);

    const isLoading = !loaded || !pdfLoaded;

    // Simulated indeterminate-like progress while loading
    useEffect(() => {
      if (isLoading && progress === 0) {
        const id = window.setInterval(() => {
          setProgress((prev) => {
            const next = prev + (prev < 60 ? 5 : prev < 80 ? 2 : 1);
            return Math.min(next, 90);
          });
        }, 120);
        return () => window.clearInterval(id);
      }
    }, [isLoading, progress]);

    const onDocumentLoadSuccess = () => {
      console.log('PDF Document loaded successfully:', pdfUrl);
      setPdfLoaded(true);
      setProgress(100);
    };

    const onDocumentLoadError = (error: Error) => {
      console.error('PDF Document load error:', error.message, 'URL:', pdfUrl);
      setError(error.message);
      setProgress(0);
    };

    const onPageLoadSuccess = () => {
      console.log('PDF Page loaded successfully:', page.pageNumber);
      setLoaded(true);
      setProgress(100);
    };

    const onPageLoadError = (error: Error) => {
      console.error('PDF Page load error:', error.message, 'Page:', page.pageNumber);
      setError(error.message);
    };

    return (
      <div className="bg-card h-full w-full" ref={ref} aria-busy={isLoading}>
        <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
          {isLoading && (
            <>
              <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <Loader2 className="h-8 w-8 animate-spin text-foreground" aria-hidden="true" />
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-3/4 max-w-md">
                <Progress value={progress} aria-label="Page load progress" />
              </div>
              <span className="sr-only">Loading PDF page...</span>
            </>
          )}
          
          {error && (
            <div className="text-destructive text-center p-4">
              <p>Error loading PDF: {error}</p>
            </div>
          )}
          
          {!error && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
            >
              <Page
                pageNumber={page.pageNumber}
                onLoadSuccess={onPageLoadSuccess}
                onLoadError={onPageLoadError}
                loading=""
                scale={zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="max-w-full object-contain select-none"
              />
            </Document>
          )}
        </div>
      </div>
    );
  }
);

BookPageView.displayName = "BookPageView";