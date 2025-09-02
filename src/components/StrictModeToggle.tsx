
import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface StrictModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

export function StrictModeToggle({ enabled, onChange, className = "" }: StrictModeToggleProps) {
  return (
    <div className={`flex items-center space-x-3 p-3 rounded-lg border ${enabled ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'} ${className}`}>
      <div className="flex items-center space-x-2">
        {enabled ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
        )}
        <Label htmlFor="strict-mode" className="text-sm font-medium">
          Mandate Strict Mode
        </Label>
        <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
          {enabled ? "ON" : "OFF"}
        </Badge>
      </div>
      
      <Switch
        id="strict-mode"
        checked={enabled}
        onCheckedChange={onChange}
        className="ml-auto"
      />
      
      <div className="text-xs text-muted-foreground max-w-sm">
        {enabled ? (
          <span className="text-green-700">
            ✓ Enforces MathJax, OCR usage, no assumptions
          </span>
        ) : (
          <span className="text-yellow-700">
            ⚠ Relaxed validation - may have rendering issues
          </span>
        )}
      </div>
    </div>
  );
}
