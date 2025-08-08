import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit3, Save, X, RefreshCw, Clock, FileText, Copy, Check, Share2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { renderContent } from "@/lib/mathRenderer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface EnhancedSummaryProps {
  summary: string;
  onSummaryChange: (summary: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  confidence?: number;
  rtl?: boolean;
  pageNumber: number;
  title?: string;
}

export const EnhancedSummary: React.FC<EnhancedSummaryProps> = ({
  summary,
  onSummaryChange,
  onRegenerate,
  isRegenerating,
  confidence,
  rtl = false,
  pageNumber,
  title,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(summary);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Render content when summary changes
  useEffect(() => {
    if (contentRef.current && summary && !isEditing) {
      renderContent(summary, contentRef.current);
    }
  }, [summary, isEditing]);

  // Calculate reading metrics
  const wordCount = summary.trim().split(/\s+/).filter(word => word.length > 0).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // 200 WPM average

  // Sharing helpers
  const canSystemShare = typeof (navigator as any).share === "function";
  const shareTitle = `${title || (rtl ? "ملخص" : "Summary")} — ${rtl ? "صفحة" : "Page"} ${pageNumber}`;
  const shareSnippet = summary.slice(0, 280);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';


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

  const handleShare = async () => {
    if (!summary) return;
    const shareTitle = `${title || (rtl ? "ملخص" : "Summary")} — ${rtl ? "صفحة" : "Page"} ${pageNumber}`;
    const shareText = summary.slice(0, 280);
    const url = window.location.href;
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title: shareTitle, text: shareText, url });
        toast.success(rtl ? "تمت المشاركة" : "Shared");
      } catch (e) {
        // user cancelled or error; no toast needed
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareTitle}\n\n${summary}\n\n${url}`);
        toast.success(rtl ? "تم نسخ النص — الصقه في أي تطبيق اجتماعي" : "Copied — paste into any social app");
      } catch {
        toast.error(rtl ? "جهازك لا يدعم المشاركة" : "Sharing not supported");
      }
    }
  };

  const handlePrint = () => {
    if (!summary) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const dir = rtl ? "rtl" : "ltr";
    const lang = rtl ? "ar" : "en";
    const titleText = `${title || (rtl ? "ملخص" : "Summary")} — ${rtl ? "صفحة" : "Page"} ${pageNumber}`;
    const contentHtml = contentRef.current?.innerHTML || summary.replace(/\n/g, "<br/>");
    win.document.write(`<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${titleText}</title><style>
      body{font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Naskh Arabic', 'Cairo', Arial, sans-serif; padding:24px; line-height:1.7; color:#111;}
      h1{font-size:20px; margin:0 0 12px;}
      .meta{color:#555; margin-bottom:16px; font-size:12px;}
      .content{font-size:14px;}
      table{border-collapse: collapse; width:100%;}
      th,td{border:1px solid #999; padding:6px;}
      blockquote{border-${rtl ? 'right' : 'left'}:4px solid #888; padding-${rtl ? 'right' : 'left'}:12px; background:#f6f6f6;}
      @media print { @page { margin: 12mm; } }
    </style></head><body>
      <h1>${titleText}</h1>
      <div class="meta">${new Date().toLocaleString()}</div>
      <div class="content">${contentHtml}</div>
      <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},300);};</script>
    </body></html>`);
    win.document.close();
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
          <CardTitle className={cn("text-lg flex items-center gap-2 font-cairo", rtl && "flex-row-reverse")}>
            <FileText className="h-5 w-5" />
            {rtl ? `ملخص الصفحة ${pageNumber}` : `Page ${pageNumber} Summary`}
          </CardTitle>
          
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            {/* Metrics */}
            {summary && (
              <div className={cn("flex items-center gap-3 text-sm text-muted-foreground font-cairo", rtl && "flex-row-reverse")}>
                <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                  <FileText className="h-3 w-3" />
                  <span>{wordCount} {rtl ? "كلمة" : "words"}</span>
                </div>
                <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!summary}
                      title={rtl ? "مشاركة الملخص" : "Share summary"}
                      className="h-8 w-8"
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={rtl ? "start" : "end"}>
                    {canSystemShare && (
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            await (navigator as any).share({ title: shareTitle, text: shareSnippet, url: currentUrl });
                            toast.success(rtl ? "تمت المشاركة" : "Shared");
                          } catch (e: any) {
                            if (e?.name !== 'AbortError') {
                              toast.error(rtl ? "تعذر المشاركة" : "Share failed");
                            }
                          }
                        }}
                      >
                        {rtl ? "مشاركة عبر النظام" : "System Share"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareTitle}\n\n${currentUrl}`)}`, '_blank', 'noopener,noreferrer')}>
                      {rtl ? "واتساب" : "WhatsApp"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(currentUrl)}`, '_blank', 'noopener,noreferrer')}>
                      {rtl ? "X (تويتر)" : "X (Twitter)"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareTitle)}`, '_blank', 'noopener,noreferrer')}>
                      {rtl ? "تيليجرام" : "Telegram"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, '_blank', 'noopener,noreferrer')}>
                      {rtl ? "فيسبوك" : "Facebook"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`${shareTitle}\n\n${summary}\n\n${currentUrl}`);
                          toast.success(rtl ? "تم نسخ النص + الرابط" : "Copied text + link");
                        } catch {
                          toast.error(rtl ? "فشل النسخ" : "Copy failed");
                        }
                      }}
                    >
                      {rtl ? "نسخ النص + الرابط" : "Copy text + link"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrint}
                  disabled={!summary}
                  title={rtl ? "طباعة الملخص" : "Print summary"}
                  className="h-8 w-8"
                >
                  <Printer className="h-3 w-3" />
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
          <div className={cn("text-center text-muted-foreground py-8 font-cairo", rtl && "text-right")}>
            {rtl ? "لا يوجد ملخص متاح لهذه الصفحة" : "No summary available for this page"}
          </div>
        ) : isEditing ? (
          <Textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            placeholder={rtl ? "تحرير الملخص..." : "Edit summary..."}
            className={cn("min-h-[120px] resize-none font-cairo", rtl && "text-right")}
            dir={rtl ? "rtl" : "ltr"}
          />
        ) : (
          <div 
            ref={contentRef}
            className={cn(
              "prose prose-sm max-w-none dark:prose-invert leading-relaxed font-cairo",
              "prose-p:mb-4 prose-p:leading-relaxed",
              "prose-headings:font-cairo prose-headings:font-semibold",
              "prose-h1:text-lg prose-h2:text-base prose-h3:text-sm",
              "prose-strong:font-bold prose-strong:text-foreground",
              "prose-b:font-bold prose-b:text-foreground",
              "prose-em:italic prose-i:italic",
              "prose-ul:my-4 prose-ol:my-4 prose-li:mb-2",
              "prose-blockquote:border-r-4 prose-blockquote:border-primary prose-blockquote:pr-4 prose-blockquote:bg-muted/30",
              "prose-table:border-collapse prose-table:w-full prose-table:my-4",
              "prose-table:shadow-sm prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden",
              "prose-th:p-3 prose-th:border-b prose-th:border-border prose-th:bg-muted prose-th:font-semibold prose-th:text-right",
              "prose-td:p-3 prose-td:border-b prose-td:border-border prose-td:text-right",
              "prose-tr:last-child:prose-td:border-b-0",
              "prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-left prose-pre:dir-ltr",
              "prose-code:bg-muted prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm",
              "[&_.katex]:text-lg [&_.katex-display]:my-6",
              "[&_strong]:font-bold [&_strong]:text-foreground",
              "[&_b]:font-bold [&_b]:text-foreground",
              "[&_em]:italic [&_i]:italic",
              rtl && "text-right"
            )}
            dir={rtl ? "rtl" : "ltr"}
          />
        )}
      </CardContent>
    </Card>
  );
};