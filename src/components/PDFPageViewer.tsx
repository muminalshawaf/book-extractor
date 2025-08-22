import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFPageViewerProps {
  pdfUrl: string;
  page: { pageNumber: number; alt: string };
  zoom?: number;
}

export const PDFPageViewer: React.FC<PDFPageViewerProps> = ({ 
  pdfUrl, 
  page, 
  zoom = 1 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);

  console.log('PDFPageViewer rendering:', { pdfUrl, pageNumber: page.pageNumber, zoom });

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setLoading(false);
    setError(error.message || 'Failed to load PDF');
  }, []);

  const onPageLoadSuccess = useCallback(() => {
    console.log('Page loaded successfully:', page.pageNumber);
  }, [page.pageNumber]);

  const onPageLoadError = useCallback((error: Error) => {
    console.error('Page load error:', error);
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  return (
    <div className="bg-card h-full w-full relative">
      <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
        
        {loading && (
          <>
            <Skeleton className="absolute inset-3 md:inset-4 rounded-md bg-muted/60 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading PDF page {page.pageNumber}...</p>
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/90">
            <div className="text-center p-6 max-w-md">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">PDF Loading Error</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Failed to load PDF: {error}
                <br />
                Page {page.pageNumber} from: {pdfUrl}
              </p>
              <div className="space-y-2">
                <Button onClick={handleRetry} variant="outline" size="sm" className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={() => window.open(pdfUrl, '_blank')} 
                  variant="default" 
                  size="sm"
                  className="w-full"
                >
                  View PDF in New Tab
                </Button>
              </div>
            </div>
          </div>
        )}

        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          error=""
          className={cn(
            "flex items-center justify-center",
            (loading || error) && "opacity-0"
          )}
        >
          <Page
            pageNumber={1} // Always show page 1 since each PDF is a single page
            onLoadSuccess={onPageLoadSuccess}
            onLoadError={onPageLoadError}
            scale={zoom}
            loading=""
            error=""
            className="shadow-lg"
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
};

PDFPageViewer.displayName = "PDFPageViewer";