import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

interface SummarizationDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  debugData: {
    ocrText: string;
    enhancedText: string;
    systemPrompt: string;
    userPrompt: string;
    visualElements: any[];
    questions: any[];
    apiPayload: any;
    pageNumber: number;
    bookId: string;
  } | null;
}

export const SummarizationDebugModal: React.FC<SummarizationDebugModalProps> = ({
  isOpen,
  onClose,
  debugData
}) => {
  const [activeTab, setActiveTab] = useState("overview");

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const downloadAsJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filename} downloaded`);
  };

  if (!debugData) return null;

  const stats = {
    ocrTextLength: debugData.ocrText.length,
    enhancedTextLength: debugData.enhancedText.length,
    systemPromptLength: debugData.systemPrompt.length,
    userPromptLength: debugData.userPrompt.length,
    totalPromptLength: debugData.systemPrompt.length + debugData.userPrompt.length,
    questionsFound: debugData.questions.length,
    visualElements: debugData.visualElements.length
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🐛 Summarization Debug - Page {debugData.pageNumber}
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAsJson(debugData, `debug-page-${debugData.pageNumber}.json`)}
            >
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ocr">OCR Text</TabsTrigger>
            <TabsTrigger value="enhanced">Enhanced</TabsTrigger>
            <TabsTrigger value="system">System Prompt</TabsTrigger>
            <TabsTrigger value="user">User Prompt</TabsTrigger>
            <TabsTrigger value="payload">API Payload</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <h3 className="font-semibold">📊 Statistics</h3>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <div>📄 OCR Text: {stats.ocrTextLength.toLocaleString()} chars</div>
                  <div>✨ Enhanced Text: {stats.enhancedTextLength.toLocaleString()} chars</div>
                  <div>🤖 System Prompt: {stats.systemPromptLength.toLocaleString()} chars</div>
                  <div>👤 User Prompt: {stats.userPromptLength.toLocaleString()} chars</div>
                  <div className="font-bold">📏 Total Prompt: {stats.totalPromptLength.toLocaleString()} chars</div>
                  <div>❓ Questions Found: {stats.questionsFound}</div>
                  <div>🖼️ Visual Elements: {stats.visualElements}</div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">🔍 Questions Detected</h3>
                <ScrollArea className="h-48 bg-muted p-4 rounded-lg">
                  {debugData.questions.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {debugData.questions.map((q: any, i: number) => (
                        <div key={i} className="border-b pb-2">
                          <div className="font-bold">Q{q.number}: {q.text.substring(0, 100)}...</div>
                          <div className="text-xs text-muted-foreground">
                            MC: {q.isMultipleChoice ? 'Yes' : 'No'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No questions detected</div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ocr" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">📄 Original OCR Text ({stats.ocrTextLength} chars)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(debugData.ocrText, "OCR Text")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <ScrollArea className="flex-1 bg-muted p-4 rounded-lg">
              <pre className="text-sm whitespace-pre-wrap">{debugData.ocrText}</pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="enhanced" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">✨ Enhanced Text with Visuals ({stats.enhancedTextLength} chars)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(debugData.enhancedText, "Enhanced Text")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <ScrollArea className="flex-1 bg-muted p-4 rounded-lg">
              <pre className="text-sm whitespace-pre-wrap">{debugData.enhancedText}</pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="system" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">🤖 System Prompt ({stats.systemPromptLength} chars)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(debugData.systemPrompt, "System Prompt")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <ScrollArea className="flex-1 bg-muted p-4 rounded-lg">
              <pre className="text-sm whitespace-pre-wrap">{debugData.systemPrompt}</pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="user" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">👤 User Prompt ({stats.userPromptLength} chars)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(debugData.userPrompt, "User Prompt")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <ScrollArea className="flex-1 bg-muted p-4 rounded-lg">
              <pre className="text-sm whitespace-pre-wrap">{debugData.userPrompt}</pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="payload" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">🌐 Full API Payload</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(debugData.apiPayload, null, 2), "API Payload")}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy JSON
              </Button>
            </div>
            <ScrollArea className="flex-1 bg-muted p-4 rounded-lg">
              <pre className="text-xs whitespace-pre-wrap">
                {JSON.stringify(debugData.apiPayload, null, 2)}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};