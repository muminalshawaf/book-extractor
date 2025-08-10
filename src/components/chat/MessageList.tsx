import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import MathRenderer from "@/components/MathRenderer";
import { Copy, Check, RotateCcw, Share2, ThumbsUp, ThumbsDown, MessageSquareText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type ChatMsg = { role: "user" | "assistant"; content: string };

interface MessageListProps {
  messages: ChatMsg[];
  loading: boolean;
  rtl?: boolean;
  streamRef: React.MutableRefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  onEditUser: (index: number, newText: string) => void;
  sidebarSlot?: React.ReactNode;
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

const MessageList: React.FC<MessageListProps> = ({ messages, loading, rtl = false, streamRef, onRegenerate, onEditUser, sidebarSlot }) => {
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
  const lastUserIndex = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx--) {
      if (messages[idx].role === 'user') return idx;
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
        "relative rounded-2xl p-4 h-80 md:h-96 overflow-y-auto bg-background/60 backdrop-blur shadow-sm",
        messages.length === 0 && "flex items-center justify-center text-sm text-muted-foreground",
        rtl && "text-right"
      )}
      >
        {sidebarSlot}
        {messages.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <MessageSquareText className="h-10 w-10 text-muted-foreground" />
          <div className="text-xl font-semibold text-primary">{rtl ? "مرحباً!" : "Welcome!"}</div>
          <div className="text-muted-foreground">{rtl ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m, i) => {
            const isAssistant = m.role === "assistant";
            const isStreaming = loading && i === lastIndex && isAssistant;
            return (
              <div key={i} className={cn("flex flex-col", "items-start")}>
                <div className={cn(
                  isAssistant
                    ? "max-w-[85%] w-full animate-fade-in"
                    : "max-w-md rounded-2xl p-4 text-[13px] border border-border bg-muted/60 shadow-sm animate-fade-in"
                )}>
                  {isAssistant ? (
                    isStreaming ? (
                      <div className="relative min-h-[1.25rem]">
                        <div ref={streamRef} className="whitespace-pre-wrap text-[13px] leading-relaxed" />
                        {(!m.content || m.content.length === 0) && (
                          <div className="absolute inset-0 flex items-center">
                            <TypingDots rtl={rtl} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <MathRenderer content={m.content} className="text-[13px] leading-relaxed" />
                    )
                  ) : (
                    <div className="whitespace-pre-wrap text-foreground">{m.content}</div>
                  )}

                </div>
                <div className={cn("mt-2 flex items-center gap-1 text-xs text-muted-foreground", isAssistant ? "self-start" : "self-end")}>
                  {isAssistant ? (
                    <div className="flex items-center gap-1 justify-end w-full">
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
                        <DropdownMenuContent align={rtl ? "end" : "start"} className="z-50 bg-background">
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
                      <></>
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
