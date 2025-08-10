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
import TutorSidebar from "./chat/TutorSidebar";

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

  // Sidebar suggestions
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
    <div className="flex h-screen bg-background" dir={rtl ? "rtl" : "ltr"}>
      {/* Sidebar */}
      <TutorSidebar 
        rtl={rtl} 
        onNewChat={() => { setMessages([]); setQ(""); }} 
        suggestions={suggestions} 
        onPick={(query) => { setQ(""); askInternal(query, true); }} 
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b bg-background">
          <div className={cn("flex items-center gap-4", rtl && "flex-row-reverse")}>
            <h1 className="text-lg font-semibold">{rtl ? "إدرس" : "Study"}</h1>
            <span className="text-sm text-muted-foreground">{rtl ? "القائمة" : "Menu"}</span>
          </div>
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Chat Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8" ref={containerRef}>
          {messages.length === 0 ? (
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-medium">{rtl ? "مرحباً" : "Hello"}</h2>
              <p className="text-muted-foreground">{rtl ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}</p>
            </div>
          ) : (
            <div className="w-full max-w-4xl">
              <MessageList
                messages={messages}
                loading={loading}
                rtl={rtl}
                streamRef={streamRef}
                onRegenerate={regenerateLast}
                onEditUser={editUserAndRegenerate}
              />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-background p-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
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
              
              {/* Settings/Tools Button */}
              <div className={cn("flex items-center gap-2 mt-2", rtl && "flex-row-reverse")}>
                <Button variant="ghost" size="sm" onClick={() => setLatexOpen(true)}>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {rtl ? "أدوات" : "Tools"}
                </Button>
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground mt-3">
              {rtl ? "قد يخطئ إدرس، لذا يرجى التحقق من المعلومات." : "AI may make mistakes—please verify."}
            </div>
          </div>
        </div>
        
        {/* Selection Ask Popup */}
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

        {/* Hidden control buttons for functionality */}
        <div className="hidden">
          <Button onClick={clearChat} disabled={messages.length === 0 || loading} />
          <Button onClick={regenerateLast} disabled={messages.filter(m=>m.role==="user").length===0 || loading} />
          {loading && <Button onClick={stopStreaming} />}
        </div>

        <LatexModal
          open={latexOpen}
          onOpenChange={setLatexOpen}
          onInsert={handleInsertLatex}
          rtl={rtl}
        />
      </div>
    </div>
  );
};

export default QAChat;
