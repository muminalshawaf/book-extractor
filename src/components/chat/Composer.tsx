import React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, StopCircle, Wrench, Upload, BookOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  loading: boolean;
  rtl?: boolean;
  onOpenLatex?: () => void;
}

const Composer: React.FC<ComposerProps> = ({ value, onChange, onSend, onStop, disabled, loading, rtl = false, onOpenLatex }) => {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  };

  return (
    <div className={cn("flex items-center gap-3 border rounded-full p-2 bg-background", rtl && "flex-row-reverse")}> 
      <Button onClick={onOpenLatex} variant="ghost" size="icon" className="rounded-full" aria-label={rtl ? "أدوات" : "Tools"}>
        <BookOpen className="h-4 w-4" />
      </Button>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={rtl ? "أدخل طلبك هنا" : "Enter your request here"}
        aria-label={rtl ? "سؤال" : "Question"}
        disabled={loading}
        className="flex-1 border-0 bg-transparent resize-none min-h-[40px] p-2 focus-visible:ring-0"
      />
      {loading ? (
        <Button onClick={onStop} variant="ghost" size="icon" className="rounded-full" aria-label={rtl ? "إيقاف" : "Stop"}>
          <StopCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button onClick={onSend} disabled={disabled} size="icon" className="rounded-full" aria-label={rtl ? "إرسال" : "Send"}>
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default Composer;
