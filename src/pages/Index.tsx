import BookViewer from "@/components/BookViewer";

const Index = () => {
  // External chemistry book pages
  const baseUrl = "https://ksa.idros.ai/books/chem12-1-3/";
  const pageId = "a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8";
  
  const pages = Array.from({ length: 8 }, (_, i) => ({
    src: `${baseUrl}${pageId}-${i + 1}.jpg`,
    alt: `صفحة كتاب الكيمياء ${i + 1}`
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: "عارض كتاب تفاعلي",
    description: "تصفح صفحات الكتاب مع كتابة ملاحظات بجانب كل صفحة.",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container mx-auto py-10">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">عارض كتاب تفاعلي</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            تصفح صفحات كتابك، وسيتم تلخيص كل صفحة تلقائيًا، ثم اسأل الذكاء الاصطناعي في الأسفل.
          </p>
        </header>
        
        <main>
          <BookViewer
            pages={pages}
            title="كتاب تجريبي"
            rtl={true}
            labels={{
              previous: "السابق",
              next: "التالي",
              notesTitle: (n) => `ملاحظات للصفحة ${n}`,
              autosaves: "حفظ تلقائي محلي",
              clear: "مسح",
              copy: "نسخ",
              toastCopied: "تم نسخ الملاحظة إلى الحافظة",
              toastCopyFailed: "تعذّر نسخ الملاحظة",
              toastCleared: "تم مسح الملاحظات لهذه الصفحة",
              progress: (c, t, p) => `الصفحة ${c} من ${t} • ${p}%`,
            }}
          />
        </main>
      </div>
    </>
  );
};

export default Index;
