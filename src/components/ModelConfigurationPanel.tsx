import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, Zap, Settings2, Info } from "lucide-react";
import { toast } from "sonner";

export type ModelType = 'gemini' | 'deepseek';

export interface ModelConfiguration {
  primaryModel: ModelType;
  enableFallback: boolean;
  fallbackModel?: ModelType;
}

interface ModelConfigurationPanelProps {
  onConfigChange: (config: ModelConfiguration) => void;
  initialConfig?: ModelConfiguration;
}

const MODEL_INFO = {
  gemini: {
    name: "Gemini 2.5 Pro",
    icon: Brain,
    description: "Google's advanced multimodal AI model",
    features: ["High accuracy", "Arabic support", "Visual understanding"],
    color: "bg-blue-500"
  },
  deepseek: {
    name: "DeepSeek Chat",
    icon: Zap,
    description: "Efficient language model for text processing",
    features: ["Fast processing", "Cost-effective", "Good Arabic support"],
    color: "bg-purple-500"
  }
};

const ModelConfigurationPanel: React.FC<ModelConfigurationPanelProps> = ({
  onConfigChange,
  initialConfig = { primaryModel: 'gemini', enableFallback: true, fallbackModel: 'deepseek' }
}) => {
  const [config, setConfig] = useState<ModelConfiguration>(initialConfig);
  const [isExpanded, setIsExpanded] = useState(false);

  // Update parent when config changes
  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  const handlePrimaryModelChange = (model: string) => {
    const modelType = model as ModelType;
    const newConfig: ModelConfiguration = {
      primaryModel: modelType,
      enableFallback: config.enableFallback,
      fallbackModel: config.enableFallback ? (modelType === 'gemini' ? 'deepseek' : 'gemini') : undefined
    };
    setConfig(newConfig);
    toast.success(`Primary model set to ${MODEL_INFO[modelType].name}`);
  };

  const handleFallbackToggle = (enabled: boolean) => {
    const newConfig: ModelConfiguration = {
      primaryModel: config.primaryModel,
      enableFallback: enabled,
      fallbackModel: enabled ? (config.primaryModel === 'gemini' ? 'deepseek' : 'gemini') : undefined
    };
    setConfig(newConfig);
    toast.success(`Fallback ${enabled ? 'enabled' : 'disabled'}`);
  };

  const ModelCard = ({ modelType, isActive, isPrimary, isFallback }: { 
    modelType: ModelType; 
    isActive: boolean; 
    isPrimary: boolean; 
    isFallback: boolean; 
  }) => {
    const model = MODEL_INFO[modelType];
    const Icon = model.icon;

    return (
      <div className={`
        relative border rounded-lg p-4 transition-all duration-200
        ${isActive ? 'border-primary bg-primary/5' : 'border-border bg-background'}
        ${isPrimary ? 'ring-2 ring-primary/20' : ''}
        hover:shadow-md
      `}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${model.color} text-white`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-semibold text-sm">{model.name}</h4>
              <p className="text-xs text-muted-foreground">{model.description}</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            {isPrimary && (
              <Badge variant="default" className="text-xs">Primary</Badge>
            )}
            {isFallback && (
              <Badge variant="secondary" className="text-xs">Fallback</Badge>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {model.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1 h-1 bg-current rounded-full" />
              {feature}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Model Configuration</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Quick Summary */}
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Primary:</span>
            <Badge variant="default" className="gap-1">
              {React.createElement(MODEL_INFO[config.primaryModel].icon, { className: "h-3 w-3" })}
              {MODEL_INFO[config.primaryModel].name}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Fallback:</span>
            {config.enableFallback && config.fallbackModel ? (
              <Badge variant="secondary" className="gap-1">
                {React.createElement(MODEL_INFO[config.fallbackModel].icon, { className: "h-3 w-3" })}
                {MODEL_INFO[config.fallbackModel].name}
              </Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
        </div>

        {isExpanded && (
          <>
            {/* Primary Model Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Primary Model</h4>
                  <p className="text-sm text-muted-foreground">
                    The main model used for processing
                  </p>
                </div>
                <Select value={config.primaryModel} onValueChange={handlePrimaryModelChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        Gemini 2.5 Pro
                      </div>
                    </SelectItem>
                    <SelectItem value="deepseek">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        DeepSeek Chat
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Model Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ModelCard
                modelType="gemini"
                isActive={config.primaryModel === 'gemini' || (config.enableFallback && config.fallbackModel === 'gemini')}
                isPrimary={config.primaryModel === 'gemini'}
                isFallback={config.enableFallback && config.fallbackModel === 'gemini'}
              />
              <ModelCard
                modelType="deepseek"
                isActive={config.primaryModel === 'deepseek' || (config.enableFallback && config.fallbackModel === 'deepseek')}
                isPrimary={config.primaryModel === 'deepseek'}
                isFallback={config.enableFallback && config.fallbackModel === 'deepseek'}
              />
            </div>

            {/* Fallback Configuration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Fallback Model</h4>
                  <p className="text-sm text-muted-foreground">
                    Enable fallback to secondary model if primary fails
                  </p>
                </div>
                <Switch
                  checked={config.enableFallback}
                  onCheckedChange={handleFallbackToggle}
                />
              </div>

              {!config.enableFallback && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Fallback disabled:</strong> Processing will fail if the primary model encounters errors.
                    Only the {MODEL_INFO[config.primaryModel].name} will be used for all processing.
                  </AlertDescription>
                </Alert>
              )}

              {config.enableFallback && config.fallbackModel && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Fallback enabled:</strong> If {MODEL_INFO[config.primaryModel].name} fails, 
                    the system will automatically retry with {MODEL_INFO[config.fallbackModel].name}.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ModelConfigurationPanel;