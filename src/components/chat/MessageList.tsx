import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import MathRenderer from "@/components/MathRenderer";
import { Copy, Check, RotateCcw, Share2, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type ChatMsg = { role: "user" | "assistant"; content: string };

interface MessageListProps {
  messages: ChatMsg[];
  loading: boolean;
  rtl?: boolean;
  streamRef: React.MutableRefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  onEditUser: (index: number, newText: string) => void;
}

function TypingDots({ rtl = false }: { rtl?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 text-muted-foreground", rtl && "flex-row-reverse")}
      aria-label={rtl ? "يكتب..." : "typing..."}
    >
      <span className="w-2 h-2 rounded-full bg-muted-foreground/70 pulse" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/70 pulse" style={{ animationDelay: "150ms" }} />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/70 pulse" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

const MessageList: React.FC<MessageListProps> = ({ messages, loading, rtl = false, streamRef, onRegenerate, onEditUser }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [reactions, setReactions] = useState<Record<number, 'up' | 'down' | null>>({});

  const lastIndex = useMemo(() => messages.length - 1, [messages.length]);
  const lastAssistantIndex = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx--) {
      if (messages[idx].role === 'assistant') return idx;
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (atBottom) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 24; // px
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setAtBottom(nearBottom);
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      toast({ description: rtl ? "تم النسخ" : "Copied" });
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {}
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn(
        "border rounded-2xl p-4 h-80 md:h-96 overflow-y-auto bg-background/60 backdrop-blur shadow-sm",
        messages.length === 0 && "flex items-center justify-center text-sm text-muted-foreground",
        rtl && "text-right"
      )}
    >
      {messages.length === 0 ? (
        <div>{rtl ? "اكتب سؤالك وسيتم الإجابة اعتماداً على ملخص هذه الصفحة" : "Ask a question. The AI will answer using this page's summary."}</div>
      ) : (
        <div className="space-y-3">
          {messages.map((m, i) => {
            const isAssistant = m.role === "assistant";
            const isStreaming = loading && i === lastIndex && isAssistant;
            return (
              <div key={i} className={cn("flex", isAssistant ? (rtl ? "justify-start" : "justify-start") : (rtl ? "justify-start" : "justify-end"))}>
                <div className={cn(
                  "relative group/message max-w-[85%] rounded-2xl px-4 py-3 text-sm border shadow-sm animate-fade-in",
                  isAssistant ? "bg-muted/60 border-border" : "bg-primary/15 border-primary/20"
                )}>
                  {isAssistant ? (
                    isStreaming ? (
                    <div className="relative min-h-[1.25rem]">
                      <div ref={streamRef} className="whitespace-pre-wrap text-sm" />
                      {(!m.content || m.content.length === 0) && (
                        <div className="absolute inset-0 flex items-center">
                          <TypingDots rtl={rtl} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <MathRenderer content={m.content} className="text-sm" />
                  )
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}

                </div>
                <div className={cn("mt-1 flex items-center gap-1 text-xs text-muted-foreground transition-opacity", rtl && "flex-row-reverse justify-start")}>
                  {isAssistant ? (
                    <div className="flex items-center gap-1">
                      {i === lastAssistantIndex && (
                        <Button variant="ghost" size="sm" disabled={loading} onClick={() => onRegenerate()} aria-label={rtl ? "إعادة توليد" : "Regenerate"}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(isStreaming ? (streamRef.current?.textContent ?? "") : m.content, i)} aria-label={rtl ? "نسخ" : "Copy"}>
                        {copiedIndex === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={rtl ? "مشاركة" : "Share"}>
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={rtl ? "end" : "start"}>
                          <DropdownMenuItem onClick={() => {
                            const text = isStreaming ? (streamRef.current?.textContent ?? "") : m.content;
                            const t = encodeURIComponent(text);
                            window.open(`https://wa.me/?text=${t}`, "_blank", "noopener,noreferrer");
                          }}>{rtl ? "واتساب" : "WhatsApp"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            const text = isStreaming ? (streamRef.current?.textContent ?? "") : m.content;
                            const t = encodeURIComponent(text);
                            const url = encodeURIComponent(window.location.href);
                            window.open(`https://t.me/share/url?url=${url}&text=${t}`, "_blank", "noopener,noreferrer");
                          }}>{rtl ? "تليجرام" : "Telegram"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            const text = isStreaming ? (streamRef.current?.textContent ?? "") : m.content;
                            const t = encodeURIComponent(text);
                            window.open(`https://twitter.com/intent/tweet?text=${t}`, "_blank", "noopener,noreferrer");
                          }}>{rtl ? "إكس" : "X"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            const text = isStreaming ? (streamRef.current?.textContent ?? "") : m.content;
                            const t = encodeURIComponent(text);
                            const url = encodeURIComponent(window.location.href);
                            window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${t}`, "_blank", "noopener,noreferrer");
                          }}>{rtl ? "فيسبوك" : "Facebook"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            const text = isStreaming ? (streamRef.current?.textContent ?? "") : m.content;
                            const t = encodeURIComponent(text);
                            window.open(`sms:?&body=${t}`, "_blank", "noopener,noreferrer");
                          }}>{rtl ? "رسالة نصية" : "SMS"}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="ghost" size="sm" onClick={() => setReactions((r) => ({ ...r, [i]: r[i] === 'up' ? null : 'up' }))} aria-pressed={reactions[i] === 'up'} aria-label={rtl ? "إعجاب" : "Like"}>
                        <ThumbsUp className={cn("h-3.5 w-3.5", reactions[i] === 'up' && "text-primary")} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setReactions((r) => ({ ...r, [i]: r[i] === 'down' ? null : 'down' }))} aria-pressed={reactions[i] === 'down'} aria-label={rtl ? "عدم الإعجاب" : "Dislike"}>
                        <ThumbsDown className={cn("h-3.5 w-3.5", reactions[i] === 'down' && "text-primary")} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      {editingIndex === i ? (
                        <>
                          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="mt-2 w-full" />
                          <Button size="sm" onClick={() => { onEditUser(i, draft.trim()); setEditingIndex(null); }} disabled={draft.trim().length === 0}>
                            {rtl ? "تحديث وإعادة التوليد" : "Update & Regenerate"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)}>
                            {rtl ? "إلغاء" : "Cancel"}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setEditingIndex(i); setDraft(m.content); }} aria-label={rtl ? "تعديل السؤال" : "Edit question"}>
                          {rtl ? "تعديل السؤال" : "Edit question"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!atBottom && (
            <div className="sticky bottom-0 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full shadow-sm hover-scale"
                onClick={() => {
                  setAtBottom(true);
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                }}
              >
                {rtl ? "الانتقال إلى الأحدث" : "Jump to latest"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageList;
