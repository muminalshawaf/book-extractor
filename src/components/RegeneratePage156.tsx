import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const RegeneratePage156 = () => {
  const [status, setStatus] = useState<string>('Ready');
  const [isLoading, setIsLoading] = useState(false);

  const ocrText = `--- SECTION: تجميع المستندات Document Clustering --- الآن بعد تحميل مجموعة البيانات فإن الخطوة التالية هي تجربة عدة طرائق غير موجهة، ومنها: التجميع الذي يُعدُّ الطريقة غير الموجهة الأكثر شهرة في هذا النطاق. وبالنظر إلى مجموعة من المستندات غير المعنونة، سيكون الهدف هو تجميع الوثائق المتشابهة معًا، وفي الوقت نفسه الفصل بين الوثائق غير المتشابهة.--- SECTION: تجميع المستندات (Document Clustering) --- تجميع المستندات هو طريقة تستخدم لتجميع المستندات النصية في عناقيد بناءً على تشابه محتواها.--- SECTION: جدول 3.2: العوامل التي تحدد جودة النتائج --- 1 طريقة تمثيل البيانات بالمتجهات: على الرغم من أن تقنية تكرار المصطلح - تكرار المستند العكسي (TF-IDF) أثبتت كفاءتها وفعاليتها في هذا المجال، إلا أنك ستتعرف في هذة الوحدة على مزيد من البدائل الأكثر تطورًا وتعقيدًا.
2 التعريف الدقيق للتشابه بين مستند وآخر: بالنسبة للبيانات النصية الممثلة بالمتجهات، تكون مقاييس المسافة الإقليدية وجيب التمام هما الأكثر شيوعًا، وسيُستخدم الأول في الأمثلة المشروحة في هذه الوحدة.
3 عدد العناقيد المختارة: يوفر التجميع التكتلي (Agglomerative Clustering - AC) طريقة واضحة لتحديد العدد المناسب من العناقيد ضمن مجموعة محددة من البيانات، وهو التحدي الرئيس الذي يواجه مهام التجميع.--- SECTION: تحديد عدد العناقيد Selecting the Number of Clusters --- تحديد العدد الصحيح للعناقيد هو خطوة ضرورية ضمن مهام التجميع. للأسف، تعتمد الغالبية العظمى من خوارزميات التجميع على المستخدم في تحديد عدد العناقيد الصحيحة ضمن المدخلات، ربما يكون للعدد المحدد تأثيرًا كبيرًا على جودة النتائج وقابليتها للتفسير. ولكن هناك العديد من المقاييس أو المؤشرات التي يمكن استخدامها لتحديد عدد العناقيد.
• إحدى الطرائق الشائعة هي استخدام مقياس التراص (Compactness). يمكن القيام بذلك عن طريق حساب مجموع المسافات بين النقاط ضمن كل عنقود، وتحديد عدد العناقيد الذي يقلل من هذا المجموع إلى الحد الأدنى.
• هناك طريقة أخرى تتلخص في مقياس الفصل (Separation) بين العناقيد، مثل متوسط المسافة بين النقاط في العناقيد المختلفة، وبناء عليه، يتم تحديد عدد العناقيد الذي يرفع من هذا المتوسط.
وبشكل عملي، غالبًا ما تتعارض المنهجيات المذكورة بالأعلى مع بعضها من حيث التوصية بأرقام مختلفة، ويمثل هذا تحديًا مشتركًا عند التعامل مع البيانات النصية بشكل خاص، فعادة ما يصعب تمييز تركيبها.--- SECTION: المسافة الإقليدية (Euclidean Distance) --- المسافة الإقليدية هي مسافة الخط المستقيم بين نقطتين في فضاء متعدد الأبعاد. وتُحسب بالجذر التربيعي لمجموع مربعات الفروقات بين الأبعاد المناظرة للنقاط. تُستخدم المسافة الإقليدية في التجميع لقياس التشابه بين نقطتي بيانات.--- SECTION: مسافة جيب التمام (Cosine Distance) --- تُستخدم مسافة جيب التمام لقياس التشابه في جيب التمام بين نقطتي البيانات. فهي تحسب جيب تمام الزاوية بين متجهين يمثلان نقاط البيانات، وتُستخدم عادة في تجميع البيانات النصية. وتقع قيمة جيب التمام بين 1- و 1؛ حيث تشير القيمة 1- إلى الاتجاه العكسي، بينما تشير القيمة 1 إلى الاتجاه نفسه.`;

  const regenerate = async () => {
    setIsLoading(true);
    setStatus('🔄 Starting regeneration...');

    try {
      // Step 1: Call summarize function with anti-hallucination system
      setStatus('📝 Calling summarize function...');
      
      const { data: summarizeResult, error: summarizeError } = await supabase.functions.invoke('summarize', {
        body: {
          text: ocrText,
          lang: 'ar',
          page: 156,
          title: 'artificialintelligence12-1'
        }
      });

      if (summarizeError) {
        throw new Error(`Summarize error: ${JSON.stringify(summarizeError)}`);
      }

      setStatus(`✅ Summarize completed - Compliance: ${summarizeResult.compliance_score}%`);

      // Step 2: Save the new summary (test anti-hallucination gate)
      setStatus('💾 Saving summary (testing anti-hallucination gate)...');

      const { data: saveResult, error: saveError } = await supabase.functions.invoke('save-page-summary', {
        body: {
          book_id: 'artificialintelligence12-1',
          page_number: 156,
          ocr_text: ocrText,
          summary_md: summarizeResult.summary,
          ocr_confidence: 0.95,
          confidence: summarizeResult.compliance_score / 100,
          compliance_score: summarizeResult.compliance_score,
          validation_meta: summarizeResult.validation_meta,
          provider_used: summarizeResult.provider_used
        }
      });

      if (saveError) {
        if (saveError.message?.includes('Anti-hallucination gate')) {
          setStatus(`🚫 Anti-hallucination gate blocked: ${saveError.message}`);
          return;
        }
        throw new Error(`Save error: ${JSON.stringify(saveError)}`);
      }

      setStatus('✅ Page 156 successfully regenerated! Anti-hallucination system working.');

      // Reload page to show new content
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Regeneration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="fixed top-4 right-4 w-80 z-50">
      <CardHeader>
        <CardTitle>🧪 Test Anti-Hallucination System</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Test regenerating page 156 with the new anti-hallucination system
        </div>
        
        <div className="p-3 bg-muted rounded text-sm">
          Status: {status}
        </div>

        <Button 
          onClick={regenerate} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Regenerating...' : 'Regenerate Page 156'}
        </Button>
      </CardContent>
    </Card>
  );
};