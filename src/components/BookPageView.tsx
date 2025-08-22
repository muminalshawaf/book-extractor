import React, { useEffect, useMemo, useRef, useState } from "react";
import { SimplePDFViewer } from "./SimplePDFViewer";

export const BookPageView = React.forwardRef<HTMLDivElement, { 
  page: { pageNumber: number; alt: string };
  pdfUrl: string;
  zoom?: number; 
  fetchPriority?: "high" | "low" 
}>(
  ({ page, pdfUrl, zoom = 1, fetchPriority }, ref) => {
    console.log('BookPageView rendering with:', { pageNumber: page.pageNumber, pdfUrl, zoom });
    
    return (
      <div ref={ref}>
        <SimplePDFViewer 
          pdfUrl={pdfUrl} 
          page={page} 
          zoom={zoom} 
        />
      </div>
    );
  }
);

BookPageView.displayName = "BookPageView";