import { useEffect, useState } from "react";
import { BookPage } from "@/data/enhancedBooks";

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
      const radius = isDataSaver ? 1 : 3;
      const indicesToPreload = Array.from({ length: radius * 2 + 1 }, (_, k) => currentIndex - radius + k)
        .filter(i => i >= 0 && i < pages.length);

      for (const index of indicesToPreload) {
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