import { useParams, Navigate, Link } from "react-router-dom";
import { getLessonBySlug } from "@/data/enhancedBooks";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";
import BookViewer from "@/components/BookViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, TrendingUp, Play, FileText, Users, CheckCircle } from "lucide-react";
import { useMemo, useState } from "react";

export default function LessonPage() {
  const { bookSlug, chapterNumber, lessonSlug } = useParams<{
    bookSlug: string;
    chapterNumber: string;
    lessonSlug: string;
  }>();

  const [activeTab, setActiveTab] = useState<'content' | 'summary' | 'practice'>('content');

  const lessonData = useMemo(() => {
    if (!bookSlug || !lessonSlug) return null;
    return getLessonBySlug(bookSlug, lessonSlug);
  }, [bookSlug, lessonSlug]);

  if (!lessonData) {
    return <Navigate to="/library" replace />;
  }

  const { book, lesson } = lessonData;
  const pages = book.buildPages();

  // Calculate estimated page number based on lesson data
  const estimatedPageNumber = (lesson.unitNumber - 1) * 20 + (lesson.chapterNumber - 1) * 5 + lesson.lessonNumber;

      // Get interactive content based on lesson type
      const getInteractiveContent = () => {
        if (lesson.slug === 'درس-الهيدروكربونات') {
          return {
            summary: `
# أنواع الهيدروكربونات

## الهيدروكربونات المشبعة (Saturated Hydrocarbons)
- **الألكانات (Alkanes)**: تحتوي على روابط أحادية فقط
- الصيغة العامة: CnH2n+2
- أمثلة: الميثان (CH₄)، الإيثان (C₂H₆)، البروبان (C₃H₈)

## الهيدروكربونات غير المشبعة (Unsaturated Hydrocarbons)
- **الألكينات (Alkenes)**: تحتوي على رابطة مزدوجة واحدة
- الصيغة العامة: CnH2n
- **الألكاينات (Alkynes)**: تحتوي على رابطة ثلاثية واحدة
- الصيغة العامة: CnH2n-2

## المركبات العطرية (Aromatic Compounds)
- تحتوي على حلقة البنزين
- خصائص خاصة ومقاومة للتفاعلات
            `,
            commonQuestions: [
              {
                question: "ما الفرق بين الألكانات والألكينات؟",
                answer: "الألكانات تحتوي على روابط أحادية فقط وهي مشبعة، بينما الألكينات تحتوي على رابطة مزدوجة واحدة وهي غير مشبعة."
              },
              {
                question: "لماذا سميت الهيدروكربونات بهذا الاسم؟",
                answer: "لأنها تتكون من عنصرين فقط: الهيدروجين والكربون."
              },
              {
                question: "ما أهمية الهيدروكربونات في الحياة؟",
                answer: "تستخدم كوقود (بنزين، ديزل، غاز طبيعي) ومواد خام لصناعة البلاستيك والأدوية."
              }
            ],
            keyTakeaways: [
              "الهيدروكربونات هي مركبات تحتوي على الكربون والهيدروجين فقط",
              "تنقسم إلى مشبعة (ألكانات) وغير مشبعة (ألكينات وألكاينات)",
              "المركبات العطرية لها خصائص مميزة وتحتوي على حلقة البنزين",
              "لها أهمية كبيرة في الصناعة والطاقة"
            ]
          };
        }
        return null;
      };

  const interactiveContent = getInteractiveContent();

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced SEO Components */}
      <DynamicSEOHead book={book} lesson={lesson} />
      <StructuredDataSchemas book={book} lesson={lesson} />
      <SEOFAQSchema />
      
      <div className="container mx-auto px-4 py-6">
        <EnhancedSEOBreadcrumb book={book} lesson={lesson} />
        
        {/* Enhanced Page Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-3" dir="rtl">
            {lesson.title}
          </h1>
          <p className="text-xl text-muted-foreground mb-6" dir="rtl">
            {lesson.metaDescription}
          </p>
          
          {/* Enhanced Lesson Metadata */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">المادة</p>
                  <p className="font-semibold">{book.subjectArabic}</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">الفصل</p>
                  <p className="font-semibold">الفصل {lesson.chapterNumber}</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">وقت القراءة</p>
                  <p className="font-semibold">{lesson.estimatedReadTime} دقيقة</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">المستوى</p>
                  <p className="font-semibold">
                    {lesson.difficultyLevel === 'beginner' ? 'مبتدئ' : 
                     lesson.difficultyLevel === 'intermediate' ? 'متوسط' : 'متقدم'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Keywords */}
          <div className="mb-6" dir="rtl">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">الكلمات المفتاحية:</h3>
            <div className="flex flex-wrap gap-2">
              {lesson.arabicKeywords.map((keyword, idx) => (
                <Badge key={idx} variant="secondary">{keyword}</Badge>
              ))}
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="mb-6">
          <div className="flex gap-4 border-b">
            <Button
              variant={activeTab === 'content' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('content')}
              className="rounded-b-none"
            >
              المحتوى التفاعلي
            </Button>
            {interactiveContent && (
              <>
                <Button
                  variant={activeTab === 'summary' ? 'default' : 'ghost'}
                  onClick={() => setActiveTab('summary')}
                  className="rounded-b-none"
                >
                  ملخص الدرس
                </Button>
                <Button
                  variant={activeTab === 'practice' ? 'default' : 'ghost'}
                  onClick={() => setActiveTab('practice')}
                  className="rounded-b-none"
                >
                  أسئلة شائعة
                </Button>
              </>
            )}
          </div>
        </nav>

        {/* Content Sections */}
        {activeTab === 'content' && (
          <section>
            <BookViewer
              bookId={book.id}
              pages={pages}
              title={book.title}
              rtl={book.rtl}
              labels={{
                previous: "السابق",
                next: "التالي",
                notesTitle: n => `ملاحظات للصفحة ${n}`,
                autosaves: "حفظ تلقائي محلي",
                clear: "مسح",
                copy: "نسخ",
                toastCopied: "تم نسخ الملاحظة إلى الحافظة",
                toastCopyFailed: "تعذّر نسخ الملاحظة",
                toastCleared: "تم مسح الملاحظات لهذه الصفحة",
                progress: (c, t, p) => `الصفحة ${c} من ${t} • ${p}%`
              }}
            />
          </section>
        )}

        {activeTab === 'summary' && interactiveContent && (
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" dir="rtl">
                  <FileText className="h-5 w-5" />
                  ملخص شامل للدرس
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="prose prose-slate max-w-none rtl:prose-rtl" 
                  dir="rtl"
                  dangerouslySetInnerHTML={{ __html: interactiveContent.summary.replace(/\n/g, '<br>').replace(/##\s/g, '<h3>').replace(/<h3>/g, '</h3><h3>') }}
                />
              </CardContent>
            </Card>

            {/* Key Takeaways */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" dir="rtl">
                  <CheckCircle className="h-5 w-5" />
                  النقاط الأساسية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3" dir="rtl">
                  {interactiveContent.keyTakeaways.map((takeaway, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        {activeTab === 'practice' && interactiveContent && (
          <section className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" dir="rtl">
                  <Users className="h-5 w-5" />
                  أسئلة الطلاب الشائعة
                </CardTitle>
                <CardDescription dir="rtl">
                  إجابات على أكثر الأسئلة شيوعاً حول هذا الدرس
                </CardDescription>
              </CardHeader>
            </Card>
            
            {interactiveContent.commonQuestions.map((qa, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-lg" dir="rtl">
                    س{idx + 1}: {qa.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground" dir="rtl">
                    {qa.answer}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {/* Related Lessons Navigation */}
        <nav className="mt-12 pt-8 border-t">
          <div className="flex justify-between items-center">
            <Link 
              to={`/${book.slug}/الفصل-${lesson.chapterNumber}`}
              className="text-primary hover:underline"
            >
              ← عرض جميع دروس الفصل {lesson.chapterNumber}
            </Link>
            <Link 
              to={`/book/${book.id}`}
              className="text-primary hover:underline"
            >
              تصفح الكتاب كاملاً →
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}