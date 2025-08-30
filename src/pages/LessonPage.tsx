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
    
    // Decode URL parameters in case they contain encoded Arabic characters
    const decodedBookSlug = decodeURIComponent(bookSlug);
    const decodedLessonSlug = decodeURIComponent(lessonSlug);
    
    console.log('Original lessonSlug:', lessonSlug);
    console.log('Decoded lessonSlug:', decodedLessonSlug);
    
    return getLessonBySlug(decodedBookSlug, decodedLessonSlug);
  }, [bookSlug, lessonSlug]);

  if (!lessonData) {
    return <Navigate to="/library" replace />;
  }

  const { book, lesson } = lessonData;
  const pages = book.buildPages();

  // Calculate estimated page number based on lesson data  
  const estimatedPageNumber = lesson.pageNumber;

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
      </div>
    </div>
  );
}