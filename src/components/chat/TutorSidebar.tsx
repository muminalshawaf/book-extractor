import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Menu } from "lucide-react";

interface TutorSidebarProps {
  rtl?: boolean;
  suggestions: { title: string; query: string }[];
  onNewChat: () => void;
  onPick: (query: string) => void;
}

const TutorSidebar: React.FC<TutorSidebarProps> = ({ rtl = false, suggestions, onNewChat, onPick }) => {
  return (
    <aside
      className={cn(
        "w-80 border-r bg-background/50 backdrop-blur-sm flex flex-col",
        rtl && "border-l border-r-0"
      )}
      aria-label={rtl ? "القائمة" : "Menu"}
    >
      {/* Header */}
      <div className={cn("flex items-center gap-3 p-4 border-b", rtl && "flex-row-reverse")}>
        <Button variant="ghost" size="sm" onClick={onNewChat} className="text-sm">
          {rtl ? "محادثة جديدة" : "New Chat"}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        <div>
          <h3 className={cn("text-sm font-medium mb-3", rtl && "text-right")}>{rtl ? "مقترحات" : "Suggestions"}</h3>
          <div className="space-y-2">
            {suggestions.map((s, idx) => (
              <Button 
                key={idx}
                variant="ghost" 
                className={cn(
                  "w-full justify-start p-3 h-auto text-wrap text-left",
                  rtl && "text-right justify-end"
                )} 
                onClick={() => onPick(s.query)}
              >
                {s.title}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default TutorSidebar;
