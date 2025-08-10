import React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, StopCircle } from "lucide-react";

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  loading: boolean;
  rtl?: boolean;
}

const Composer: React.FC<ComposerProps> = ({ value, onChange, onSend, onStop, disabled, loading, rtl = false }) => {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  };

  return (
    <div className={cn("flex items-end gap-2", rtl && "flex-row-reverse")}> 
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder={rtl ? "اكتب سؤالك هنا... (Shift+Enter لسطر جديد)" : "Type your question... (Shift+Enter for newline)"}
        aria-label={rtl ? "سؤال" : "Question"}
        disabled={loading}
        className="max-h-40"
      />
      {loading ? (
        <Button onClick={onStop} variant="outline" aria-label={rtl ? "إيقاف" : "Stop"}>
          <StopCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button onClick={onSend} disabled={disabled} aria-label={rtl ? "إرسال" : "Send"}>
          <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" />{rtl ? "إرسال" : "Send"}</span>
        </Button>
      )}
    </div>
  );
};

export default Composer;
