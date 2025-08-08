import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/functionsClient";

interface QAChatProps {
  summary: string;
  rtl?: boolean;
  title: string;
  page: number;
}

type Msg = { role: "user" | "assistant"; content: string };

const QAChat: React.FC<QAChatProps> = ({ summary, rtl = false, title, page }) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const disabled = useMemo(() => loading || !summary.trim() || q.trim().length === 0, [loading, summary, q]);

  const ask = async () => {
    if (disabled) return;
    const question = q.trim();
    setQ("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", content: question }]);

    try {
      console.log('Sending to QA function:', { question, summary: summary.substring(0, 100) + '...', summaryLength: summary.length, lang: rtl ? "ar" : "en", page, title });
      const data = await callFunction<{ answer?: string }>("qa", { question, summary, lang: rtl ? "ar" : "en", page, title });
      console.log('QA response:', data);
      const answer = data?.answer || (rtl ? "تعذّر الحصول على إجابة" : "Failed to get answer");
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: rtl ? `حدث خطأ: ${e?.message ?? "غير معروف"}` : `Error: ${e?.message ?? "Unknown"}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") ask();
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{rtl ? "اسأل الذكاء الاصطناعي" : "Ask AI about this page"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className={cn("border rounded-md p-3 h-40 overflow-y-auto bg-muted/30", messages.length === 0 && "flex items-center justify-center text-sm text-muted-foreground")}> 
            {messages.length === 0 ? (
              <div>{rtl ? "اكتب سؤالك وسيتم الإجابة اعتماداً على ملخص هذه الصفحة" : "Ask a question. The AI will answer using this page's summary."}</div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={cn("text-sm leading-6 whitespace-pre-wrap", m.role === "assistant" ? "" : "font-medium")}>{m.content}</div>
                ))}
              </div>
            )}
          </div>
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}> 
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKey}
              placeholder={rtl ? "اكتب سؤالك هنا..." : "Type your question..."}
              aria-label={rtl ? "سؤال" : "Question"}
              disabled={loading || !summary.trim()}
            />
            <Button onClick={ask} disabled={disabled} aria-label={rtl ? "إرسال" : "Send"}>
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{rtl ? "جارٍ الإجابة..." : "Answering..."}</span>
              ) : (
                <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" />{rtl ? "إرسال" : "Send"}</span>
              )}
            </Button>
          </div>
          {!summary.trim() && (
            <div className="text-xs text-muted-foreground">{rtl ? "سيتم تفعيل الأسئلة بعد إنشاء الملخص تلقائياً" : "Q&A unlocks after the summary is generated automatically."}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QAChat;
