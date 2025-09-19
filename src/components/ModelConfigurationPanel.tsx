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
    description: "Google's flagship multimodal AI with vision capabilities",
    features: ["Multimodal processing", "Visual understanding", "High accuracy", "Arabic support"],
    color: "bg-blue-500"
  },
  deepseek: {
    name: "DeepSeek Reasoner",
    icon: Zap,
    description: "Specialized reasoning model for complex problem-solving",
    features: ["Advanced logical reasoning", "Step-by-step analysis", "Cost-effective", "Arabic support"],
    color: "bg-purple-500"
  }
};

const ModelConfigurationPanel: React.FC<ModelConfigurationPanelProps> = ({
  onConfigChange,
  initialConfig = { primaryModel: 'gemini', enableFallback: true, fallbackModel: 'deepseek' }
}) => {
  const [config, setConfig] = useState<ModelConfiguration>(initialConfig);
  const [isExpanded, setIsExpanded] = useState(true); // Expanded by default

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
      fallbackModel: enabled ? config.fallbackModel : undefined
    };
    setConfig(newConfig);
    toast.success(`Fallback ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleFallbackModelChange = (model: string) => {
    console.log('Fallback model changed to:', model); // Debug log
    const isNone = model === 'none';
    const fallbackModel = isNone ? undefined : (model as ModelType);
    
    const newConfig: ModelConfiguration = {
      primaryModel: config.primaryModel,
      enableFallback: !isNone, // Set enableFallback based on selection
      fallbackModel: fallbackModel
    };
    
    console.log('New config:', newConfig); // Debug log
    setConfig(newConfig);
    toast.success(isNone ? 'Fallback disabled' : `Fallback set to ${MODEL_INFO[model as ModelType]?.name}`);
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
        {/* Primary Model Selection - Always Visible */}
        <div className="space-y-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-primary">Choose Primary Model</h4>
              <p className="text-sm text-muted-foreground">
                Select which AI model to use for processing
              </p>
            </div>
            <Select value={config.primaryModel} onValueChange={handlePrimaryModelChange}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="font-medium">Gemini 2.5 Pro</div>
                      <div className="text-xs text-muted-foreground">Google's advanced AI</div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="deepseek">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    <div>
                      <div className="font-medium">DeepSeek Reasoner</div>
                      <div className="text-xs text-muted-foreground">Advanced reasoning</div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fallback Configuration - Always Visible */}
        <div className="space-y-4 p-4 bg-secondary/5 border border-secondary/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Fallback Model Configuration</h4>
              <p className="text-sm text-muted-foreground">
                Choose backup model if primary fails
              </p>
            </div>
            <Select 
              value={config.enableFallback && config.fallbackModel ? config.fallbackModel : 'none'} 
              onValueChange={handleFallbackModelChange}
            >
              <SelectTrigger className="w-52 bg-background border border-border">
                <SelectValue placeholder="Choose fallback..." />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border shadow-lg z-50">
                <SelectItem value="none" className="bg-background hover:bg-accent">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
                      <span className="text-xs text-white font-bold">✕</span>
                    </div>
                    <div>
                      <div className="font-medium">No Fallback</div>
                      <div className="text-xs text-muted-foreground">Disable backup model</div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem 
                  value="gemini" 
                  disabled={config.primaryModel === 'gemini'}
                  className="bg-background hover:bg-accent disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="font-medium">Gemini 2.5 Pro</div>
                      <div className="text-xs text-muted-foreground">
                        {config.primaryModel === 'gemini' ? 'Already primary' : 'Google\'s advanced AI'}
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem 
                  value="deepseek" 
                  disabled={config.primaryModel === 'deepseek'}
                  className="bg-background hover:bg-accent disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    <div>
                      <div className="font-medium">DeepSeek Reasoner</div>
                      <div className="text-xs text-muted-foreground">
                        {config.primaryModel === 'deepseek' ? 'Already primary' : 'Advanced reasoning'}
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {config.enableFallback && config.fallbackModel && (
            <div className="flex items-center gap-2 pt-2 border-t border-secondary/20">
              <span className="text-sm font-medium">Active Fallback:</span>
              <Badge variant="secondary" className="gap-1">
                {React.createElement(MODEL_INFO[config.fallbackModel].icon, { className: "h-3 w-3" })}
                {MODEL_INFO[config.fallbackModel].name}
              </Badge>
            </div>
          )}
          
          {!config.enableFallback && (
            <Alert className="border-orange-200 bg-orange-50">
              <Info className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-700">
                <strong>No fallback:</strong> Processing will stop if your primary model fails.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Current Configuration Summary */}
        <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Using:</span>
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
              <Badge variant="destructive">Disabled</Badge>
            )}
          </div>
        </div>

        {isExpanded && (
          <>
            {/* Advanced Model Information */}
            <div className="space-y-3">
              <h4 className="font-semibold">Model Details</h4>
              <p className="text-sm text-muted-foreground">
                Detailed information about each model
              </p>
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

            {/* Additional Configuration Details */}
            <div className="space-y-3">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>How it works:</strong> The system will always try your primary model first. 
                  If fallback is enabled and the primary model fails, it will automatically retry with the backup model.
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ModelConfigurationPanel;