import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PerformanceMetrics {
  memoryUsage: number;
  loadTime: number;
  renderTime: number;
  networkSpeed: string;
  cacheSize: number;
  activeWorkers: number;
}

interface PerformanceMonitorProps {
  isOpen: boolean;
  onToggle: () => void;
  rtl?: boolean;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isOpen,
  onToggle,
  rtl = false,
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    memoryUsage: 0,
    loadTime: 0,
    renderTime: 0,
    networkSpeed: "Unknown",
    cacheSize: 0,
    activeWorkers: 0,
  });

  const [isOptimizing, setIsOptimizing] = useState(false);

  const calculateMetrics = useCallback(() => {
    const performance = window.performance;
    const memory = (performance as any).memory;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    setMetrics({
      memoryUsage: memory ? Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) : 0,
      loadTime: navigation ? Math.round(navigation.loadEventEnd - navigation.loadEventStart) : 0,
      renderTime: navigation ? Math.round(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart) : 0,
      networkSpeed: (navigator as any).connection?.effectiveType || "Unknown",
      cacheSize: Math.round(Math.random() * 50), // Simulated cache size in MB
      activeWorkers: navigator.serviceWorker ? 1 : 0,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculateMetrics();
      const interval = setInterval(calculateMetrics, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen, calculateMetrics]);

  const optimizePerformance = async () => {
    setIsOptimizing(true);
    
    // Simulate optimization tasks
    const tasks = [
      "Clearing unused cache",
      "Optimizing images",
      "Compressing data",
      "Updating workers"
    ];

    for (let i = 0; i < tasks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Refresh metrics after optimization
    calculateMetrics();
    setIsOptimizing(false);
  };

  const getPerformanceStatus = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return { status: "good", icon: CheckCircle, color: "text-green-600" };
    if (value <= thresholds.warning) return { status: "warning", icon: AlertTriangle, color: "text-yellow-600" };
    return { status: "critical", icon: AlertTriangle, color: "text-red-600" };
  };

  const memoryStatus = getPerformanceStatus(metrics.memoryUsage, { good: 50, warning: 75 });
  const loadTimeStatus = getPerformanceStatus(metrics.loadTime, { good: 1000, warning: 3000 });

  if (!isOpen) {
    return null;
  }

  return (
    <Card className="w-80 shadow-lg border">
      <CardHeader className="pb-3">
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <CardTitle className={cn("text-sm flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Activity className="h-4 w-4" />
            {rtl ? "مراقب الأداء" : "Performance Monitor"}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
          >
            ×
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Memory Usage */}
        <div>
          <div className={cn("flex items-center justify-between mb-2", rtl && "flex-row-reverse")}>
            <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
              <Cpu className="h-3 w-3" />
              <span className="text-sm">{rtl ? "استخدام الذاكرة" : "Memory Usage"}</span>
            </div>
            <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
              <memoryStatus.icon className={cn("h-3 w-3", memoryStatus.color)} />
              <span className="text-xs">{metrics.memoryUsage}%</span>
            </div>
          </div>
          <Progress value={metrics.memoryUsage} className="h-2" />
        </div>

        {/* Load Time */}
        <div>
          <div className={cn("flex items-center justify-between mb-2", rtl && "flex-row-reverse")}>
            <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
              <Zap className="h-3 w-3" />
              <span className="text-sm">{rtl ? "وقت التحميل" : "Load Time"}</span>
            </div>
            <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
              <loadTimeStatus.icon className={cn("h-3 w-3", loadTimeStatus.color)} />
              <span className="text-xs">{metrics.loadTime}ms</span>
            </div>
          </div>
          <Progress value={Math.min((metrics.loadTime / 5000) * 100, 100)} className="h-2" />
        </div>

        {/* Network Speed */}
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Wifi className="h-3 w-3" />
            <span className="text-sm">{rtl ? "سرعة الشبكة" : "Network Speed"}</span>
          </div>
          <Badge variant="secondary">{metrics.networkSpeed}</Badge>
        </div>

        {/* Cache Size */}
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            <HardDrive className="h-3 w-3" />
            <span className="text-sm">{rtl ? "حجم التخزين المؤقت" : "Cache Size"}</span>
          </div>
          <span className="text-xs text-muted-foreground">{metrics.cacheSize}MB</span>
        </div>

        {/* Active Workers */}
        <div className={cn("flex items-center justify-between", rtl && "flex-row-reverse")}>
          <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
            <Info className="h-3 w-3" />
            <span className="text-sm">{rtl ? "العمليات النشطة" : "Active Workers"}</span>
          </div>
          <Badge variant={metrics.activeWorkers > 0 ? "default" : "secondary"}>
            {metrics.activeWorkers}
          </Badge>
        </div>

        {/* Optimization Button */}
        <Button
          onClick={optimizePerformance}
          disabled={isOptimizing}
          className="w-full"
          size="sm"
        >
          {isOptimizing ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-b-transparent mr-2" />
              {rtl ? "جاري التحسين..." : "Optimizing..."}
            </>
          ) : (
            rtl ? "تحسين الأداء" : "Optimize Performance"
          )}
        </Button>

        {/* Performance Tips */}
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
          {rtl ? (
            <>
              <strong>نصائح الأداء:</strong>
              <br />• أغلق علامات التبويب غير المستخدمة
              <br />• استخدم وضع ملء الشاشة للأداء الأفضل
              <br />• قم بتحديث المتصفح بانتظام
            </>
          ) : (
            <>
              <strong>Performance Tips:</strong>
              <br />• Close unused browser tabs
              <br />• Use fullscreen mode for better performance
              <br />• Keep your browser updated
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};