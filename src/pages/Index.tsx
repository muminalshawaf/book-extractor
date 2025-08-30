import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { books, getBookById } from "@/data/books";
import { getEnhancedBookById } from "@/data/enhancedBooks";
import BookViewer from "@/components/BookViewer";
import { useMemo, useEffect, useState } from "react";
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
      </div>
    </div>
  );
};

export default Index;