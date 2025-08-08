import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Keyboard, X } from "lucide-react";

interface KeyboardShortcutsProps {
  rtl?: boolean;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ rtl = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const shortcuts = [
    {
      key: rtl ? "← / →" : "← / →",
      action: rtl ? "التنقل بين الصفحات" : "Navigate pages",
    },
    {
      key: rtl ? "مسافة / Enter" : "Space / Enter",
      action: rtl ? "الصفحة التالية" : "Next page",
    },
    {
      key: "Backspace",
      action: rtl ? "الصفحة السابقة" : "Previous page",
    },
    {
      key: "+ / -",
      action: rtl ? "تكبير / تصغير" : "Zoom in / out",
    },
    {
      key: "F",
      action: rtl ? "ملء الشاشة" : "Fullscreen",
    },
    {
      key: "T",
      action: rtl ? "عرض المصغرات" : "Toggle thumbnails",
    },
    {
      key: "S",
      action: rtl ? "إنشاء ملخص" : "Generate summary",
    },
    {
      key: "?",
      action: rtl ? "عرض الاختصارات" : "Show shortcuts",
    },
    {
      key: "Esc",
      action: rtl ? "إغلاق النوافذ" : "Close dialogs",
    },
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        title={rtl ? "اختصارات لوحة المفاتيح (?)" : "Keyboard shortcuts (?)"}
        className="hover:bg-accent"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle dir={rtl ? "rtl" : "ltr"}>
                {rtl ? "اختصارات لوحة المفاتيح" : "Keyboard Shortcuts"}
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3" dir={rtl ? "rtl" : "ltr"}>
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm">{shortcut.action}</span>
                    <kbd className="px-2 py-1 text-xs bg-muted rounded font-mono">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </>
  );
};