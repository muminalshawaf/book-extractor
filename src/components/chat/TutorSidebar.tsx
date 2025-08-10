import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Menu } from "lucide-react";

interface TutorSidebarProps {
  rtl?: boolean;
  suggestions: { title: string; query: string }[];
  onNewChat: () => void;
  onPick: (query: string) => void;
}

const TutorSidebar: React.FC<TutorSidebarProps> = ({ rtl = false, suggestions, onNewChat, onPick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const shouldShow = isExpanded || isHovered;

  return (
    <div 
      className={cn(
        "bg-gray-100 dark:bg-gray-800 transition-all duration-300 ease-in-out flex flex-col border-l border-border",
        shouldShow ? "w-64" : "w-16",
        rtl && "border-r border-l-0"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={rtl ? "القائمة" : "Menu"}
    >
      {/* Header with burger menu */}
      <div className="p-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-6 w-6" />
        </Button>
        {shouldShow && (
          <span className="text-lg font-semibold text-foreground">
            {rtl ? "القائمة" : "Menu"}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-grow overflow-y-auto">
        {/* New Chat Button */}
        <div className="p-2 px-4">
          <Button
            onClick={() => {
              onNewChat();
              if (!isExpanded) {
                setIsHovered(false);
              }
            }}
            variant="ghost"
            className={cn(
              "w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md",
              !shouldShow && "justify-center px-0"
            )}
          >
            <Plus className="h-6 w-6 flex-shrink-0" />
            {shouldShow && (
              <span className={cn("text-sm", rtl && "mr-2")}>
                {rtl ? "محادثة جديدة" : "New Chat"}
              </span>
            )}
          </Button>
        </div>

        {/* Suggestions Section */}
        {shouldShow && (
          <div className="p-4 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {rtl ? "مقترحات" : "Suggestions"}
            </h2>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-right h-auto p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md"
                    onClick={() => {
                      onPick(suggestion.query);
                      if (!isExpanded) {
                        setIsHovered(false);
                      }
                    }}
                  >
                    <span className="truncate text-right w-full">
                      {suggestion.title}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  );
};

export default TutorSidebar;
