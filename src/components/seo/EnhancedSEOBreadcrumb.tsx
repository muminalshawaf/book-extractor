import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { enhancedBooks, EnhancedBookDef, LessonData } from "@/data/enhancedBooks";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface EnhancedSEOBreadcrumbProps {
  book?: EnhancedBookDef;
  lesson?: LessonData;
  pageNumber?: number;
}

export default function EnhancedSEOBreadcrumb({ book, lesson, pageNumber }: EnhancedSEOBreadcrumbProps) {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "الرئيسية", href: "/" }
  ];
  
  // Handle different URL patterns
  if (pathSegments[0] === 'library') {
    breadcrumbs.push({ label: "المكتبة" });
  } else if (pathSegments[0] === 'book' && pathSegments[1]) {
    // Old URL format: /book/book-id
    breadcrumbs.push({ label: "المكتبة", href: "/library" });
    const foundBook = enhancedBooks.find(b => b.id === pathSegments[1]);
    if (foundBook) {
      breadcrumbs.push({ 
        label: foundBook.title,
        href: `/book/${foundBook.id}`
      });
      if (pageNumber) {
        breadcrumbs.push({ label: `صفحة ${pageNumber}` });
      }
    }
  } else if (book) {
    // New URL format: /book-slug/chapter/lesson-slug
    breadcrumbs.push({ label: "المكتبة", href: "/library" });
    breadcrumbs.push({ 
      label: book.title,
      href: `/book/${book.id}`
    });
    
    if (lesson) {
      breadcrumbs.push({ 
        label: `الفصل ${lesson.chapterNumber}`,
        href: `/${book.slug}/الفصل-${lesson.chapterNumber}`
      });
      breadcrumbs.push({ label: lesson.title });
    }
  }
  
  if (breadcrumbs.length <= 1) return null;
  
  // Generate JSON-LD structured data for breadcrumbs
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${window.location.origin}${item.href}` : window.location.href
    }))
  };
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="مسار التنقل" className="mb-4">
        <ol className="flex items-center gap-2 text-sm text-muted-foreground" dir="rtl">
          {breadcrumbs.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              {index > 0 && <ChevronLeft className="h-4 w-4" />}
              {item.href ? (
                <Link 
                  to={item.href} 
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}