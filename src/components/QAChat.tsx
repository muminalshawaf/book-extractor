import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, StopCircle, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/functionsClient";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";

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

  // Streaming targets
  const streamRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const disabled = useMemo(() => loading || q.trim().length === 0, [loading, q]);

  const stopStreaming = () => {
    try { esRef.current?.close(); } catch {}
    esRef.current = null;
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    setLoading(false);
  };

  const askInternal = async (question: string, appendUser: boolean) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);

    // Reset streaming target and add message shells
    setMessages((m) => {
      const next = appendUser ? [...m, { role: "user", content: trimmed } as const] : [...m];
      return [...next, { role: "assistant", content: "" } as const];
    });

    const lang = rtl ? "ar" : "en";
    const streamUrl = "https://ukznsekygmipnucpouoy.supabase.co/functions/v1/qa-stream";

    // Shared accumulators
    let accumulated = "";
    let lastFlush = 0;
    const flush = () => {
      setMessages((m) => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { role: "assistant", content: accumulated } as const;
        }
        return copy;
      });
    };

    try {
      // Prefer EventSource (GET) for small payloads
      const canUseES = !summary || summary.length <= 1500;
      if (canUseES) {
        await new Promise<void>((resolve, reject) => {
          const params = new URLSearchParams();
          params.set("question", trimmed);
          if (summary) {
            const b64 = btoa(unescape(encodeURIComponent(summary)));
            params.set("summary_b64", b64);
          }
          params.set("lang", lang);
          params.set("page", String(page));
          params.set("title", title);

          const es = new EventSource(`${streamUrl}?${params.toString()}`);
          esRef.current = es;

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
            esRef.current = null;
            resolve();
          });
          es.onerror = (err) => {
            es.close();
            esRef.current = null;
            reject(err);
          };
        });
      } else {
        // Fallback to POST fetch streaming
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(streamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ question: trimmed, summary, lang, page, title }),
          signal: controller.signal,
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
                const trimmedLine = raw.trim();
                if (trimmedLine === "[DONE]") continue;

                let chunk = raw;
                try {
                  const j = JSON.parse(raw);
                  chunk = j?.text ?? j?.delta ?? j?.content ?? raw;
                } catch {}

                accumulated += chunk;
                if (streamRef.current) streamRef.current.textContent = accumulated;

                const now = (globalThis.performance?.now?.() ?? Date.now());
                if (now - lastFlush > 200) {
                  flush();
                  lastFlush = now;
                }
              }
            }
          }
        }
        flush();
        abortRef.current = null;
      }
    } catch (e) {
      console.warn("Streaming failed, falling back to non-streaming:", e);
      try {
        const data = await callFunction<{ answer?: string }>("qa", { question: trimmed, summary, lang, page, title });
        const answer = data?.answer || (rtl ? "تعذّر الحصول على إجابة" : "Failed to get answer");
        setMessages((m) => {
          const copy = [...m];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
            copy[lastIdx] = { role: "assistant", content: answer } as const;
          } else {
            copy.push({ role: "assistant", content: answer } as const);
          }
          return copy;
        });
      } catch (err: any) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: rtl ? `حدث خطأ: ${err?.message ?? "غير معروف"}` : `Error: ${err?.message ?? "Unknown"}` } as const,
        ]);
      }
    } finally {
      setLoading(false);
      try { esRef.current?.close(); } catch {}
      esRef.current = null;
      abortRef.current = null;
    }
  };

  const ask = async () => {
    if (disabled) return;
    const question = q.trim();
    setQ("");
    await askInternal(question, true);
  };

  const regenerateLast = async () => {
    if (loading) return;
    // Find last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        await askInternal(messages[i].content, false);
        break;
      }
    }
  };

  const editUserAndRegenerate = async (index: number, newText: string) => {
    if (loading) return;
    setMessages((m) => {
      const copy = [...m];
      if (index >= 0 && index < copy.length && copy[index].role === "user") {
        copy[index] = { role: "user", content: newText } as Msg;
      }
      return copy;
    });
    await askInternal(newText, false);
  };

  const clearChat = () => setMessages([]);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{rtl ? "اسأل الذكاء الاصطناعي" : "Ask AI about this page"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <MessageList messages={messages} loading={loading} rtl={rtl} streamRef={streamRef} onRegenerate={regenerateLast} onEditUser={editUserAndRegenerate} />

          <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}> 
            <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}> 
              <Button variant="ghost" size="sm" onClick={clearChat} disabled={messages.length === 0 || loading} aria-label={rtl ? "مسح" : "Clear"}>
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{rtl ? "مسح المحادثة" : "Clear chat"}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={regenerateLast} disabled={messages.filter(m=>m.role==="user").length===0 || loading} aria-label={rtl ? "إعادة توليد" : "Regenerate"}>
                <RotateCcw className="h-4 w-4" />
                <span className="sr-only">{rtl ? "إعادة توليد الإجابة" : "Regenerate answer"}</span>
              </Button>
            </div>

            <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}> 
              {loading && (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {rtl ? "جارٍ الإجابة..." : "Answering..."}
                </span>
              )}
              {loading ? (
                <Button variant="outline" size="sm" onClick={stopStreaming} aria-label={rtl ? "إيقاف" : "Stop"}>
                  <StopCircle className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <Composer
            value={q}
            onChange={setQ}
            onSend={ask}
            onStop={stopStreaming}
            disabled={disabled}
            loading={loading}
            rtl={rtl}
          />

          {!summary.trim() && (
            <div className="text-xs text-muted-foreground">{rtl ? "يمكنك طرح أي سؤال، أو إنشاء ملخص للصفحة أولاً للحصول على إجابات أكثر دقة" : "You can ask any question, or generate a page summary first for more accurate answers."}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QAChat;
