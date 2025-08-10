import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rtl?: boolean;
  onNewChat: () => void;
  suggestions: { title: string; query: string }[];
  onPick: (query: string) => void;
}

const TutorDrawer: React.FC<TutorDrawerProps> = ({ open, onOpenChange, rtl = false, onNewChat, suggestions, onPick }) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-64 sm:w-80", rtl && "text-right")}> 
        <SheetHeader>
          <SheetTitle>{rtl ? "القائمة" : "Menu"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Button variant="ghost" className={cn("w-full justify-start gap-2", rtl && "flex-row-reverse justify-between")}
            onClick={() => { onNewChat(); onOpenChange(false); }}
          >
            <PencilLine className="h-4 w-4" />
            <span>{rtl ? "محادثة جديدة" : "New chat"}</span>
          </Button>

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">{rtl ? "مقترحات" : "Suggestions"}</div>
            <Separator />
            <ul className="mt-2 space-y-1">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <Button variant="ghost" className={cn("w-full justify-start", rtl && "flex-row-reverse justify-between")}
                    onClick={() => { onPick(s.query); onOpenChange(false); }}
                    title={s.title}
                  >
                    {s.title}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TutorDrawer;
