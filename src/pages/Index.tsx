import { useEffect, useMemo, useState } from "react";
import BookViewer from "@/components/BookViewer";
import { books, getBookById } from "@/data/books";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, useParams, Link } from "react-router-dom";
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
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: selectedBook.title,
    description: "تصفح عدة كتب، سيتم حفظ OCR والملخصات لكل كتاب على حدة."
  } as const;
  return <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(jsonLd)
    }} />
      <div className="container mx-auto py-4 px-3 md:py-10">
      <header className="mb-8 text-center hidden md:block">
          <div className="mt-4 flex items-center justify-center">
            <Link to="/library" className="inline-flex">
              <button className="inline-flex items-center h-10 px-4 rounded-md border bg-background hover:bg-muted transition text-sm">
                تصفح المكتبة
              </button>
            </Link>
          </div>
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