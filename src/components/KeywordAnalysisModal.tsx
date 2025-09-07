import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { type KeywordAnalysis, type ConceptAnalysis } from '@/lib/confidence';

interface KeywordAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keywordAnalysis?: KeywordAnalysis;
  conceptAnalysis?: ConceptAnalysis;
  pageNumber?: number;
}

export const KeywordAnalysisModal: React.FC<KeywordAnalysisModalProps> = ({
  open,
  onOpenChange,
  keywordAnalysis,
  conceptAnalysis,
  pageNumber
}) => {
  if (!keywordAnalysis) return null;

  const coveragePercentage = Math.round(keywordAnalysis.coverage * 100);
  const conceptOverlapPercentage = conceptAnalysis ? Math.round(conceptAnalysis.conceptOverlap * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Keyword & Concept Analysis {pageNumber && `- Page ${pageNumber}`}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Coverage Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Coverage Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Keyword Coverage</span>
                    <span className="font-medium">{coveragePercentage}%</span>
                  </div>
                  <Progress value={coveragePercentage} className="h-2" />
                </div>
                
                {conceptAnalysis && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Concept Coverage</span>
                      <span className="font-medium">{conceptOverlapPercentage}%</span>
                    </div>
                    <Progress value={conceptOverlapPercentage} className="h-2" />
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-4 text-center pt-2">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {keywordAnalysis.ocrKeywords.size}
                    </div>
                    <div className="text-xs text-muted-foreground">OCR Keywords</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {keywordAnalysis.commonKeywords.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Matched</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {keywordAnalysis.missingKeywords.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Missing</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Common Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-green-600">
                  ✓ Common Keywords ({keywordAnalysis.commonKeywords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {keywordAnalysis.commonKeywords.map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                {keywordAnalysis.commonKeywords.length === 0 && (
                  <p className="text-muted-foreground text-sm">No common keywords found</p>
                )}
              </CardContent>
            </Card>

            {/* Missing Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-600">
                  ⚠ Missing Keywords ({keywordAnalysis.missingKeywords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {keywordAnalysis.missingKeywords.slice(0, 30).map((keyword, index) => (
                    <Badge key={index} variant="destructive" className="bg-red-50 text-red-700 border-red-200">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                {keywordAnalysis.missingKeywords.length > 30 && (
                  <p className="text-muted-foreground text-sm mt-2">
                    ...and {keywordAnalysis.missingKeywords.length - 30} more
                  </p>
                )}
                {keywordAnalysis.missingKeywords.length === 0 && (
                  <p className="text-muted-foreground text-sm">No missing keywords - excellent coverage!</p>
                )}
              </CardContent>
            </Card>

            {/* Concept Analysis (if available) */}
            {conceptAnalysis && (
              <>
                <Separator />
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-blue-600">
                      📖 Extracted Concepts ({conceptAnalysis.extractedConcepts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {conceptAnalysis.extractedConcepts.map((concept, index) => (
                        <div key={index} className="p-2 bg-blue-50 rounded-md border border-blue-200">
                          <span className="text-sm text-blue-800">{concept}</span>
                        </div>
                      ))}
                    </div>
                    {conceptAnalysis.extractedConcepts.length === 0 && (
                      <p className="text-muted-foreground text-sm">No specific concepts extracted</p>
                    )}
                  </CardContent>
                </Card>

                {conceptAnalysis.missingConcepts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-orange-600">
                        ⚠ Missing Concepts ({conceptAnalysis.missingConcepts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {conceptAnalysis.missingConcepts.map((concept, index) => (
                          <div key={index} className="p-2 bg-orange-50 rounded-md border border-orange-200">
                            <span className="text-sm text-orange-800">{concept}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* All OCR Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">All OCR Keywords</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Array.from(keywordAnalysis.ocrKeywords).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                {keywordAnalysis.ocrKeywords.size === 0 && (
                  <p className="text-muted-foreground text-sm">No keywords extracted from OCR</p>
                )}
              </CardContent>
            </Card>

            {/* Summary Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Summary Keywords</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Array.from(keywordAnalysis.summaryKeywords).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                {keywordAnalysis.summaryKeywords.size === 0 && (
                  <p className="text-muted-foreground text-sm">No keywords extracted from summary</p>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};