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
  within?: boolean; // render inside a container div
}

const TutorSidebar: React.FC<TutorSidebarProps> = ({ rtl = false, suggestions, onNewChat, onPick, within = false }) => {
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isExpanded = pinned || expanded;

  const sideCls = useMemo(() => (rtl ? "right-2" : "left-2"), [rtl]);
  const posCls = within ? "absolute z-20 top-2 bottom-2" : "fixed z-40 top-20 bottom-6";

  const asideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!within) return;
    const el = asideRef.current;
    const container = el?.parentElement as HTMLElement | null;
    if (!container) return;
    let lastTop = container.scrollTop;
    const onScroll = () => {
      if (pinned) return;
      const cur = container.scrollTop;
      const down = cur > lastTop + 2;
      const up = cur < lastTop - 2;
      if (down) setExpanded(true);
      else if (up && cur <= 8) setExpanded(false);
      lastTop = cur;
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [pinned, within]);

  const onEnter = useCallback(() => { if (!pinned) setExpanded(true); }, [pinned]);
  const onLeave = useCallback(() => { if (!pinned) setExpanded(false); }, [pinned]);

  return (
    <aside
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        posCls,
        sideCls,
        "transition-[width] duration-300 overflow-hidden",
        isExpanded ? "w-64" : "w-16",
        "bg-background/80 backdrop-blur border rounded-2xl shadow-sm flex flex-col"
      )}
      aria-label={rtl ? "القائمة" : "Menu"}
    >
      <div className={cn("flex items-center gap-2 p-3", rtl && "flex-row-reverse")}> 
        <Button variant="ghost" size="icon" onClick={() => setPinned((v) => !v)} aria-pressed={pinned} aria-label={rtl ? "تثبيت/إلغاء التثبيت" : "Pin/unpin"}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className={cn("text-sm font-semibold", !isExpanded && "opacity-0 pointer-events-none")}>{rtl ? "القائمة" : "Menu"}</div>
      </div>

      <Separator className={cn(!isExpanded && "opacity-0")} />

      <div className={cn("p-2 space-y-2", !isExpanded && "opacity-0 pointer-events-none")}>
        <Button variant="secondary" className={cn("w-full justify-start", rtl && "flex-row-reverse justify-between")} onClick={onNewChat}>
          {rtl ? "محادثة جديدة" : "New chat"}
        </Button>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">{rtl ? "مقترحات" : "Suggestions"}</div>
          <ul className="space-y-1">
            {suggestions.map((s, idx) => (
              <li key={idx}>
                <Button variant="ghost" className={cn("w-full justify-start", rtl && "flex-row-reverse justify-between")} onClick={() => onPick(s.query)}>
                  {s.title}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};

export default TutorSidebar;
