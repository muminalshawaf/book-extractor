import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Edit } from "lucide-react";

interface SelectionPopupProps {
  isOpen: boolean;
  position: { top: number; left: number };
  selectedText: string;
  onSubmit: (question: string) => void;
  onClose: () => void;
  rtl?: boolean;
}

const SelectionPopup: React.FC<SelectionPopupProps> = ({
  isOpen,
  position,
  selectedText,
  onSubmit,
  onClose,
  rtl = false
}) => {
  const [question, setQuestion] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && selectedText) {
      const combinedPrompt = rtl
        ? `بالإشارة إلى النص التالي:\n"${selectedText}"\n\nالرجاء الإجابة على هذا السؤال:\n${question}`
        : `Regarding the following text:\n"${selectedText}"\n\nPlease answer this question:\n${question}`;
      
      onSubmit(combinedPrompt);
      setQuestion("");
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "fixed z-50 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2 min-w-[250px]",
        rtl && "flex-row-reverse"
      )}
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)"
      }}
    >
      <Edit className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={rtl ? "أدخل سؤالك" : "Enter your question"}
        className="flex-1 border-0 bg-transparent focus-visible:ring-0 p-0"
        autoFocus
      />
      <Button 
        type="submit" 
        size="sm" 
        className="rounded-full p-2 h-8 w-8"
        disabled={!question.trim()}
      >
        <Send className="h-3 w-3" />
      </Button>
    </form>
  );
};

export default SelectionPopup;