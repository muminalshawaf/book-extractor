import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, StopCircle, RotateCcw, Trash2, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/functionsClient";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import { Input } from "@/components/ui/input";
import LatexModal from "./chat/LatexModal";
import TutorDrawer from "./chat/TutorDrawer";

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

  // UI extensions: LaTeX modal + selection Ask popup
  const [latexOpen, setLatexOpen] = useState(false);
  const handleInsertLatex = (latex: string) => setQ((prev) => `${prev}${prev ? " " : ""}$$${latex}$$ `);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askPos, setAskPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [selectionText, setSelectionText] = useState("");
  const [askVal, setAskVal] = useState("");

  // Drawer (sidebar) state + suggestions
  const [drawerOpen, setDrawerOpen] = useState(false);
  const suggestions = useMemo(() => (
    rtl
      ? [ { title: "اشرح مفهوم النظرية النسبية", query: "اشرح مفهوم النظرية النسبية لأينشتاين" } ]
      : [ { title: "Explain relativity", query: "Explain Einstein’s theory of relativity" } ]
  ), [rtl]);

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || "";
      if (!containerRef.current) { setAskOpen(false); return; }
      if (!text || !(sel?.rangeCount)) { setAskOpen(false); return; }
      const range = sel.getRangeAt(0);
      const inside = containerRef.current.contains(range.commonAncestorContainer as Node);
      if (!inside) { setAskOpen(false); return; }
      const rect = range.getBoundingClientRect();
      setSelectionText(text);
      setAskOpen(true);
      setAskPos({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX + rect.width / 2 });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

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

  const submitAskFromSelection: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!selectionText.trim() || loading) { setAskOpen(false); return; }
    const prompt = rtl
      ? `بالإشارة إلى النص التالي:\n"${selectionText}"\n\n${askVal.trim() || ""}`
      : `Regarding the following text:\n"${selectionText}"\n\n${askVal.trim() || ""}`;
    setAskOpen(false);
    setAskVal("");
    await askInternal(prompt, true);
  };

  const clearChat = () => setMessages([]);

  return (
    <Card className="mt-4 bg-transparent border-0 shadow-none">
      <CardHeader className={cn("flex flex-row items-center justify-between", rtl && "flex-row-reverse")}> 
        <CardTitle className="text-base">{rtl ? "المدرس الإفتراضي" : "AI Tutor"}</CardTitle>
        <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label={rtl ? "القائمة" : "Menu"}>
          <Menu className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div ref={containerRef}>
            <MessageList messages={messages} loading={loading} rtl={rtl} streamRef={streamRef} onRegenerate={regenerateLast} onEditUser={editUserAndRegenerate} />
          </div>

          {askOpen && (
            <form onSubmit={submitAskFromSelection}
              className={cn("fixed z-50 bg-background border rounded-lg shadow p-2 flex items-center gap-2", rtl && "flex-row-reverse")}
              style={{ top: askPos.top, left: askPos.left, transform: "translateX(-50%)" }}
            >
              <Input value={askVal} onChange={(e) => setAskVal(e.target.value)}
                placeholder={rtl ? "اسأل عن التحديد" : "Ask about selection"}
                className="w-56"
              />
              <Button type="submit" size="sm">{rtl ? "إرسال" : "Ask"}</Button>
            </form>
          )}

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
            onOpenLatex={() => setLatexOpen(true)}
          />

          <div className={cn("flex", rtl ? "justify-end" : "justify-start")}> 
            <Button variant="ghost" size="sm" onClick={() => setLatexOpen(true)}>
              {rtl ? "أدوات" : "Tools"}
            </Button>
          </div>

          <LatexModal
            open={latexOpen}
            onOpenChange={setLatexOpen}
            onInsert={handleInsertLatex}
            rtl={rtl}
          />

          <div className="text-center text-xs text-muted-foreground">{rtl ? "قد يخطئ إدرس، لذا يرجى التحقق من المعلومات." : "AI may make mistakes—please verify."}</div>

          {!summary.trim() && (
            <div className="text-xs text-muted-foreground">{rtl ? "يمكنك طرح أي سؤال، أو إنشاء ملخص للصفحة أولاً للحصول على إجابات أكثر دقة" : "You can ask any question, or generate a page summary first for more accurate answers."}</div>
          )}
        </div>
      </CardContent>
      <TutorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        rtl={rtl}
        onNewChat={() => { setMessages([]); setQ(""); }}
        suggestions={suggestions}
        onPick={(query) => { setQ(""); askInternal(query, true); }}
      />
    </Card>
  );
};

export default QAChat;
