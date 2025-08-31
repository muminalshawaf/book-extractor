import { useParams, Navigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { getBookBySlug } from "@/data/enhancedBooks";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, TrendingUp } from "lucide-react";

export default function ChapterPage() {
  const { bookSlug, chapterNumber } = useParams<{
    bookSlug: string;
    chapterNumber: string;
  }>();

  const book = bookSlug ? getBookBySlug(bookSlug) : null;
  const chapter = chapterNumber ? parseInt(chapterNumber) : 1;

  if (!book) {
    return <Navigate to="/library" replace />;
  }

  // Filter lessons for this chapter
  const chapterLessons = book.lessons?.filter(lesson => lesson.chapterNumber === chapter) || [];
  
  const chapterTitle = `الفصل ${chapter}`;
  const chapterDescription = `دروس ${book.subjectArabic} للصف ${book.grade} - ${chapterTitle}`;

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Components */}
      <DynamicSEOHead 
        book={book} 
        customTitle={`${chapterTitle} - ${book.title}`}
        customDescription={chapterDescription}
      />
      <StructuredDataSchemas book={book} />
      
      <div className="container mx-auto px-4 py-6">
        <EnhancedSEOBreadcrumb book={book} />
        
        {/* Chapter Header */}
        <div className="mb-8" dir="rtl">
          <h1 className="text-4xl font-bold mb-3">
            {chapterTitle}
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            {book.title}
          </p>
          <p className="text-muted-foreground">
            {chapterDescription} مع شرح تفصيلي وأمثلة تطبيقية
          </p>
        </div>

        {/* Chapter Statistics */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">عدد الدروس</p>
                <p className="text-2xl font-bold">{chapterLessons.length}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">وقت القراءة المتوقع</p>
                <p className="text-2xl font-bold">
                  {chapterLessons.reduce((total, lesson) => total + lesson.estimatedReadTime, 0)} دقيقة
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">مستوى الصعوبة</p>
                <p className="text-2xl font-bold">متوسط</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lessons List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4" dir="rtl">دروس الفصل</h2>
          
          {chapterLessons.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">لم يتم إضافة دروس لهذا الفصل بعد</p>
                <Link 
                  to={`/book/${book.id}`}
                  className="text-primary hover:underline mt-2 inline-block"
                >
                  انتقل إلى الكتاب الكامل
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {chapterLessons.map((lesson, index) => (
                <Card key={lesson.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1" dir="rtl">
                        <CardTitle className="text-xl mb-2">
                          <Link 
                            to={`/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`}
                            className="hover:text-primary transition-colors"
                          >
                            {lesson.title}
                          </Link>
                        </CardTitle>
                        <CardDescription className="mb-3">
                          {lesson.metaDescription}
                        </CardDescription>
                        
                        {/* Lesson Metadata */}
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            درس {lesson.lessonNumber}
                          </Badge>
                          <Badge variant="outline">
                            {lesson.estimatedReadTime} دقيقة
                          </Badge>
                          <Badge 
                            variant={
                              lesson.difficultyLevel === 'beginner' ? 'default' :
                              lesson.difficultyLevel === 'intermediate' ? 'secondary' : 'destructive'
                            }
                          >
                            {lesson.difficultyLevel === 'beginner' ? 'مبتدئ' : 
                             lesson.difficultyLevel === 'intermediate' ? 'متوسط' : 'متقدم'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="flex flex-wrap gap-2" dir="rtl">
                      {lesson.arabicKeywords.slice(0, 4).map((keyword, idx) => (
                        <span 
                          key={idx}
                          className="text-xs bg-muted px-2 py-1 rounded-md"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Navigation to Book */}
        <div className="mt-8 text-center">
          <Link 
            to={`/book/${book.id}`}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            تصفح الكتاب كاملاً
          </Link>
        </div>
      </div>
    </div>
  );
}