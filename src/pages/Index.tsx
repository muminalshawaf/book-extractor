import { useState } from "react";
import BookViewer from "@/components/BookViewer";
import ImageUploader, { UploadedImage } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { BookOpen, Upload } from "lucide-react";

const Index = () => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  // External chemistry book pages
  const baseUrl = "https://ksa.idros.ai/books/chem12-1-3/";
  const pageId = "a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8";
  
  const defaultPages = Array.from({ length: 8 }, (_, i) => ({
    src: `${baseUrl}${pageId}-${i + 1}.jpg`,
    alt: `صفحة كتاب الكيمياء ${i + 1}`
  }));

  // Use uploaded images if available, otherwise use default pages
  const pages = uploadedImages.length > 0 
    ? uploadedImages.map(img => ({ src: img.src, alt: img.alt }))
    : defaultPages;

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
          <div className="mt-4 flex justify-center gap-3">
            <Button 
              variant={showUploader ? "secondary" : "default"}
              onClick={() => setShowUploader(!showUploader)}
              className="flex items-center gap-2"
            >
              {showUploader ? <BookOpen className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {showUploader ? "عرض الكتاب" : "رفع صور جديدة"}
            </Button>
          </div>
        </header>
        
        {showUploader ? (
          <div className="max-w-4xl mx-auto">
            <ImageUploader 
              onImagesChange={setUploadedImages} 
              rtl={true}
            />
            {uploadedImages.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={() => setShowUploader(false)}>
                  ابدأ قراءة الكتاب ({uploadedImages.length} صفحة)
                </Button>
              </div>
            )}
          </div>
        ) : (
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
        )}
      </div>
    </>
  );
};

export default Index;
