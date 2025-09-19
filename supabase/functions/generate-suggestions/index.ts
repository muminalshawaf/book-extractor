import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { summary, lang = 'ar' } = await req.json();

    if (!summary || !deepseekApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing summary or API key' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = lang === 'ar' 
      ? 'أنت مساعد ذكي متخصص في توليد أسئلة واقتراحات تعليمية. قم بتحليل الملخص المعطى وإنتاج 4-6 اقتراحات قصيرة وواضحة باللغة العربية.'
      : 'You are an AI assistant specialized in generating educational questions and suggestions. Analyze the given summary and produce 4-6 short, clear suggestions in English.';

    const userPrompt = lang === 'ar'
      ? `بناءً على الملخص التالي، قم بإنتاج قائمة من 4-6 اقتراحات تعليمية قصيرة وواضحة. كل اقتراح يجب أن يكون سؤالاً أو طلباً يساعد في فهم المحتوى بشكل أفضل:

الملخص: ${summary}

يرجى إرجاع النتيجة كـ JSON array بالتنسيق التالي فقط بدون أي نص إضافي:
[
  {"title": "اشرح المفهوم الأساسي", "query": "اشرح المفهوم الأساسي المذكور في هذا النص"},
  {"title": "أعط أمثلة", "query": "أعط أمثلة عملية على ما ورد في النص"}
]`
      : `Based on the following summary, generate a list of 4-6 short, clear educational suggestions. Each suggestion should be a question or request that helps understand the content better:

Summary: ${summary}

Please return the result as a JSON array in this format only without any additional text:
[
  {"title": "Explain the main concept", "query": "Explain the main concept mentioned in this text"},
  {"title": "Give examples", "query": "Give practical examples of what's mentioned in the text"}
]`;

    console.log('Sending request to DeepSeek API...');

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, await response.text());
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('DeepSeek API response:', data);
    
    const content = data.choices[0].message.content;

    // Try to extract JSON from the response
    let suggestions = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: parse line by line if JSON extraction fails
        const lines = content.split('\n').filter(line => line.trim());
        for (let i = 0; i < Math.min(6, lines.length); i++) {
          const line = lines[i].replace(/^\d+\.\s*/, '').trim();
          if (line) {
            suggestions.push({
              title: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
              query: line
            });
          }
        }
      }
    } catch (parseError) {
      console.error('Failed to parse suggestions:', parseError);
      console.log('Raw content:', content);
      // Provide default suggestions if parsing fails
      suggestions = lang === 'ar' ? [
        { title: 'اشرح النقاط الرئيسية', query: 'اشرح النقاط الرئيسية في هذا النص' },
        { title: 'أعط أمثلة عملية', query: 'أعط أمثلة عملية على المفاهيم المذكورة' },
        { title: 'وضح الأهمية', query: 'وضح أهمية هذا الموضوع' }
      ] : [
        { title: 'Explain key points', query: 'Explain the key points in this text' },
        { title: 'Give practical examples', query: 'Give practical examples of the mentioned concepts' },
        { title: 'Clarify importance', query: 'Clarify the importance of this topic' }
      ];
    }

    // Ensure we have valid suggestions
    suggestions = suggestions.filter(s => s.title && s.query).slice(0, 6);

    console.log('Final suggestions:', suggestions);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-suggestions function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});