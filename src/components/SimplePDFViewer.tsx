import React, { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SimplePDFViewerProps {
  pdfUrl: string;
  page: { pageNumber: number; alt: string };
  zoom?: number;
}

export const SimplePDFViewer: React.FC<SimplePDFViewerProps> = ({ 
  pdfUrl, 
  page, 
  zoom = 1 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  console.log('SimplePDFViewer rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });

  // Create a PDF URL that opens to the specific page
  const pdfViewerUrl = `${pdfUrl}#page=${page.pageNumber}&zoom=${Math.round(zoom * 100)}`;

  const handleLoad = () => {
    console.log('PDF iframe loaded successfully for page:', page.pageNumber);
    setLoading(false);
    setError(false);
  };

  const handleError = (e: any) => {
    console.error('PDF iframe error:', e, 'URL:', pdfViewerUrl);
    setLoading(false);
    setError(true);
  };

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    // Force reload by updating the iframe src
    const iframe = document.querySelector(`iframe[title*="Page ${page.pageNumber}"]`) as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

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
              <h3 className="text-lg font-semibold mb-2">PDF Blocked by Browser</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Chrome has blocked loading this PDF in an iframe for security reasons.<br />
                Page {page.pageNumber} from: {pdfUrl}
              </p>
              <div className="space-y-2">
                <Button onClick={handleRetry} variant="outline" size="sm" className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={() => window.open(`${pdfUrl}#page=${page.pageNumber}`, '_blank')} 
                  variant="default" 
                  size="sm"
                  className="w-full"
                >
                  View PDF in New Tab
                </Button>
                <Button 
                  onClick={() => window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`, '_blank')} 
                  variant="secondary" 
                  size="sm"
                  className="w-full"
                >
                  View with Google Docs Viewer
                </Button>
              </div>
            </div>
          </div>
        )}

        <iframe
          src={pdfViewerUrl}
          className={cn(
            "w-full h-full border-0 rounded-lg",
            "min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]",
            (loading || error) && "opacity-0"
          )}
          title={`${page.alt} - Page ${page.pageNumber}`}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
};

SimplePDFViewer.displayName = "SimplePDFViewer";