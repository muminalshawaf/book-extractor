import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import MathRenderer from "@/components/MathRenderer";
import { Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type ChatMsg = { role: "user" | "assistant"; content: string };

interface MessageListProps {
  messages: ChatMsg[];
  loading: boolean;
  rtl?: boolean;
  streamRef: React.MutableRefObject<HTMLDivElement | null>;
}

const MessageList: React.FC<MessageListProps> = ({ messages, loading, rtl = false, streamRef }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const lastIndex = useMemo(() => messages.length - 1, [messages.length]);

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
        "border rounded-md p-3 h-64 md:h-72 overflow-y-auto bg-muted/30",
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
                  "relative max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  isAssistant ? "bg-muted/50" : "bg-primary/10"
                )}>
                  {isAssistant ? (
                    isStreaming ? (
                      <div ref={streamRef} className="whitespace-pre-wrap text-sm" />
                    ) : (
                      <MathRenderer content={m.content} className="text-sm" />
                    )
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}

                  {/* Copy button */}
                  {m.content && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute -top-2 -right-2 h-7 w-7"
                      onClick={() => handleCopy(isStreaming ? (streamRef.current?.textContent ?? "") : m.content, i)}
                      aria-label={rtl ? "نسخ" : "Copy"}
                    >
                      {copiedIndex === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
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
