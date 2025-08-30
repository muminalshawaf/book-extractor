import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { books, getBookById } from "@/data/books";
import { getEnhancedBookById } from "@/data/enhancedBooks";
import BookViewer from "@/components/BookViewer";
import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";
import TopSearchTabs from "@/components/search/TopSearchTabs";
const Index = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = useMemo(() => params.bookId ?? books[0].id, [params.bookId]);
  const [selectedId, setSelectedId] = useState<string>(initialId);
  
  useEffect(() => {
    if (selectedId !== initialId) setSelectedId(initialId);
  }, [initialId]);
  
  useEffect(() => {
    if (params.bookId && !books.some(b => b.id === params.bookId)) {
      navigate(`/book/${books[0].id}`, {
        replace: true
      });
    }
  }, [params.bookId, navigate]);
  
  const selectedBook = useMemo(() => getBookById(selectedId), [selectedId]);
  const enhancedBook = useMemo(() => getEnhancedBookById(selectedId), [selectedId]);
  const pages = useMemo(() => selectedBook.buildPages(), [selectedBook]);
  
  // Get current page number from URL params for SEO
  const currentPageNumber = parseInt(searchParams.get('page') || '1');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Book", "EducationalResource"],
    name: selectedBook.title,
    description: `كتاب ${selectedBook.title} للصف ${selectedBook.grade || 12} الفصل ${selectedBook.semester || 1} - المنهج السعودي مع ملخصات ذكية وبحث متقدم`,
    educationalLevel: `الصف ${selectedBook.grade || 12}`,
    educationalUse: "دراسة ذاتية، تعلم، مراجعة",
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
      audienceType: "طلاب الثانوية العامة السعودية"
    },
    inLanguage: "ar-SA",
    publisher: {
      "@type": "Organization", 
      name: "المنهج",
      url: window.location.origin
    },
    about: {
      "@type": "Thing",
      name: selectedBook.subject === 'Physics' ? 'الفيزياء' : 
             selectedBook.subject === 'Chemistry' ? 'الكيمياء' : 
             selectedBook.subject === 'Mathematics' ? 'الرياضيات' : selectedBook.subject
    },
    keywords: [
      "المنهج السعودي",
      `الصف ${selectedBook.grade || 12}`,
      `الفصل ${selectedBook.semester || 1}`,
      selectedBook.subject === 'Physics' ? 'الفيزياء' : 
      selectedBook.subject === 'Chemistry' ? 'الكيمياء' : 
      selectedBook.subject === 'Mathematics' ? 'الرياضيات' : selectedBook.subject,
      "ملخصات",
      "شرح",
      "تعليم",
      ...(selectedBook.keywords || [])
    ].filter(Boolean)
  } as const;
  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced SEO Components */}
      <DynamicSEOHead 
        book={enhancedBook} 
        pageNumber={currentPageNumber}
        pageTitle={selectedBook.title}
        totalPages={pages.length}
      />
      <StructuredDataSchemas book={enhancedBook} pageNumber={currentPageNumber} />
      <SEOFAQSchema />
      <EnhancedSEOBreadcrumb book={enhancedBook} pageNumber={currentPageNumber} />
      
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" dir="rtl">
            {selectedBook.title}
          </h1>
          <p className="text-muted-foreground mb-4" dir="rtl">
            {enhancedBook.description || "اكتشف محتوى الكتاب مع الملخصات الذكية والبحث المتقدم"}
          </p>
          <TopSearchTabs currentBookId={selectedBook.id} />
        </div>

        <BookViewer
          bookId={selectedBook.id}
          pages={pages}
          title={selectedBook.title}
          rtl={selectedBook.rtl}
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

        {/* Enhanced Navigation */}
        {enhancedBook.lessons && enhancedBook.lessons.length > 0 && (
          <div className="mt-8 p-4 bg-muted/30 rounded-lg border">
            <h2 className="text-lg font-semibold mb-3" dir="rtl">
              الدروس المتاحة في هذا الكتاب:
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {enhancedBook.lessons.slice(0, 6).map((lesson) => (
                <Link 
                  key={lesson.id}
                  to={`/${enhancedBook.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`}
                  className="block p-3 bg-background rounded border hover:shadow-md transition-all"
                >
                  <div dir="rtl">
                    <h3 className="font-medium text-sm mb-1">{lesson.title}</h3>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {lesson.metaDescription}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        الفصل {lesson.chapterNumber}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {lesson.estimatedReadTime} دقيقة
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            
            {enhancedBook.lessons.length > 6 && (
              <div className="mt-4 text-center">
                <Link 
                  to={`/${enhancedBook.slug}/الفصل-1`}
                  className="text-primary hover:underline text-sm"
                >
                  عرض جميع الدروس ({enhancedBook.lessons.length})
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;