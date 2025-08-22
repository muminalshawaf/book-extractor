import React from "react";
import { ImagePageView } from "./ImagePageView";

export const BookPageView = React.forwardRef<HTMLDivElement, { 
  page: { pageNumber: number; alt: string };
  pdfUrl: string;
  zoom?: number; 
  fetchPriority?: "high" | "low" 
}>(
  ({ page, pdfUrl, zoom = 1, fetchPriority }, ref) => {
    console.log('BookPageView rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });
    
    // Convert PDF URL to image URL - assuming images follow a pattern
    const imageUrl = pdfUrl.includes('002.pdf') 
      ? `/src/assets/book/page-${page.pageNumber}.jpg`
      : pdfUrl; // fallback to original URL
    
    return (
      <ImagePageView 
        ref={ref}
        page={page}
        imageUrl={imageUrl}
        zoom={zoom}
      />
    );
  }
);

BookPageView.displayName = "BookPageView";