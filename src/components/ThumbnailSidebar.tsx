import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronRight, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookPage } from "@/data/enhancedBooks";

interface ThumbnailSidebarProps {
  pages: BookPage[];
  currentIndex: number;
  onPageSelect: (index: number) => void;
  isOpen: boolean;
  onToggle: () => void;
  rtl?: boolean;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  pages,
  currentIndex,
  onPageSelect,
  isOpen,
  onToggle,
  rtl = false,
}) => {
  return (
    <Card className={cn("shadow-sm", rtl && "ml-4", !rtl && "mr-4")}>
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                <CardTitle className="text-sm">
                  {rtl ? "المصغرات" : "Thumbnails"}
                </CardTitle>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {isOpen ? (
                  rtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  rtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-2 gap-3">
                {pages.map((page, index) => (
                  <button
                    key={index}
                    onClick={() => onPageSelect(index)}
                    className={cn(
                      "relative group border-2 rounded-lg overflow-hidden transition-all duration-200",
                      "hover:border-primary hover:shadow-md",
                      currentIndex === index
                        ? "border-primary ring-2 ring-primary/20 shadow-lg"
                        : "border-border"
                    )}
                  >
                    <div className="aspect-[3/4] w-full">
                      <img
                        src={page.src}
                        alt={page.alt}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className={cn(
                      "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2",
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      currentIndex === index && "opacity-100"
                    )}>
                      <span className="text-white text-xs font-medium">
                        {rtl ? `صفحة ${index + 1}` : `Page ${index + 1}`}
                      </span>
                    </div>
                    {currentIndex === index && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <div className="w-3 h-3 bg-primary rounded-full" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};