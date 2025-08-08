import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertCircle, Wifi, WifiOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // in ms
  maxDelay: number; // in ms
  backoffFactor: number;
}

interface ErrorInfo {
  type: "network" | "processing" | "auth" | "unknown";
  message: string;
  suggestion?: string;
  retryable: boolean;
}

interface ImprovedErrorHandlerProps {
  error: Error | string | null;
  onRetry: () => Promise<void>;
  isRetrying: boolean;
  retryCount: number;
  rtl?: boolean;
  context?: string; // e.g., "OCR", "Summarization", "Image Loading"
}

export const ImprovedErrorHandler: React.FC<ImprovedErrorHandlerProps> = ({
  error,
  onRetry,
  isRetrying,
  retryCount,
  rtl = false,
  context = "Operation",
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

  const defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
  };

  // Monitor online status
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const parseError = useCallback((error: Error | string): ErrorInfo => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const lowerMessage = errorMessage.toLowerCase();

    // Network errors
    if (lowerMessage.includes('fetch') || lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return {
        type: "network",
        message: errorMessage,
        suggestion: rtl 
          ? "تحقق من اتصال الإنترنت وحاول مرة أخرى"
          : "Check your internet connection and try again",
        retryable: true,
      };
    }

    // Authentication errors
    if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
      return {
        type: "auth",
        message: errorMessage,
        suggestion: rtl 
          ? "تحقق من صحة مفاتيح API وإعدادات الخدمة"
          : "Check API keys and service configuration",
        retryable: false,
      };
    }

    // Processing errors (OCR, AI, etc.)
    if (lowerMessage.includes('processing') || lowerMessage.includes('timeout') || lowerMessage.includes('rate limit')) {
      return {
        type: "processing",
        message: errorMessage,
        suggestion: rtl 
          ? "الخدمة مشغولة، يرجى المحاولة بعد قليل"
          : "Service is busy, please try again in a moment",
        retryable: true,
      };
    }

    // Unknown errors
    return {
      type: "unknown",
      message: errorMessage,
      suggestion: rtl 
        ? "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى"
        : "An unexpected error occurred, please try again",
      retryable: true,
    };
  }, [rtl]);

  const calculateNextRetryDelay = (attempt: number): number => {
    const delay = Math.min(
      defaultRetryConfig.baseDelay * Math.pow(defaultRetryConfig.backoffFactor, attempt),
      defaultRetryConfig.maxDelay
    );
    return delay;
  };

  const handleRetryWithBackoff = async () => {
    const nextDelay = calculateNextRetryDelay(retryCount);
    setNextRetryIn(Math.ceil(nextDelay / 1000));

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setNextRetryIn(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    // Wait for the delay
    await new Promise(resolve => setTimeout(resolve, nextDelay));
    
    clearInterval(countdownInterval);
    setNextRetryIn(null);
    
    await onRetry();
  };

  if (!error) return null;

  const errorInfo = parseError(error);
  const canRetry = errorInfo.retryable && retryCount < defaultRetryConfig.maxAttempts && isOnline;
  const hasReachedMaxAttempts = retryCount >= defaultRetryConfig.maxAttempts;

  const getErrorIcon = () => {
    switch (errorInfo.type) {
      case "network":
        return isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getErrorBadgeColor = () => {
    switch (errorInfo.type) {
      case "network":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "auth":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "processing":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  return (
    <Card className="border-destructive/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className={cn("text-sm flex items-center gap-2 text-destructive", rtl && "flex-row-reverse")}>
          {getErrorIcon()}
          {rtl ? `خطأ في ${context}` : `${context} Error`}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Error type badge */}
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse justify-end")}>
          <Badge variant="secondary" className={getErrorBadgeColor()}>
            {rtl ? (
              errorInfo.type === "network" ? "شبكة" :
              errorInfo.type === "auth" ? "مصادقة" :
              errorInfo.type === "processing" ? "معالجة" : "غير معروف"
            ) : (
              errorInfo.type.charAt(0).toUpperCase() + errorInfo.type.slice(1)
            )}
          </Badge>
          
          {!isOnline && (
            <Badge variant="destructive">
              {rtl ? "غير متصل" : "Offline"}
            </Badge>
          )}
        </div>

        {/* Error message */}
        <div className="text-sm text-muted-foreground" dir={rtl ? "rtl" : "ltr"}>
          {errorInfo.message}
        </div>

        {/* Suggestion */}
        {errorInfo.suggestion && (
          <div className="text-sm bg-muted p-3 rounded-lg" dir={rtl ? "rtl" : "ltr"}>
            <strong>{rtl ? "اقتراح: " : "Suggestion: "}</strong>
            {errorInfo.suggestion}
          </div>
        )}

        {/* Retry attempts info */}
        {retryCount > 0 && (
          <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", rtl && "flex-row-reverse")}>
            <RefreshCw className="h-3 w-3" />
            <span>
              {rtl 
                ? `محاولة ${retryCount} من ${defaultRetryConfig.maxAttempts}`
                : `Attempt ${retryCount} of ${defaultRetryConfig.maxAttempts}`
              }
            </span>
          </div>
        )}

        {/* Retry button */}
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
          {canRetry && !isRetrying && nextRetryIn === null && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryWithBackoff}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              {rtl ? "إعادة المحاولة" : "Retry"}
            </Button>
          )}

          {isRetrying && (
            <Button variant="outline" size="sm" disabled className="flex items-center gap-2">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {rtl ? "جاري إعادة المحاولة..." : "Retrying..."}
            </Button>
          )}

          {nextRetryIn !== null && (
            <Button variant="outline" size="sm" disabled className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              {rtl ? `إعادة المحاولة خلال ${nextRetryIn}ث` : `Retry in ${nextRetryIn}s`}
            </Button>
          )}

          {hasReachedMaxAttempts && (
            <div className="text-xs text-destructive">
              {rtl ? "تم الوصول للحد الأقصى من المحاولات" : "Maximum retry attempts reached"}
            </div>
          )}

          {!isOnline && (
            <div className="text-xs text-muted-foreground">
              {rtl ? "سيتم إعادة المحاولة عند استعادة الاتصال" : "Will retry when connection is restored"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};