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
    
    // Convert template URL to actual PDF URL
    // Page 1 maps to 002.pdf, Page 2 to 003.pdf, etc.
    const actualPdfUrl = pdfUrl.includes('{page:003d}.pdf') 
      ? pdfUrl.replace('{page:003d}.pdf', `${String(page.pageNumber + 1).padStart(3, '0')}.pdf`)
      : pdfUrl;
    
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