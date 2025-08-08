import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/functionsClient";
import MathRenderer from "@/components/MathRenderer";

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
  const streamRef = useRef<HTMLDivElement | null>(null);

  const disabled = useMemo(() => loading || q.trim().length === 0, [loading, q]);

  const ask = async () => {
    if (disabled) return;
    const question = q.trim();
    setQ("");
    setLoading(true);
    // Add the user message and an empty assistant message to stream into
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);

    const lang = rtl ? "ar" : "en";
    const streamUrl = "https://ukznsekygmipnucpouoy.supabase.co/functions/v1/qa-stream";

    try {
      // Shared accumulators for both streaming methods
      let accumulated = "";
      let lastFlush = 0;
      const flush = () => {
        setMessages((m) => {
          const copy = [...m];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
            copy[lastIdx] = { role: "assistant", content: accumulated };
          }
          return copy;
        });
      };

      // Prefer EventSource (GET) when the payload is small enough
      const canUseES = !summary || summary.length <= 1500;
      if (canUseES) {
        await new Promise<void>((resolve, reject) => {
          const params = new URLSearchParams();
          params.set("question", question);
          if (summary) {
            // Encode summary safely for URL (UTF-8 -> base64)
            const b64 = btoa(unescape(encodeURIComponent(summary)));
            params.set("summary_b64", b64);
          }
          params.set("lang", lang);
          params.set("page", String(page));
          params.set("title", title);

          const es = new EventSource(`${streamUrl}?${params.toString()}`);

          es.onmessage = (ev) => {
            let chunk = ev.data;
            try {
              const j = JSON.parse(chunk);
              chunk = j?.text ?? j?.delta ?? j?.content ?? chunk;
            } catch {}
            accumulated += chunk;
            if (streamRef.current) streamRef.current.textContent = accumulated;

            const now = (globalThis.performance?.now?.() ?? Date.now());
            if (now - lastFlush > 200) {
              flush();
              lastFlush = now;
            }
          };
          es.addEventListener("done", () => {
            flush();
            es.close();
            resolve();
          });
          es.onerror = (err) => {
            es.close();
            reject(err);
          };
        });
      } else {
        // Fallback to POST fetch streaming for larger payloads
        const res = await fetch(streamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify({ question, summary, lang, page, title }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";

          for (const evt of events) {
            const lines = evt.split(/\r?\n/);
            for (const ln of lines) {
              if (ln.startsWith("data:")) {
                const raw = ln.slice(5);
                const trimmed = raw.trim();
                if (trimmed === "[DONE]") continue;

                let chunk = raw;
                try {
                  const j = JSON.parse(raw);
                  chunk = j?.text ?? j?.delta ?? j?.content ?? raw;
                } catch {}

                accumulated += chunk;
                if (streamRef.current) {
                  streamRef.current.textContent = accumulated;
                }

                const now = (globalThis.performance?.now?.() ?? Date.now());
                if (now - lastFlush > 200) {
                  flush();
                  lastFlush = now;
                }
              }
            }
          }
        }
        // Final flush after stream completes
        flush();
      }

    } catch (e) {
      console.warn("Streaming failed, falling back to non-streaming:", e);
      try {
        const data = await callFunction<{ answer?: string }>("qa", { question, summary, lang, page, title });
        const answer = data?.answer || (rtl ? "تعذّر الحصول على إجابة" : "Failed to get answer");
        setMessages((m) => {
          const copy = [...m];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
            copy[lastIdx] = { role: "assistant", content: answer };
          } else {
            copy.push({ role: "assistant", content: answer });
          }
          return copy;
        });
      } catch (err: any) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: rtl ? `حدث خطأ: ${err?.message ?? "غير معروف"}` : `Error: ${err?.message ?? "Unknown"}` },
        ]);
      }
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
                  <div key={i} className={cn("text-sm", m.role === "assistant" ? "" : "font-medium")}>
                    {m.role === "assistant" ? (
                      // During streaming, render raw text to avoid heavy KaTeX re-renders
                      loading && i === messages.length - 1 ? (
                        <div ref={i === messages.length - 1 ? streamRef : undefined} className="whitespace-pre-wrap text-sm">{m.content}</div>
                      ) : (
                        <MathRenderer content={m.content} className="text-sm" />
                      )
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
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
              disabled={loading}
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
            <div className="text-xs text-muted-foreground">{rtl ? "يمكنك طرح أي سؤال، أو إنشاء ملخص للصفحة أولاً للحصول على إجابات أكثر دقة" : "You can ask any question, or generate a page summary first for more accurate answers."}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QAChat;
