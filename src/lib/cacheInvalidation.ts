/**
 * Cache invalidation utilities for browser localStorage
 * These functions help clear stale cache after successful processing
 */

export interface CacheInvalidationConfig {
  bookId: string;
  pageNumber?: number;
  clearAllPages?: boolean;
}

/**
 * Generate cache keys for a specific book and page
 */
export const generateCacheKeys = (bookId: string, pageNumber: number) => {
  return {
    ocrKey: `book:ocr:${bookId}:${pageNumber}`,
    sumKey: `book:summary:${bookId}:${pageNumber}`,
    ocrTimestampKey: `book:ocr-timestamp:${bookId}:${pageNumber}`,
    summaryTimestampKey: `book:summary-timestamp:${bookId}:${pageNumber}`
  };
};

/**
 * Clear cache for a specific page
 */
export const clearPageCache = (bookId: string, pageNumber: number) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return; // Server-side or no localStorage support
  }

  const keys = generateCacheKeys(bookId, pageNumber);
  
  try {
    Object.values(keys).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log(`Cache cleared for ${bookId} page ${pageNumber}`);
  } catch (error) {
    console.warn('Failed to clear page cache:', error);
  }
};

/**
 * Clear cache for all pages of a book
 */
export const clearBookCache = (bookId: string, totalPages: number = 500) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return; // Server-side or no localStorage support
  }

  try {
    // Clear known pages
    for (let i = 0; i < totalPages; i++) {
      clearPageCache(bookId, i);
    }
    
    // Also search and clear any remaining cache entries for this book
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(`book:ocr:${bookId}:`) || 
        key.startsWith(`book:summary:${bookId}:`) ||
        key.startsWith(`book:ocr-timestamp:${bookId}:`) ||
        key.startsWith(`book:summary-timestamp:${bookId}:`)
      )) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`Cache cleared for entire book: ${bookId} (${keysToRemove.length} entries)`);
  } catch (error) {
    console.warn('Failed to clear book cache:', error);
  }
};

/**
 * Mark cache as stale by setting a very old timestamp
 */
export const markCacheAsStale = (bookId: string, pageNumber: number) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return; // Server-side or no localStorage support
  }

  const keys = generateCacheKeys(bookId, pageNumber);
  const staleTimestamp = '0'; // Unix epoch, definitely stale
  
  try {
    localStorage.setItem(keys.ocrTimestampKey, staleTimestamp);
    localStorage.setItem(keys.summaryTimestampKey, staleTimestamp);
    console.log(`Cache marked as stale for ${bookId} page ${pageNumber}`);
  } catch (error) {
    console.warn('Failed to mark cache as stale:', error);
  }
};

/**
 * Invalidate cache based on configuration
 */
export const invalidateCache = (config: CacheInvalidationConfig) => {
  if (config.clearAllPages) {
    clearBookCache(config.bookId);
  } else if (config.pageNumber !== undefined) {
    clearPageCache(config.bookId, config.pageNumber);
  }
};

/**
 * Browser-side function to trigger cache invalidation from processing completion
 * This can be called from success callbacks after processing
 */
export const onProcessingComplete = (bookId: string, pageNumber: number) => {
  // Clear cache immediately to force fresh content load
  clearPageCache(bookId, pageNumber);
  
  // Dispatch a custom event to notify BookViewer components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cacheInvalidated', {
      detail: { bookId, pageNumber }
    }));
  }
};

/**
 * Hook into processing success to automatically clear cache
 * This should be called after successful OCR/summary processing
 */
export const handleProcessingSuccess = (
  bookId: string, 
  pageNumber: number, 
  type: 'ocr' | 'summary' | 'both' = 'both'
) => {
  // Add a small delay to ensure database operations complete first
  setTimeout(() => {
    if (type === 'both' || type === 'ocr' || type === 'summary') {
      clearPageCache(bookId, pageNumber);
    }
    
    // Notify components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('processingSuccess', {
        detail: { bookId, pageNumber, type }
      }));
    }
  }, 500); // 500ms delay to ensure DB operations complete
};