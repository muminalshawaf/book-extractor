import { useEffect, useState } from "react";
import { BookPage } from "@/components/BookViewer";

interface PreloadState {
  [key: string]: "loading" | "loaded" | "error";
}

export const useImagePreloader = (pages: BookPage[], currentIndex: number) => {
  const [preloadState, setPreloadState] = useState<PreloadState>({});

  const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = src;
    });
  };

  useEffect(() => {
    const preloadAdjacentPages = async () => {
      const isDataSaver = typeof window !== 'undefined' && (
        document.documentElement.classList.contains('data-saver') ||
        localStorage.getItem('data-saver') === 'true'
      );
      
      // Always preload at least 5 pages ahead as requested
      const backwardRadius = isDataSaver ? 1 : 2; // 1-2 pages behind
      const forwardRadius = isDataSaver ? 3 : 5;  // 3-5 pages ahead
      
      const indicesToPreload = [
        // Backward pages
        ...Array.from({ length: backwardRadius }, (_, k) => currentIndex - (k + 1)),
        // Current page (highest priority)
        currentIndex,
        // Forward pages (at least 5 ahead)
        ...Array.from({ length: forwardRadius }, (_, k) => currentIndex + (k + 1))
      ].filter(i => i >= 0 && i < pages.length);

      // Prioritize current page first
      const currentPage = pages[currentIndex];
      if (currentPage && preloadState[currentPage.src] !== "loaded") {
        setPreloadState(prev => ({ ...prev, [currentPage.src]: "loading" }));
        try {
          await preloadImage(currentPage.src);
          setPreloadState(prev => ({ ...prev, [currentPage.src]: "loaded" }));
        } catch {
          setPreloadState(prev => ({ ...prev, [currentPage.src]: "error" }));
        }
      }

      // Then preload other pages
      for (const index of indicesToPreload) {
        if (index === currentIndex) continue; // Already handled above
        
        const page = pages[index];
        if (!page || preloadState[page.src] === "loaded") continue;

        setPreloadState(prev => ({ ...prev, [page.src]: "loading" }));

        try {
          await preloadImage(page.src);
          setPreloadState(prev => ({ ...prev, [page.src]: "loaded" }));
        } catch {
          setPreloadState(prev => ({ ...prev, [page.src]: "error" }));
        }
      }
    };

    preloadAdjacentPages();
  }, [currentIndex, pages]);

  const getPreloadStatus = (src: string) => preloadState[src] || "not-loaded";

  return { preloadState, getPreloadStatus };
};