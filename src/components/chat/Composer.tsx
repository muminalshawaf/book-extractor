import React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, StopCircle, Wrench, Upload } from "lucide-react";
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
    <div className={cn("flex items-end gap-3 border rounded-3xl p-3 bg-background/80 backdrop-blur shadow-sm", rtl && "flex-row-reverse")}> 
      <Button type="button" variant="secondary" size="icon" className="h-9 w-9 rounded-full" aria-label={rtl ? "رفع" : "Upload"}>
        <Upload className="h-4 w-4" />
      </Button>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder={rtl ? "أدخل طلبًا هنا" : "Enter your prompt here"}
        aria-label={rtl ? "سؤال" : "Question"}
        disabled={loading}
        className="max-h-36 rounded-2xl border bg-background/60 backdrop-blur shadow-sm"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label={rtl ? "أدوات" : "Tools"}>
            <Wrench className="h-4 w-4" />
            <span className="sr-only">{rtl ? "أدوات" : "Tools"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={rtl ? "end" : "start"} className="z-50 bg-background shadow-lg">
          <DropdownMenuItem onClick={() => onOpenLatex?.()}>{rtl ? "أداة LaTeX" : "LaTeX Tool"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
