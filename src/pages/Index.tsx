import BookViewer from "@/components/BookViewer";
import page1 from "@/assets/book/page-1.jpg";
import page2 from "@/assets/book/page-2.jpg";
import page3 from "@/assets/book/page-3.jpg";
import page4 from "@/assets/book/page-4.jpg";

const Index = () => {
  const pages = [
    { src: page1, alt: "صفحة كتاب الكيمياء 1" },
    { src: page2, alt: "صفحة كتاب الكيمياء 2" },
    { src: page3, alt: "صفحة كتاب الكيمياء 3" },
    { src: page4, alt: "صفحة كتاب الكيمياء 4" },
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
