import React from "react";
import { PDFPageViewer } from "./PDFPageViewer";

export const BookPageView = React.forwardRef<HTMLDivElement, { 
  page: { pageNumber: number; alt: string };
  pdfUrl: string;
  zoom?: number; 
  fetchPriority?: "high" | "low" 
}>(
  ({ page, pdfUrl, zoom = 1, fetchPriority }, ref) => {
    console.log('BookPageView rendering with:', { 
      pageNumber: page.pageNumber, 
      pdfUrl, 
      zoom, 
      bookType: pdfUrl.includes('math12-1-3') ? 'math' : 'other'
    });
    
    // For math12-1-3 book, map page numbers correctly
    // Page 1 should load 002.pdf, Page 2 should load 003.pdf, etc.
    let actualPdfUrl = pdfUrl;
    
    if (pdfUrl.includes('{page:003d}.pdf')) {
      // Convert page number to correct PDF number (add 1 to get 002, 003, etc.)
      const pdfNumber = String(page.pageNumber + 1).padStart(3, '0');
      actualPdfUrl = pdfUrl.replace('{page:003d}.pdf', `${pdfNumber}.pdf`);
    } else if (pdfUrl.includes('math12-1-3')) {
      // Fallback for direct math book URL construction
      const pdfNumber = String(page.pageNumber + 1).padStart(3, '0');
      actualPdfUrl = `https://ksa.idros.ai/books/math12-1-3/${pdfNumber}.pdf`;
    }
    
    // Use proxy to avoid CORS issues
    const proxiedUrl = `https://ukznsekygmipnucpouoy.supabase.co/functions/v1/pdf-proxy?url=${encodeURIComponent(actualPdfUrl)}`;
    
    console.log('Loading PDF URL via proxy:', proxiedUrl, 'for page:', page.pageNumber);
    
    return (
      <PDFPageViewer 
        page={page}
        pdfUrl={proxiedUrl}
        zoom={zoom}
      />
    );
  }
);

BookPageView.displayName = "BookPageView";