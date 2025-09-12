import { useCallback, useState } from 'react';

export interface CacheInfo {
  isUsingCachedContent: boolean;
  isFreshContent: boolean;
  cacheRefreshing: boolean;
}

export interface CacheKeys {
  ocrKey: string;
  sumKey: string;
  ocrTimestampKey: string;
  summaryTimestampKey: string;
}

/**
 * Custom hook for managing cache operations in BookViewer
 */
export const useCacheManager = (cacheId: string, pageIndex: number) => {
  const [isUsingCachedContent, setIsUsingCachedContent] = useState(false);
  const [isFreshContent, setIsFreshContent] = useState(false);
  const [cacheRefreshing, setCacheRefreshing] = useState(false);

  // Generate cache keys
  const getCacheKeys = useCallback((targetIndex?: number): CacheKeys => {
    const index = targetIndex ?? pageIndex;
    return {
      ocrKey: `book:ocr:${cacheId}:${index}`,
      sumKey: `book:summary:${cacheId}:${index}`,
      ocrTimestampKey: `book:ocr-timestamp:${cacheId}:${index}`,
      summaryTimestampKey: `book:summary-timestamp:${cacheId}:${index}`
    };
  }, [cacheId, pageIndex]);

  // Clear cache for a specific page
  const clearPageCache = useCallback((targetIndex?: number) => {
    const keys = getCacheKeys(targetIndex);
    
    try {
      localStorage.removeItem(keys.ocrKey);
      localStorage.removeItem(keys.sumKey);
      localStorage.removeItem(keys.ocrTimestampKey);
      localStorage.removeItem(keys.summaryTimestampKey);
    } catch (error) {
      console.warn('Failed to clear page cache:', error);
    }
  }, [getCacheKeys]);

  // Clear cache for a book (all pages)
  const clearBookCache = useCallback((bookId: string, totalPages: number) => {
    try {
      for (let i = 0; i < totalPages; i++) {
        const keys = getCacheKeys(i);
        localStorage.removeItem(keys.ocrKey);
        localStorage.removeItem(keys.sumKey);
        localStorage.removeItem(keys.ocrTimestampKey);
        localStorage.removeItem(keys.summaryTimestampKey);
      }
    } catch (error) {
      console.warn('Failed to clear book cache:', error);
    }
  }, [getCacheKeys]);

  // Check if cache is stale
  const isCacheStale = useCallback((timestampKey: string, maxAgeMs = 24 * 60 * 60 * 1000) => {
    try {
      const timestamp = localStorage.getItem(timestampKey);
      if (!timestamp) return false;
      return Date.now() - parseInt(timestamp) > maxAgeMs;
    } catch {
      return false;
    }
  }, []);

  // Set cache with timestamp
  const setCacheWithTimestamp = useCallback((key: string, value: string, timestampKey: string) => {
    try {
      localStorage.setItem(key, value);
      localStorage.setItem(timestampKey, Date.now().toString());
    } catch (error) {
      console.warn('Failed to cache with timestamp:', error);
    }
  }, []);

  // Check and clear stale cache
  const checkAndClearStaleCache = useCallback(() => {
    const keys = getCacheKeys();
    
    if (isCacheStale(keys.ocrTimestampKey) || isCacheStale(keys.summaryTimestampKey)) {
      clearPageCache();
      setIsUsingCachedContent(false);
      return true; // Cache was stale and cleared
    }
    return false; // Cache is still fresh
  }, [getCacheKeys, isCacheStale, clearPageCache]);

  // Load cached content if available and not stale
  const loadCachedContent = useCallback(() => {
    const wasStale = checkAndClearStaleCache();
    if (wasStale) return { ocrText: '', summary: '' };

    const keys = getCacheKeys();
    
    try {
      const cachedText = localStorage.getItem(keys.ocrKey) || "";
      const cachedSummary = localStorage.getItem(keys.sumKey) || "";
      
      if (cachedText || cachedSummary) {
        setIsUsingCachedContent(true);
      }
      
      return {
        ocrText: cachedText,
        summary: cachedSummary
      };
    } catch (error) {
      console.warn('Failed to load cached content:', error);
      return { ocrText: '', summary: '' };
    }
  }, [checkAndClearStaleCache, getCacheKeys]);

  // Mark content as fresh after successful processing
  const markContentAsFresh = useCallback(() => {
    setIsFreshContent(true);
    setIsUsingCachedContent(false);
  }, []);

  // Mark content as cached
  const markContentAsCached = useCallback(() => {
    setIsUsingCachedContent(true);
    setIsFreshContent(false);
  }, []);

  // Set cache refreshing state
  const setCacheRefreshingState = useCallback((refreshing: boolean) => {
    setCacheRefreshing(refreshing);
  }, []);

  return {
    // State
    isUsingCachedContent,
    isFreshContent,
    cacheRefreshing,
    
    // Actions
    clearPageCache,
    clearBookCache,
    setCacheWithTimestamp,
    loadCachedContent,
    markContentAsFresh,
    markContentAsCached,
    setCacheRefreshingState,
    checkAndClearStaleCache,
    
    // Utilities
    getCacheKeys,
    isCacheStale
  };
};