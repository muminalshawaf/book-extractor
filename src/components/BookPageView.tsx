import React from "react";
import { SimplePDFViewer } from "./SimplePDFViewer";

export const BookPageView = React.forwardRef<HTMLDivElement, { 
  page: { pageNumber: number; alt: string };
  pdfUrl: string;
  zoom?: number; 
  fetchPriority?: "high" | "low" 
}>(
  ({ page, pdfUrl, zoom = 1, fetchPriority }, ref) => {
    console.log('BookPageView rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });
    
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
    
    console.log('Loading PDF URL:', actualPdfUrl, 'for page:', page.pageNumber);
    
    return (
      <SimplePDFViewer 
        page={page}
        pdfUrl={actualPdfUrl}
        zoom={zoom}
      />
    );
  }
);

BookPageView.displayName = "BookPageView";