export interface BookPage {
  pageNumber: number;
  alt: string;
}

export interface BookDef {
  id: string;
  title: string;
  rtl?: boolean;
  grade?: number;
  semester?: number;
  subject?: string;
  cover?: string;
  keywords?: string[];
  pdfUrl: string;
  totalPages: number;
  buildPages: () => BookPage[];
}

export const books: BookDef[] = [
  {
    id: "chem12-1-3",
    title: "كتاب الكيمياء 12 (الفصل 1–3)",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Chemistry",
    cover: "/placeholder.svg",
    keywords: ["كيمياء", "Chemistry", "Grade 12", "Semester 1-3"],
    pdfUrl: "https://ksa.idros.ai/books/chem12-1-3/chemistry-12-1-3.pdf",
    totalPages: 177,
    buildPages: () => {
      return Array.from({ length: 177 }, (_, i) => ({
        pageNumber: i + 1,
        alt: `صفحة كتاب الكيمياء ${i + 1}`,
      }));
    },
  },
  {
    id: "physics12-1-3",
    title: "كتاب الفيزياء 12 (الفصل 1–3)",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Physics",
    cover: "/placeholder.svg",
    keywords: ["فيزياء", "Physics", "Grade 12", "Semester 1-3"],
    pdfUrl: "https://ksa.idros.ai/books/physics12-1-3/physics-12-1-3.pdf",
    totalPages: 217,
    buildPages: () => {
      return Array.from({ length: 217 }, (_, i) => ({
        pageNumber: i + 1,
        alt: `صفحة كتاب الفيزياء ${i + 1}`,
      }));
    },
  },
  {
    id: "math12-1-3",
    title: "كتاب الرياضيات 12 (الفصل 1–3)",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Mathematics",
    cover: "/placeholder.svg",
    keywords: ["رياضيات", "Mathematics", "Grade 12", "Semester 1-3"],
    pdfUrl: "/book/page-{page}.jpg", // Template for image-based pages
    totalPages: 4, // Updated to match available images
    buildPages: () => {
      return Array.from({ length: 4 }, (_, i) => ({
        pageNumber: i + 1,
        alt: `صفحة كتاب الرياضيات ${i + 1}`,
      }));
    },
  },
];

export function getBookById(id: string): BookDef {
  return books.find((b) => b.id === id) ?? books[0];
}
