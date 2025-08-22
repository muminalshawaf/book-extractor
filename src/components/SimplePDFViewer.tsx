import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  console.log('SimplePDFViewer rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });

  // Create a PDF URL that opens to the specific page
  const pdfViewerUrl = `${pdfUrl}#page=${page.pageNumber}&zoom=${Math.round(zoom * 100)}`;

  return (
    <div className="bg-card h-full w-full relative">
      <div className="flex items-center justify-center w-full p-3 relative min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]">
        <iframe
          src={pdfViewerUrl}
          className={cn(
            "w-full h-full border-0 rounded-lg",
            "min-h-[60vh] md:min-h-[70vh] lg:min-h-[78vh]"
          )}
          title={`${page.alt} - Page ${page.pageNumber}`}
          loading="lazy"
          onLoad={() => console.log('PDF iframe loaded for page:', page.pageNumber)}
          onError={(e) => console.error('PDF iframe error:', e)}
        />
      </div>
    </div>
  );
};

SimplePDFViewer.displayName = "SimplePDFViewer";