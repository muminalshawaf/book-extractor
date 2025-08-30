import { BookPage } from "@/components/BookViewer";

export interface LessonData {
  id: string;
  title: string;
  slug: string;
  unitNumber: number;
  chapterNumber: number;
  lessonNumber: number;
  arabicKeywords: string[];
  englishKeywords: string[];
  metaDescription: string;
  contentType: 'lesson' | 'exercise' | 'review' | 'introduction';
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  estimatedReadTime: number;
}

export interface EnhancedBookDef {
  id: string;
  title: string;
  slug: string;
  rtl?: boolean;
  grade?: number;
  semester?: number;
  subject?: string;
  subjectArabic?: string;
  cover?: string;
  keywords?: string[];
  description?: string;
  totalPages?: number;
  buildPages: () => BookPage[];
  lessons?: LessonData[];
}

export const enhancedBooks: EnhancedBookDef[] = [
  {
    id: "chem12-1-3",
    title: "كتاب الكيمياء 12 (الفصل 1–3)",
    slug: "chemistry-3",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Chemistry",
    subjectArabic: "كيمياء",
    cover: "/placeholder.svg",
    totalPages: 178,
    description: "كتاب الكيمياء للصف الثاني عشر - نظام المسارات، يغطي الفصول الدراسية الأول والثاني والثالث، مع شرح تفصيلي للمركبات العضوية والتفاعلات الكيميائية",
    keywords: ["كيمياء", "Chemistry", "Grade 12", "Semester 1-3", "نظام المسارات", "المركبات العضوية", "التفاعلات الكيميائية"],
    buildPages: () => {
      const baseUrl = "https://ksa.idros.ai/books/chem12-1-3/";
      return Array.from({ length: 178 }, (_, i) => ({
        src: `${baseUrl}kitab-alkimya-3-${i + 2}.webp`,
        alt: `صفحة كتاب الكيمياء ${i + 1}`,
      }));
    },
    lessons: [
      {
        id: "chem12-1-1-intro",
        title: "مقدمة في المركبات العضوية",
        slug: "مقدمة-في-المركبات-العضوية",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 1,
        arabicKeywords: ["كيمياء عضوية", "مركبات الكربون", "روابط تساهمية"],
        englishKeywords: ["organic chemistry", "carbon compounds", "covalent bonds"],
        metaDescription: "شرح تفصيلي لمقدمة في المركبات العضوية وخصائص مركبات الكربون في كيمياء الصف الثاني عشر",
        contentType: "lesson",
        difficultyLevel: "beginner",
        estimatedReadTime: 15
      },
      {
        id: "chem12-1-1-alkanes",
        title: "الألكانات - الهيدروكربونات المشبعة",
        slug: "الألكانات",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 2,
        arabicKeywords: ["ألكانات", "هيدروكربونات مشبعة", "ميثان", "إيثان", "بروبان"],
        englishKeywords: ["alkanes", "saturated hydrocarbons", "methane", "ethane", "propane"],
        metaDescription: "حلول وتمارين درس الألكانات - الهيدروكربونات المشبعة لمادة كيمياء 3. شرح بالفيديو وأمثلة تفاعلية لمساعدتك على فهم المنهج السعودي.",
        contentType: "lesson",
        difficultyLevel: "intermediate", 
        estimatedReadTime: 25
      },
      {
        id: "chem12-1-1-hydrocarbons",
        title: "شرح درس الهيدروكربونات",
        slug: "lesson-3-hydrocarbons",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 3,
        arabicKeywords: ["هيدروكربونات", "ألكينات", "ألكاينات", "بنزين", "مركبات عطرية"],
        englishKeywords: ["hydrocarbons", "alkenes", "alkynes", "benzene", "aromatic compounds"],
        metaDescription: "حلول وتمارين درس الهيدروكربونات لمادة كيمياء 3. شرح بالفيديو وأمثلة تفاعلية لمساعدتك على فهم المنهج السعودي.",
        contentType: "lesson", 
        difficultyLevel: "intermediate",
        estimatedReadTime: 30
      },
      {
        id: "chem12-1-1-reactions",
        title: "تفاعلات المركبات العضوية",
        slug: "تفاعلات-المركبات-العضوية",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 4,
        arabicKeywords: ["تفاعلات عضوية", "احتراق", "هلجنة", "أكسدة"],
        englishKeywords: ["organic reactions", "combustion", "halogenation", "oxidation"],
        metaDescription: "شرح تفصيلي لتفاعلات المركبات العضوية وآليات التفاعل في كيمياء الصف الثاني عشر",
        contentType: "lesson",
        difficultyLevel: "advanced",
        estimatedReadTime: 20
      }
    ]
  },
  {
    id: "physics12-1-3",
    title: "كتاب الفيزياء 12 (الفصل 1–3)",
    slug: "physics-3",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Physics",
    subjectArabic: "فيزياء",
    cover: "/placeholder.svg",
    totalPages: 315,
    description: "كتاب الفيزياء للصف الثاني عشر - نظام المسارات، يشمل دراسة الحركة والقوى والطاقة والكهرباء والمغناطيسية",
    keywords: ["فيزياء", "Physics", "Grade 12", "Semester 1-3", "نظام المسارات", "الحركة", "القوى", "الطاقة"],
    buildPages: () => {
      const baseUrl = "https://ksa.idros.ai/books/physics12-1-3/";
      return Array.from({ length: 315 }, (_, i) => ({
        src: `${baseUrl}kitab-alfizya3-12025-${i + 2}.webp`,
        alt: `صفحة كتاب الفيزياء ${i + 2}`,
      }));
    },
    lessons: [
      {
        id: "physics12-1-3-motion",
        title: "الحركة في خط مستقيم",
        slug: "الحركة-في-خط-مستقيم",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 1,
        arabicKeywords: ["حركة", "سرعة", "تسارع", "إزاحة"],
        englishKeywords: ["motion", "velocity", "acceleration", "displacement"],
        metaDescription: "شرح مفصل لدرس الحركة في خط مستقيم وقوانين الحركة في فيزياء الصف الثاني عشر",
        contentType: "lesson",
        difficultyLevel: "intermediate",
        estimatedReadTime: 20
      }
    ]
  },
  {
    id: "math12-1-3",
    title: "كتاب الرياضيات 12 (الفصل 1–3)",
    slug: "mathematics-3",
    rtl: true,
    grade: 12,
    semester: 1,
    subject: "Mathematics",
    subjectArabic: "رياضيات",
    cover: "/placeholder.svg",
    totalPages: 213,
    description: "كتاب الرياضيات للصف الثاني عشر - نظام المسارات، يغطي التفاضل والتكامل والهندسة والإحصاء",
    keywords: ["رياضيات", "Mathematics", "Grade 12", "Semester 1-3", "نظام المسارات", "تفاضل", "تكامل", "هندسة"],
    buildPages: () => {
      const baseUrl = "https://www.ksa.idros.ai/books/math12-1-3/";
      return Array.from({ length: 213 }, (_, i) => ({
        src: `${baseUrl}math12-3-1-${i + 2}.webp`,
        alt: `صفحة كتاب الرياضيات ${i + 2}`,
      }));
    },
    lessons: [
      {
        id: "math12-1-3-calculus",
        title: "مقدمة في التفاضل",
        slug: "مقدمة-في-التفاضل",
        unitNumber: 1,
        chapterNumber: 1,
        lessonNumber: 1,
        arabicKeywords: ["تفاضل", "مشتقة", "دوال", "حدود"],
        englishKeywords: ["calculus", "derivative", "functions", "limits"],
        metaDescription: "شرح مبسط لمقدمة في التفاضل والمشتقات في رياضيات الصف الثاني عشر",
        contentType: "lesson",
        difficultyLevel: "advanced",
        estimatedReadTime: 25
      }
    ]
  },
];

export function getEnhancedBookById(id: string): EnhancedBookDef {
  return enhancedBooks.find((b) => b.id === id) ?? enhancedBooks[0];
}

export function getBookBySlug(slug: string): EnhancedBookDef | null {
  return enhancedBooks.find((b) => b.slug === slug) ?? null;
}

export function getLessonBySlug(bookSlug: string, lessonSlug: string): { book: EnhancedBookDef, lesson: LessonData } | null {
  const book = getBookBySlug(bookSlug);
  if (!book || !book.lessons) return null;
  
  const lesson = book.lessons.find(l => l.slug === lessonSlug);
  if (!lesson) return null;
  
  return { book, lesson };
}