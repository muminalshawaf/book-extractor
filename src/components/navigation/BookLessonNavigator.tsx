import { Link } from "react-router-dom";
import { enhancedBooks } from "@/data/enhancedBooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight } from "lucide-react";

interface BookLessonNavigatorProps {
  currentBookId?: string;
}

/**
 * Enhanced navigation component showing semantic lesson URLs
 * and improved user experience for lesson discovery
 */
export const BookLessonNavigator: React.FC<BookLessonNavigatorProps> = ({ currentBookId }) => {
  const featuredLessons = enhancedBooks.flatMap(book => 
    (book.lessons || []).slice(0, 2).map(lesson => ({ book, lesson }))
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2" dir="rtl">الدروس المميزة</h2>
        <p className="text-muted-foreground" dir="rtl">
          اكتشف الدروس التفاعلية مع شرح مفصل وأمثلة تطبيقية
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {featuredLessons.map(({ book, lesson }) => (
          <Card key={lesson.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1" dir="rtl">
                  <CardTitle className="text-lg mb-1">
                    {lesson.title}
                  </CardTitle>
                  <CardDescription className="mb-2">
                    {book.subjectArabic} - الفصل {lesson.chapterNumber}
                  </CardDescription>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary">
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
              <p className="text-sm text-muted-foreground mb-4" dir="rtl">
                {lesson.metaDescription}
              </p>
              
              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1">
                  <Link to={`/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`}>
                    <BookOpen className="h-4 w-4 ml-2" />
                    ابدأ الدرس
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/${book.slug}/الفصل-${lesson.chapterNumber}`}>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              
              {/* Keywords */}
              <div className="mt-3 flex flex-wrap gap-1" dir="rtl">
                {lesson.arabicKeywords.slice(0, 3).map((keyword, idx) => (
                  <span 
                    key={idx}
                    className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Call to Action */}
      <div className="text-center">
        <Button asChild variant="outline" size="lg">
          <Link to="/library">
            <BookOpen className="h-5 w-5 ml-2" />
            تصفح جميع الكتب
          </Link>
        </Button>
      </div>
    </div>
  );
};