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
    
    // Convert template URL to actual image URL
    const imageUrl = pdfUrl.includes('page-{page}.jpg') 
      ? `/book/page-${page.pageNumber}.jpg`
      : pdfUrl;
    
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