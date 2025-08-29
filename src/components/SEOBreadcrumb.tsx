import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { books } from "@/data/books";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function SEOBreadcrumb() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "الرئيسية", href: "/" }
  ];
  
  if (pathSegments[0] === 'library') {
    breadcrumbs.push({ label: "المكتبة" });
  } else if (pathSegments[0] === 'book' && pathSegments[1]) {
    breadcrumbs.push({ label: "المكتبة", href: "/library" });
    const book = books.find(b => b.id === pathSegments[1]);
    if (book) {
      breadcrumbs.push({ label: book.title });
    }
  }
  
  if (breadcrumbs.length <= 1) return null;
  
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Thing",
        "@id": item.href ? `${window.location.origin}${item.href}` : window.location.href,
        name: item.label
      }
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
                  itemProp="item"
                >
                  <span itemProp="name">{item.label}</span>
                </Link>
              ) : (
                <span className="text-foreground font-medium" itemProp="name">
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