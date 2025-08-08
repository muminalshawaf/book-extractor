import BookViewer from "@/components/BookViewer";
import page1 from "@/assets/book/page-1.jpg";
import page2 from "@/assets/book/page-2.jpg";
import page3 from "@/assets/book/page-3.jpg";
import page4 from "@/assets/book/page-4.jpg";

const Index = () => {
  const pages = [
    { src: page1, alt: "Book page 1 - chapter introduction with serif text" },
    { src: page2, alt: "Book page 2 - continuing text with pull quote" },
    { src: page3, alt: "Book page 3 - section heading and paragraph" },
    { src: page4, alt: "Book page 4 - illustrated margin with text" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: "Interactive Book Viewer",
    description: "Flip through book pages and write notes alongside each page.",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container mx-auto py-10">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Interactive Book Viewer</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            Flip through your book page by page and keep organized notes on the side. Use the
            arrow keys for navigation.
          </p>
        </header>
        <main>
          <BookViewer pages={pages} title="Sample Book" />
        </main>
      </div>
    </>
  );
};

export default Index;
