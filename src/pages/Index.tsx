import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getBookById } from "@/data/booksDbSource";
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
  const [currentBook, setCurrentBook] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load book from database or local data
  useEffect(() => {
    const loadBook = async () => {
      try {
        setLoading(true);
        const bookId = params.bookId;
        if (bookId) {
          const book = await getBookById(bookId);
          if (book) {
            setCurrentBook(book);
          } else {
            // Navigate to first available book
            navigate('/library', { replace: true });
          }
        } else {
          navigate('/library', { replace: true });
        }
      } catch (error) {
        console.error('Error loading book:', error);
        navigate('/library', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [params.bookId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>جاري تحميل الكتاب...</p>
        </div>
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p>لم يتم العثور على الكتاب المطلوب</p>
        </div>
      </div>
    );
  }

  const enhancedBook = getEnhancedBookById(currentBook.id);
  const pages = currentBook.buildPages();
  
  // Get current page number from URL params for SEO
  const currentPageNumber = parseInt(searchParams.get('page') || '1');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Book", "EducationalResource"],
    name: currentBook.title,
    description: `كتاب ${currentBook.title} للصف ${currentBook.grade || 12} الفصل ${currentBook.semester_range || 1} - المنهج السعودي مع ملخصات ذكية وبحث متقدم`,
    educationalLevel: `الصف ${currentBook.grade || 12}`,
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
      name: currentBook.subject === 'Physics' ? 'الفيزياء' : 
             currentBook.subject === 'Chemistry' ? 'الكيمياء' : 
             currentBook.subject === 'Mathematics' ? 'الرياضيات' : 
             currentBook.subject_ar || currentBook.subject
    },
    keywords: [
      "المنهج السعودي",
      `الصف ${currentBook.grade || 12}`,
      `الفصل ${currentBook.semester_range || 1}`,
      currentBook.subject === 'Physics' ? 'الفيزياء' : 
      currentBook.subject === 'Chemistry' ? 'الكيمياء' : 
      currentBook.subject === 'Mathematics' ? 'الرياضيات' : 
      currentBook.subject_ar || currentBook.subject,
      "ملخصات",
      "شرح",
      "تعليم"
    ].filter(Boolean)
  } as const;
  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced SEO Components */}
      <DynamicSEOHead 
        book={enhancedBook} 
        pageNumber={currentPageNumber}
        pageTitle={currentBook.title}
        totalPages={pages.length}
      />
      <StructuredDataSchemas book={enhancedBook} pageNumber={currentPageNumber} />
      <SEOFAQSchema />
      <EnhancedSEOBreadcrumb book={enhancedBook} pageNumber={currentPageNumber} />
      
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" dir="rtl">
            {currentBook.title}
          </h1>
          <p className="text-muted-foreground mb-4" dir="rtl">
            {enhancedBook.description || currentBook.description || "كتب المنهج السعودي للمملكة العربية السعودية - اكتشف محتوى الكتاب مع الملخصات الذكية والبحث المتقدم"}
          </p>
          <TopSearchTabs currentBookId={currentBook.id} />
        </div>

        <BookViewer
          bookId={currentBook.id}
          pages={pages}
          title={currentBook.title}
          rtl={true}
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