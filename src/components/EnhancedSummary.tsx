import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit3, Save, X, RefreshCw, Clock, FileText, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EnhancedSummaryProps {
  summary: string;
  onSummaryChange: (summary: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  confidence?: number;
  rtl?: boolean;
  pageNumber: number;
}

export const EnhancedSummary: React.FC<EnhancedSummaryProps> = ({
  summary,
  onSummaryChange,
  onRegenerate,
  isRegenerating,
  confidence,
  rtl = false,
  pageNumber,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(summary);
  const [copied, setCopied] = useState(false);

  // Calculate reading metrics
  const wordCount = summary.trim().split(/\s+/).filter(word => word.length > 0).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // 200 WPM average

  const handleSave = () => {
    onSummaryChange(editedSummary);
    setIsEditing(false);
    toast.success(rtl ? "تم حفظ الملخص" : "Summary saved");
  };

  const handleCancel = () => {
    setEditedSummary(summary);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(rtl ? "تم نسخ الملخص" : "Summary copied");
    } catch {
      toast.error(rtl ? "فشل في النسخ" : "Failed to copy");
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (score >= 0.6) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.8) return rtl ? "عالية" : "High";
    if (score >= 0.6) return rtl ? "متوسطة" : "Medium";
    return rtl ? "منخفضة" : "Low";
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {rtl ? `ملخص الصفحة ${pageNumber}` : `Page ${pageNumber} Summary`}
          </CardTitle>
          
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            {/* Metrics */}
            {summary && (
              <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", rtl && "flex-row-reverse")}>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span>{wordCount} {rtl ? "كلمة" : "words"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{readingTime} {rtl ? "دقيقة" : "min read"}</span>
                </div>
                {confidence !== undefined && (
                  <Badge variant="secondary" className={getConfidenceColor(confidence)}>
                    {rtl ? "الثقة" : "Confidence"}: {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
                  </Badge>
                )}
              </div>
            )}
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Action buttons */}
            {!isEditing ? (
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  disabled={!summary}
                  title={rtl ? "نسخ الملخص" : "Copy summary"}
                  className="h-8 w-8"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditing(true)}
                  disabled={!summary}
                  title={rtl ? "تحرير الملخص" : "Edit summary"}
                  className="h-8 w-8"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                  title={rtl ? "إعادة إنشاء الملخص" : "Regenerate summary"}
                  className="h-8 w-8"
                >
                  <RefreshCw className={cn("h-3 w-3", isRegenerating && "animate-spin")} />
                </Button>
              </div>
            ) : (
              <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  title={rtl ? "حفظ" : "Save"}
                  className="h-8 w-8"
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancel}
                  title={rtl ? "إلغاء" : "Cancel"}
                  className="h-8 w-8"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {!summary ? (
          <div className="text-center text-muted-foreground py-8">
            {rtl ? "لا يوجد ملخص متاح لهذه الصفحة" : "No summary available for this page"}
          </div>
        ) : isEditing ? (
          <Textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            placeholder={rtl ? "تحرير الملخص..." : "Edit summary..."}
            className="min-h-[120px] resize-none"
            dir={rtl ? "rtl" : "ltr"}
          />
        ) : (
          <div 
            className="prose prose-sm max-w-none dark:prose-invert leading-relaxed"
            dir={rtl ? "rtl" : "ltr"}
          >
            {summary.split('\n').map((paragraph, index) => (
              <p key={index} className="mb-3 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};