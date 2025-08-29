import { useEffect, useMemo, useState } from "react";
import BookViewer from "@/components/BookViewer";
import { books, getBookById } from "@/data/books";

import { useNavigate, useParams, Link } from "react-router-dom";
import TopSearchTabs from "@/components/search/TopSearchTabs";
import SEOBreadcrumb from "@/components/SEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";
const Index = () => {
  const params = useParams();
  const navigate = useNavigate();
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
  const pages = useMemo(() => selectedBook.buildPages(), [selectedBook]);
  const rtl = selectedBook.rtl ?? true;
  // Update document title and meta description for each book
  useEffect(() => {
    document.title = `${selectedBook.title} | المنهج السعودي الصف الثاني عشر`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      const grade = selectedBook.grade || 12;
      const semester = selectedBook.semester || 1;
      const subject = selectedBook.subject === 'Physics' ? 'الفيزياء' : 
                     selectedBook.subject === 'Chemistry' ? 'الكيمياء' : 
                     selectedBook.subject === 'Mathematics' ? 'الرياضيات' : selectedBook.subject;
      meta.setAttribute('content', 
        `تصفح ${selectedBook.title} للصف ${grade} الفصل ${semester} مادة ${subject}. ملخصات ذكية لكل صفحة مع إمكانية البحث في المحتوى وكتابة الملاحظات التفاعلية.`
      );
    }
  }, [selectedBook]);

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
  return <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(jsonLd)
    }} />
      <SEOFAQSchema />
      <div className="container mx-auto py-4 px-3 md:py-6">
      <SEOBreadcrumb />
      <header className="mb-6">
          <h1 className="text-3xl font-bold mb-2 text-center" dir="rtl">
            {selectedBook.title}
          </h1>
          <p className="text-muted-foreground text-center mb-4" dir="rtl">
            تصفح الكتاب مع ملخصات ذكية لكل صفحة ومحرك بحث متقدم في المحتوى
          </p>
          <TopSearchTabs rtl={rtl} currentBookId={selectedBook.id} />
        </header>
        
        <main>
          <BookViewer key={selectedBook.id} bookId={selectedBook.id} pages={pages} title={selectedBook.title} rtl={rtl} labels={{
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
        }} />
        </main>
      </div>
    </>;
};
export default Index;