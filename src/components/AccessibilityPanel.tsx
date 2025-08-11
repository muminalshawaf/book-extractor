import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { 
  Accessibility, 
  Eye, 
  Volume2, 
  VolumeX, 
  Type, 
  Contrast,
  Focus,
  MousePointer
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AccessibilityPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  rtl?: boolean;
}

export const AccessibilityPanel: React.FC<AccessibilityPanelProps> = ({
  isOpen,
  onToggle,
  rtl = false,
}) => {
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState([100]);
  const [focusVisible, setFocusVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [speechRate, setSpeechRate] = useState([1]);
  const [dataSaver, setDataSaver] = useState(false);

  // Apply accessibility settings
  useEffect(() => {
    const root = document.documentElement;
    
    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    root.style.fontSize = `${fontSize[0]}%`;

    if (focusVisible) {
      root.classList.add('force-focus-visible');
    } else {
      root.classList.remove('force-focus-visible');
    }

    if (reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [highContrast, fontSize, focusVisible, reduceMotion]);

  // Data Saver (Low Data Mode)
  useEffect(() => {
    const saved = localStorage.getItem('data-saver') === 'true';
    setDataSaver(saved);
    const root = document.documentElement;
    if (saved) root.classList.add('data-saver');
    else root.classList.remove('data-saver');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dataSaver) {
      root.classList.add('data-saver');
      localStorage.setItem('data-saver', 'true');
    } else {
      root.classList.remove('data-saver');
      localStorage.removeItem('data-saver');
    }
  }, [dataSaver]);

  // Text-to-speech functionality
  const speakText = (text: string) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate[0];
    utterance.lang = rtl ? 'ar-SA' : 'en-US';
    
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Add click listeners for text-to-speech
  useEffect(() => {
    if (!speechEnabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const textContent = target.textContent?.trim();
      
      if (textContent && (
        target.matches('p, h1, h2, h3, h4, h5, h6, li, .summary-content') ||
        target.closest('.summary-content')
      )) {
        speakText(textContent);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [speechEnabled, speechRate, rtl]);

  if (!isOpen) {
    return null;
  }

  return (
    <Card className="w-80 shadow-lg border">
      <CardHeader className="pb-3">
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <CardTitle className={cn("text-sm flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Accessibility className="h-4 w-4" />
            {rtl ? "إعدادات إمكانية الوصول" : "Accessibility Settings"}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={rtl ? "إغلاق لوحة إعدادات إمكانية الوصول" : "Close accessibility settings"}
          >
            ×
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visual Settings */}
        <div>
          <h4 className={cn("text-sm font-medium mb-3 flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Eye className="h-3 w-3" />
            {rtl ? "الإعدادات البصرية" : "Visual Settings"}
          </h4>

          <div className="space-y-3">
            {/* High Contrast */}
            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                <Contrast className="h-3 w-3" />
                <span className="text-sm">{rtl ? "تباين عالي" : "High Contrast"}</span>
              </div>
              <Switch
                checked={highContrast}
                onCheckedChange={setHighContrast}
                aria-label={rtl ? "تشغيل/إيقاف التباين العالي" : "Toggle high contrast mode"}
              />
            </div>

            {/* Font Size */}
            <div>
              <div className={cn("flex items-center gap-2 mb-2", rtl && "flex-row-reverse")}>
                <Type className="h-3 w-3" />
                <span className="text-sm">{rtl ? "حجم الخط" : "Font Size"}</span>
                <span className="text-xs text-muted-foreground">({fontSize[0]}%)</span>
              </div>
              <Slider
                value={fontSize}
                onValueChange={setFontSize}
                min={75}
                max={150}
                step={25}
                className="w-full"
                aria-label={rtl ? "تغيير حجم الخط" : "Adjust font size"}
              />
            </div>

            {/* Focus Indicators */}
            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
                <Focus className="h-3 w-3" />
                <span className="text-sm">{rtl ? "مؤشرات التركيز" : "Focus Indicators"}</span>
              </div>
              <Switch
                checked={focusVisible}
                onCheckedChange={setFocusVisible}
                aria-label={rtl ? "تشغيل/إيقاف مؤشرات التركيز" : "Toggle focus indicators"}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Motion Settings */}
        <div>
          <h4 className={cn("text-sm font-medium mb-3 flex items-center gap-2", rtl && "flex-row-reverse")}>
            <MousePointer className="h-3 w-3" />
            {rtl ? "إعدادات الحركة" : "Motion Settings"}
          </h4>

          <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
            <span className="text-sm">{rtl ? "تقليل الحركة" : "Reduce Motion"}</span>
            <Switch
              checked={reduceMotion}
              onCheckedChange={setReduceMotion}
              aria-label={rtl ? "تشغيل/إيقاف تقليل الحركة" : "Toggle reduced motion"}
            />
          </div>

          <div className={cn("mt-3 flex items-center justify-between", rtl && "flex-row-reverse")}>
            <span className="text-sm">{rtl ? "توفير البيانات" : "Data Saver"}</span>
            <Switch
              checked={dataSaver}
              onCheckedChange={setDataSaver}
              aria-label={rtl ? "تشغيل/إيقاف وضع توفير البيانات" : "Toggle data saver mode"}
            />
          </div>
        </div>

        <Separator />

        {/* Audio Settings */}
        <div>
          <h4 className={cn("text-sm font-medium mb-3 flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Volume2 className="h-3 w-3" />
            {rtl ? "الإعدادات الصوتية" : "Audio Settings"}
          </h4>

          <div className="space-y-3">
            {/* Text-to-Speech */}
            <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
              <span className="text-sm">{rtl ? "قراءة النص" : "Text-to-Speech"}</span>
              <Switch
                checked={speechEnabled}
                onCheckedChange={setSpeechEnabled}
                aria-label={rtl ? "تشغيل/إيقاف قراءة النص" : "Toggle text-to-speech"}
              />
            </div>

            {/* Speech Rate */}
            {speechEnabled && (
              <div>
                <div className={cn("flex items-center gap-2 mb-2", rtl && "flex-row-reverse")}>
                  <span className="text-sm">{rtl ? "سرعة القراءة" : "Speech Rate"}</span>
                  <span className="text-xs text-muted-foreground">({speechRate[0]}x)</span>
                </div>
                <Slider
                  value={speechRate}
                  onValueChange={setSpeechRate}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="w-full"
                  aria-label={rtl ? "تغيير سرعة القراءة" : "Adjust speech rate"}
                />
              </div>
            )}

            {/* Speech Controls */}
            {speechEnabled && (
              <div className={cn("flex gap-2", rtl && "flex-row-reverse")}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopSpeech}
                  className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}
                >
                  <VolumeX className="h-3 w-3" />
                  {rtl ? "إيقاف" : "Stop"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {speechEnabled && (
          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
            {rtl 
              ? "انقر على أي نص لقراءته بصوت عالٍ"
              : "Click on any text to have it read aloud"
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
};