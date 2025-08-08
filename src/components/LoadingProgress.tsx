import React from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface LoadingProgressProps {
  type: "ocr" | "summary" | "image";
  progress: number;
  estimatedTime?: number;
  rtl?: boolean;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  type,
  progress,
  estimatedTime,
  rtl = false,
}) => {
  const getTypeLabel = () => {
    switch (type) {
      case "ocr":
        return rtl ? "استخراج النص" : "Extracting Text";
      case "summary":
        return rtl ? "إنشاء الملخص" : "Generating Summary";
      case "image":
        return rtl ? "تحميل الصورة" : "Loading Image";
      default:
        return rtl ? "معالجة" : "Processing";
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return rtl ? `${seconds} ثانية` : `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return rtl ? `${mins}:${secs.toString().padStart(2, '0')} دقيقة` : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{getTypeLabel()}</span>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {estimatedTime && (
            <p className="text-xs text-muted-foreground mt-1">
              {rtl ? `الوقت المتبقي: ${formatTime(estimatedTime)}` : `Est. time: ${formatTime(estimatedTime)}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};