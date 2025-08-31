import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bug, Eye, EyeOff, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DebugInfo {
  currentPage: number;
  displayedImageSrc: string | null;
  expectedImageSrc: string;
  imageMatches: boolean;
  extractedTextLength: number;
  summaryLength: number;
  isProcessing: boolean;
  lastError: string | null;
  ocrQuality?: number;
  summaryConfidence?: number;
}

interface DebugHUDProps {
  debugInfo: DebugInfo;
  rtl?: boolean;
  onValidateImage?: () => Promise<boolean>;
  onRefreshPage?: () => void;
}

export const DebugHUD: React.FC<DebugHUDProps> = ({
  debugInfo,
  rtl = false,
  onValidateImage,
  onRefreshPage
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidateImage = async () => {
    if (!onValidateImage) return;
    setIsValidating(true);
    try {
      await onValidateImage();
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (isGood: boolean) => {
    return isGood ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isVisible ? (
        <Button
          onClick={() => setIsVisible(true)}
          variant="outline"
          size="sm"
          className="bg-background/80 backdrop-blur-sm shadow-lg"
        >
          <Bug className="h-4 w-4" />
          Debug
        </Button>
      ) : (
        <Card className="w-80 bg-background/95 backdrop-blur-sm shadow-lg border-2">
          <CardHeader className="pb-2">
            <CardTitle className={cn("text-sm flex items-center justify-between", rtl && "flex-row-reverse")}>
              <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                <Bug className="h-4 w-4" />
                {rtl ? "معلومات التصحيح" : "Debug Info"}
              </div>
              <Button
                onClick={() => setIsVisible(false)}
                variant="ghost"
                size="sm"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {/* Page Info */}
            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <span className="font-medium">
                {rtl ? "الصفحة الحالية:" : "Current Page:"}
              </span>
              <Badge variant="outline">{debugInfo.currentPage}</Badge>
            </div>

            {/* Image Validation */}
            <div className="space-y-2">
              <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
                <span className="font-medium">
                  {rtl ? "تطابق الصورة:" : "Image Match:"}
                </span>
                {getStatusIcon(debugInfo.imageMatches)}
              </div>
              
              {!debugInfo.imageMatches && (
                <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300">
                  <div className={cn("flex items-center gap-1 mb-1", rtl && "flex-row-reverse")}>
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">
                      {rtl ? "تحذير: عدم تطابق الصورة" : "Warning: Image Mismatch"}
                    </span>
                  </div>
                  <div className="text-xs">
                    {rtl ? "الصورة المعروضة لا تطابق الصفحة المتوقعة" : "Displayed image doesn't match expected page"}
                  </div>
                </div>
              )}
            </div>

            {/* Content Status */}
            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <span className="font-medium">
                {rtl ? "النص المستخرج:" : "Extracted Text:"}
              </span>
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                {getStatusIcon(debugInfo.extractedTextLength > 0)}
                <span>{debugInfo.extractedTextLength} chars</span>
              </div>
            </div>

            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <span className="font-medium">
                {rtl ? "الملخص:" : "Summary:"}
              </span>
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                {getStatusIcon(debugInfo.summaryLength > 0)}
                <span>{debugInfo.summaryLength} chars</span>
              </div>
            </div>

            {/* Quality Metrics */}
            {debugInfo.ocrQuality !== undefined && (
              <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
                <span className="font-medium">
                  {rtl ? "جودة OCR:" : "OCR Quality:"}
                </span>
                <Badge variant={debugInfo.ocrQuality > 0.8 ? "default" : "destructive"}>
                  {Math.round(debugInfo.ocrQuality * 100)}%
                </Badge>
              </div>
            )}

            {debugInfo.summaryConfidence !== undefined && (
              <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
                <span className="font-medium">
                  {rtl ? "ثقة الملخص:" : "Summary Confidence:"}
                </span>
                <Badge variant={debugInfo.summaryConfidence > 0.7 ? "default" : "destructive"}>
                  {Math.round(debugInfo.summaryConfidence * 100)}%
                </Badge>
              </div>
            )}

            {/* Processing Status */}
            {debugInfo.isProcessing && (
              <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-blue-600 dark:text-blue-400">
                  {rtl ? "جارٍ المعالجة..." : "Processing..."}
                </span>
              </div>
            )}

            {/* Error Display */}
            {debugInfo.lastError && (
              <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300">
                <div className={cn("flex items-center gap-1 mb-1", rtl && "flex-row-reverse")}>
                  <XCircle className="h-3 w-3" />
                  <span className="font-medium">
                    {rtl ? "آخر خطأ:" : "Last Error:"}
                  </span>
                </div>
                <div className="text-xs break-words">
                  {debugInfo.lastError}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {onValidateImage && (
                <Button
                  onClick={handleValidateImage}
                  disabled={isValidating}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  {rtl ? "تحقق من الصورة" : "Validate Image"}
                </Button>
              )}
              {onRefreshPage && (
                <Button
                  onClick={onRefreshPage}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {rtl ? "تحديث" : "Refresh"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};