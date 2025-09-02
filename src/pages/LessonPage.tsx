import { useParams, Navigate } from "react-router-dom";
import { getLessonBySlug } from "@/data/enhancedBooks";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";
import BookViewer from "@/components/BookViewer";
import { useMemo } from "react";

export default function LessonPage() {
  const { bookSlug, chapterNumber, lessonSlug } = useParams<{
    bookSlug: string;
    chapterNumber: string;
    lessonSlug: string;
  }>();

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

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Components */}
      <DynamicSEOHead book={book} lesson={lesson} />
      <StructuredDataSchemas book={book} lesson={lesson} />
      <SEOFAQSchema />
      
      <div className="container mx-auto px-4 py-6">
        <EnhancedSEOBreadcrumb book={book} lesson={lesson} />
        
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" dir="rtl">
            {lesson.title}
          </h1>
          <p className="text-muted-foreground mb-4" dir="rtl">
            {lesson.metaDescription}
          </p>
          
          {/* Lesson Metadata */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground" dir="rtl">
            <span>📚 {book.subjectArabic}</span>
            <span>📖 الفصل {lesson.chapterNumber}</span>
            <span>⏱️ {lesson.estimatedReadTime} دقيقة</span>
            <span>📊 {lesson.difficultyLevel === 'beginner' ? 'مبتدئ' : lesson.difficultyLevel === 'intermediate' ? 'متوسط' : 'متقدم'}</span>
          </div>
        </div>

        {/* Book Viewer */}
        <BookViewer />
      </div>
    </div>
  );
}