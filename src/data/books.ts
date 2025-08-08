import { BookPage } from "@/components/BookViewer";
import page1 from "@/assets/book/page-1.jpg";
import page2 from "@/assets/book/page-2.jpg";
import page3 from "@/assets/book/page-3.jpg";
import page4 from "@/assets/book/page-4.jpg";

export interface BookDef {
  id: string;
  title: string;
  rtl?: boolean;
  buildPages: () => BookPage[];
}

export const books: BookDef[] = [
  {
    id: "chem12-1-3",
    title: "كتاب الكيمياء 12 (الفصل 1–3)",
    rtl: true,
    buildPages: () => {
      const baseUrl = "https://ksa.idros.ai/books/chem12-1-3/";
      const pageId = "a4dbe8ea-af1b-4a97-a5f9-2880bc655ae8";
      return Array.from({ length: 177 }, (_, i) => ({
        src: `${baseUrl}${pageId}-${i + 1}.jpg`,
        alt: `صفحة كتاب الكيمياء ${i + 1}`,
      }));
    },
  },
  {
    id: "sample-local",
    title: "كتاب عينة مصوّر",
    rtl: true,
    buildPages: () => [
      { src: page1, alt: "صفحة عينة 1" },
      { src: page2, alt: "صفحة عينة 2" },
      { src: page3, alt: "صفحة عينة 3" },
      { src: page4, alt: "صفحة عينة 4" },
    ],
  },
];

export function getBookById(id: string): BookDef {
  return books.find((b) => b.id === id) ?? books[0];
}
