import { useEffect, useMemo, useState } from "react";
import { SimpleBookViewer } from "@/components/reader/SimpleBookViewer";
import { books, getBookById } from "@/data/books";

import { useNavigate, useParams, Link } from "react-router-dom";
import TopSearchTabs from "@/components/search/TopSearchTabs";
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
      <div className="container mx-auto py-4 px-3 md:py-6">
      <header className="mb-6">
          <TopSearchTabs rtl={rtl} currentBookId={selectedBook.id} />
        </header>
        
        <main>
          <SimpleBookViewer 
            key={selectedBook.id} 
            bookId={selectedBook.id} 
            pages={pages} 
            title={selectedBook.title} 
            rtl={rtl} 
            labels={{
              previous: "السابق",
              next: "التالي",
              progress: (c, t, p) => `الصفحة ${c} من ${t} • ${p}%`
            }} 
          />
        </main>
      </div>
    </>;
};
export default Index;