import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, StopCircle, RotateCcw, Trash2, Menu, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { callFunction } from "@/lib/functionsClient";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import LatexModal from "./chat/LatexModal";
import TutorSidebar from "./chat/TutorSidebar";
import WelcomeMessage from "./chat/WelcomeMessage";
import SelectionPopup from "./chat/SelectionPopup";

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

  // Extract meaningful questions from summary as suggestions
  const suggestions = useMemo(() => {
    if (!summary.trim()) {
      return rtl
        ? [{ title: "اشرح مفهوم النظرية النسبية", query: "اشرح مفهوم النظرية النسبية لأينشتاين" }]
        : [{ title: "Explain relativity", query: "Explain Einstein's theory of relativity" }];
    }

    // First try to extract actual questions from summary
    const questionRegex = /([^.!]*\?)/g;
    const arabicQuestionRegex = /([^.!]*؟)/g;
    
    const regex = rtl ? arabicQuestionRegex : questionRegex;
    const matches = summary.match(regex);
    
    let extractedQuestions: Array<{ title: string; query: string }> = [];
    
    if (matches && matches.length > 0) {
      extractedQuestions = matches
        .map(question => question.trim())
        .filter(question => question.length > 10 && question.length < 150) // Filter meaningful questions
        .slice(0, 3) // Limit extracted questions
        .map(question => ({
          title: question.length > 50 ? question.substring(0, 47) + '...' : question,
          query: question
        }));
    }
    
    // Generate intelligent suggestions based on content
    const contentBasedSuggestions = rtl
      ? [
          { title: "اشرح المفاهيم الأساسية", query: "اشرح المفاهيم الأساسية الواردة في هذا النص" },
          { title: "أعط أمثلة تطبيقية", query: "أعط أمثلة تطبيقية على المعلومات المذكورة" },
          { title: "ما هي النقاط المهمة؟", query: "ما هي أهم النقاط التي يجب أن أركز عليها في هذا المحتوى؟" },
          { title: "كيف يمكنني التطبيق؟", query: "كيف يمكنني تطبيق هذه المعلومات في الواقع؟" }
        ]
      : [
          { title: "Explain the main concepts", query: "Explain the main concepts mentioned in this text" },
          { title: "Give practical examples", query: "Give practical examples of the information mentioned" },
          { title: "What are the key points?", query: "What are the most important points I should focus on in this content?" },
          { title: "How can I apply this?", query: "How can I apply this information in real life?" }
        ];
    
    // Combine extracted questions with content-based suggestions
    const combined = [...extractedQuestions, ...contentBasedSuggestions];
    
    // Return up to 6 suggestions, prioritizing extracted questions
    return combined.slice(0, 6);
  }, [summary, rtl]);

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
      // Get authentication session for streaming
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) {
        throw new Error('Authentication required for chat');
      }
      
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
          
          // EventSource doesn't support custom headers, so we need to use the authenticated stream function
          const streamResponse = streamAuthenticatedFunction("qa-stream", {
            question: trimmed,
            summary,
            lang,
            page,
            title
          });
          
          streamResponse.then(async (stream) => {
            const reader = stream.getReader();
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
            resolve();
          }).catch(reject);
        });
      } else {
        // Use authenticated stream function for large payloads
        const stream = await streamAuthenticatedFunction("qa-stream", {
          question: trimmed,
          summary,
          lang,
          page,
          title
        });

        const reader = stream.getReader();
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
        const data = await callAuthenticatedFunction<{ answer?: string }>("qa", { question: trimmed, summary, lang, page, title });
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
            <h1 className="text-xl font-semibold">{rtl ? "إدرس" : "Study"}</h1>
          </div>
        </header>

        {/* Chat Content */}
        <div className="flex-1 min-h-0 h-full p-6 pb-0 overflow-y-auto" ref={containerRef}>
          <div className="w-full max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <WelcomeMessage rtl={rtl} />
            ) : (
              <MessageList
                messages={messages}
                loading={loading}
                rtl={rtl}
                streamRef={streamRef}
                onRegenerate={regenerateLast}
                onEditUser={editUserAndRegenerate}
              />
            )}
          </div>
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
            </div>
            
            <div className="text-center text-xs text-muted-foreground mt-3">
              {rtl ? "قد يخطئ إدرس، لذا يرجى التحقق من المعلومات." : "AI may make mistakes—please verify."}
            </div>
            
            {!summary.trim() && (
              <div className="text-center text-xs text-muted-foreground mt-2">
                {rtl ? "يمكنك طرح أي سؤال، أو إنشاء ملخص للصفحة أولاً للحصول على إجابات أكثر دقة" : "You can ask any question, or generate a page summary first for more accurate answers."}
              </div>
            )}
          </div>
        </div>
        
        {/* Selection Ask Popup */}
        <SelectionPopup
          isOpen={askOpen}
          position={askPos}
          selectedText={selectionText}
          onSubmit={(prompt) => askInternal(prompt, true)}
          onClose={() => setAskOpen(false)}
          rtl={rtl}
        />

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
