import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface HenryLawCalculatorProps {
  questionNumber?: string;
}

export const HenryLawCalculator: React.FC<HenryLawCalculatorProps> = ({ 
  questionNumber = "92" 
}) => {
  // Henry's Law: S₁/P₁ = S₂/P₂
  // Given data point: P₂ = 32 kPa, S₂ = 3.7 g/L
  
  const knownPressure = 32; // kPa
  const knownSolubility = 3.7; // g/L
  
  // Calculate missing pressure when solubility = 2.9 g/L
  const solubility1 = 2.9;
  const pressure1 = (solubility1 * knownPressure) / knownSolubility;
  
  // Calculate missing solubility when pressure = 39 kPa
  const pressure3 = 39;
  const solubility3 = (knownSolubility * pressure3) / knownPressure;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Badge variant="secondary">سؤال {questionNumber}</Badge>
          حل جدول قانون هنري
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Original Table */}
        <div>
          <h3 className="font-semibold mb-3 text-right">جدول 1-8 الذائبية والضغط (الأصلي):</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border rounded-lg">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-3 text-right">الضغط (kPa)</th>
                  <th className="border border-border p-3 text-right">الذائبية (g/L)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border p-3 text-center text-muted-foreground">?</td>
                  <td className="border border-border p-3 text-center">2.9</td>
                </tr>
                <tr className="bg-muted/50">
                  <td className="border border-border p-3 text-center font-medium">32</td>
                  <td className="border border-border p-3 text-center font-medium">3.7</td>
                </tr>
                <tr>
                  <td className="border border-border p-3 text-center">39</td>
                  <td className="border border-border p-3 text-center text-muted-foreground">?</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Solution Steps */}
        <div className="space-y-4">
          <h3 className="font-semibold text-right">الحل باستخدام قانون هنري:</h3>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-center mb-2 font-mono text-lg">
              S₁/P₁ = S₂/P₂
            </div>
            <p className="text-sm text-muted-foreground text-center">
              حيث S = الذائبية، P = الضغط
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-right">الحساب الأول: إيجاد الضغط المفقود</h4>
              <div className="text-sm space-y-1 font-mono">
                <div>P₁ = (S₁ × P₂) / S₂</div>
                <div>P₁ = (2.9 × 32) / 3.7</div>
                <div>P₁ = 92.8 / 3.7</div>
                <div className="font-bold">P₁ = {pressure1.toFixed(1)} kPa</div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-right">الحساب الثاني: إيجاد الذائبية المفقودة</h4>
              <div className="text-sm space-y-1 font-mono">
                <div>S₃ = (S₂ × P₃) / P₂</div>
                <div>S₃ = (3.7 × 39) / 32</div>
                <div>S₃ = 144.3 / 32</div>
                <div className="font-bold">S₃ = {solubility3.toFixed(1)} g/L</div>
              </div>
            </div>
          </div>
        </div>

        {/* Completed Table */}
        <div>
          <h3 className="font-semibold mb-3 text-right">الجدول المكتمل:</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border rounded-lg">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-3 text-right">الضغط (kPa)</th>
                  <th className="border border-border p-3 text-right">الذائبية (g/L)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border p-3 text-center font-bold text-blue-600">
                    {pressure1.toFixed(1)}
                  </td>
                  <td className="border border-border p-3 text-center">2.9</td>
                </tr>
                <tr className="bg-muted/50">
                  <td className="border border-border p-3 text-center font-medium">32</td>
                  <td className="border border-border p-3 text-center font-medium">3.7</td>
                </tr>
                <tr>
                  <td className="border border-border p-3 text-center">39</td>
                  <td className="border border-border p-3 text-center font-bold text-green-600">
                    {solubility3.toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Henry's Law Explanation */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 p-4 rounded-lg">
          <h4 className="font-medium mb-2 text-right">قانون هنري:</h4>
          <p className="text-sm text-right leading-relaxed">
            ينص قانون هنري على أن ذائبية الغاز في السائل تتناسب طردياً مع الضغط الجزئي للغاز فوق السائل عند درجة حرارة ثابتة.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};