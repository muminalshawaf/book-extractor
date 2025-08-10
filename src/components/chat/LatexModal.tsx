import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LatexModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (latex: string) => void;
  rtl?: boolean;
}

const categories = [
  { name: "أوامر أساسية", cmds: [
    { label: "كسر", latex: "\\frac{a}{b}", display: "\\frac{a}{b}" },
    { label: "جذر", latex: "\\sqrt{x}", display: "\\sqrt{x}" },
    { label: "جذر N", latex: "\\sqrt[n]{x}", display: "\\sqrt[n]{x}" },
  ]},
  { name: "رموز", cmds: [
    { label: "زائد/ناقص", latex: "\\pm", display: "\\pm" },
    { label: "تكامل", latex: "\\int_{a}^{b} f(x) dx", display: "\\int" },
    { label: "مجموع", latex: "\\sum_{i=1}^{n} i", display: "\\sum" },
  ]},
  { name: "كيمياء", cmds: [
    { label: "صيغة", latex: "H_2O", display: "H_2O" },
  ]},
] as const;

const renderKatex = (src: string) => {
  try {
    return { __html: katex.renderToString(src, { throwOnError: false, displayMode: true }) };
  } catch (e) {
    return { __html: `<span class='text-destructive text-xs'>${(e as Error)?.message ?? "KaTeX error"}</span>` };
  }
};

const LatexModal: React.FC<LatexModalProps> = ({ open, onOpenChange, onInsert, rtl = false }) => {
  const [value, setValue] = useState("");
  const preview = useMemo(() => renderKatex(value.trim() || String.raw`\text{معاينة Preview}`), [value]);

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-2xl", rtl && "text-right")}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{rtl ? "محرر LaTeX" : "LaTeX Editor"}</DialogTitle>
        </DialogHeader>

        <div className={cn("grid gap-4 md:grid-cols-3", rtl && "[direction:rtl]")}> 
          <div className="md:col-span-2 space-y-2">
            <Textarea rows={6} value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={rtl ? "اكتب صيغة LaTeX هنا..." : "Type LaTeX..."}
            />
            <div className="border rounded-md p-3 min-h-[96px] overflow-auto" dangerouslySetInnerHTML={preview} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">{rtl ? "أوامر شائعة" : "Cheat sheet"}</div>
            <Separator />
            <div className="space-y-3 max-h-60 overflow-auto pr-1">
              {categories.map((cat) => (
                <div key={cat.name}>
                  <div className="text-xs font-semibold mb-1">{cat.name}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {cat.cmds.map((c) => (
                      <Button key={c.label} variant="secondary" size="sm" className="justify-start"
                        onClick={() => setValue((v) => (v ? v + "\n" : "") + c.latex)}
                        title={c.label}
                      >
                        {c.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className={cn(rtl && "flex-row-reverse")}> 
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{rtl ? "إلغاء" : "Cancel"}</Button>
          <Button onClick={() => { if (value.trim()) { onInsert(value.trim()); onOpenChange(false); } }} disabled={!value.trim()}>
            {rtl ? "إدراج" : "Insert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LatexModal;
