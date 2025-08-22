import { useEffect, useState } from "react";

export type BookPage = {
  pageNumber: number;
  alt: string;
};

interface PreloadState {
  [key: string]: "loading" | "loaded" | "error";
}

export const useImagePreloader = (pages: BookPage[], currentIndex: number) => {
  const [preloadState, setPreloadState] = useState<PreloadState>({});

  // PDF pages don't need preloading like images do
  // react-pdf handles PDF page loading internally
  useEffect(() => {
    // For PDFs, we can mark all pages as "loaded" since they're part of the same document
    const newState: PreloadState = {};
    pages.forEach((page) => {
      const key = `page-${page.pageNumber}`;
      newState[key] = "loaded";
    });
    setPreloadState(newState);
  }, [pages]);

  const getPreloadStatus = (pageNumber: number) => preloadState[`page-${pageNumber}`] || "loaded";

  return { preloadState, getPreloadStatus };
};