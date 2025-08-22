import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, RotateCcw } from 'lucide-react';

interface DirectPDFViewerProps {
  pdfUrl: string;
  page: { pageNumber: number; alt: string };
  zoom?: number;
}

export const DirectPDFViewer: React.FC<DirectPDFViewerProps> = ({ 
  pdfUrl, 
  page, 
  zoom = 1 
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    // Force iframe reload by changing key
    const iframe = document.querySelector('iframe[data-pdf-viewer]') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const openInNewTab = () => {
    window.open(pdfUrl, '_blank');
  };

  console.log('DirectPDFViewer loading:', { 
    pdfUrl, 
    pageNumber: page.pageNumber,
    zoom 
  });

  return (
    <div className="relative w-full h-full bg-background rounded-lg overflow-hidden">
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">جاري تحميل الـ PDF...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="text-center space-y-4 p-6">
            <div className="text-red-500 text-4xl">📄</div>
            <div>
              <h3 className="text-lg font-semibold mb-2">تعذر تحميل الـ PDF</h3>
              <p className="text-sm text-muted-foreground mb-4">
                الصفحة {page.pageNumber}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleRetry} variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 ml-2" />
                إعادة المحاولة
              </Button>
              <Button onClick={openInNewTab} variant="default" size="sm">
                <ExternalLink className="w-4 h-4 ml-2" />
                فتح في تبويب جديد
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Iframe */}
      <iframe
        data-pdf-viewer
        src={pdfUrl}
        className="w-full h-full border-0"
        style={{
          transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          transformOrigin: 'top left',
          opacity: hasError ? 0 : 1
        }}
        onLoad={handleLoad}
        onError={handleError}
        title={page.alt}
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  );
};