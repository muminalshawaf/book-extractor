import BookViewer from "@/components/BookViewer";

const Index = () => {
  const pages = [
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-1.jpg", alt: "صفحة كتاب الكيمياء 1" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-2.jpg", alt: "صفحة كتاب الكيمياء 2" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-3.jpg", alt: "صفحة كتاب الكيمياء 3" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-4.jpg", alt: "صفحة كتاب الكيمياء 4" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-5.jpg", alt: "صفحة كتاب الكيمياء 5" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-6.jpg", alt: "صفحة كتاب الكيمياء 6" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-7.jpg", alt: "صفحة كتاب الكيمياء 7" },
    { src: "https://ksa.idros.ai/books/chem12-1-3/a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8-8.jpg", alt: "صفحة كتاب الكيمياء 8" },
  ];

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
            تصفح صفحات كتابك صفحة بصفحة، ودون ملاحظاتك على الهامش. استخدم مفاتيح الأسهم للتنقل.
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
