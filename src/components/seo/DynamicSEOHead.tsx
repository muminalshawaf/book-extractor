import { useEffect } from 'react';
import { EnhancedBookDef, LessonData } from '@/data/enhancedBooks';

interface DynamicSEOHeadProps {
  book?: EnhancedBookDef;
  lesson?: LessonData;
  pageNumber?: number;
  pageTitle?: string;
  customTitle?: string;
  customDescription?: string;
  noindex?: boolean;
  totalPages?: number;
}

export default function DynamicSEOHead({ 
  book, 
  lesson, 
  pageNumber, 
  pageTitle, 
  customTitle, 
  customDescription,
  noindex = false,
  totalPages
}: DynamicSEOHeadProps) {
  
  useEffect(() => {
    // Generate dynamic title
    let title = "";
    if (customTitle) {
      title = `${customTitle} | منصة إدرس`;
    } else if (lesson && book) {
      title = `${lesson.title} - ${book.subjectArabic} ${book.grade} | منصة إدرس`;
    } else if (pageTitle && book) {
      title = `${pageTitle} - صفحة ${pageNumber} | ${book.title} | منصة إدرس`;
    } else if (book) {
      title = `${book.title} | ${book.subjectArabic} الصف ${book.grade} | منصة إدرس`;
    } else {
      title = "منصة إدرس - كتب المنهج السعودي الرقمية";
    }
    
    // Generate dynamic description
    let description = "";
    if (customDescription) {
      description = customDescription;
    } else if (lesson) {
      description = lesson.metaDescription;
    } else if (book) {
      description = `${book.description}. اكتشف المحتوى التفاعلي مع الملخصات الذكية والبحث المتقدم.`;
    } else {
      description = "منصة إدرس التعليمية توفر كتب المنهج السعودي الرقمية للصف الثاني عشر في الفيزياء والكيمياء والرياضيات مع ملخصات ذكية وبحث متقدم";
    }
    
    // Update document title and meta tags
    document.title = title;
    
    // Update or create meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description);
    } else {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      metaDesc.setAttribute('content', description);
      document.head.appendChild(metaDesc);
    }
    
    // Update or create Open Graph tags
    updateOrCreateMetaTag('property', 'og:title', title);
    updateOrCreateMetaTag('property', 'og:description', description);
    updateOrCreateMetaTag('property', 'og:type', lesson ? 'article' : 'website');
    
    // Dynamic og:image and twitter:image based on page
    const imageUrl = book ? `${window.location.origin}/api/og-image?book=${encodeURIComponent(book.title)}&page=${pageNumber || 1}` : `${window.location.origin}/og-default.jpg`;
    updateOrCreateMetaTag('property', 'og:image', imageUrl);
    updateOrCreateMetaTag('name', 'twitter:image', imageUrl);
    
    // Update Twitter tags
    updateOrCreateMetaTag('name', 'twitter:title', title);
    updateOrCreateMetaTag('name', 'twitter:description', description);
    updateOrCreateMetaTag('name', 'twitter:card', 'summary_large_image');
    
    // Robots meta tag for noindex
    if (noindex) {
      updateOrCreateMetaTag('name', 'robots', 'noindex, nofollow');
    } else {
      // Remove noindex if it exists
      const robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag) robotsTag.remove();
    }
    
    // Add hreflang for Arabic
    const hreflangAr = document.querySelector('link[hreflang="ar"]') || document.createElement('link');
    hreflangAr.setAttribute('rel', 'alternate');
    hreflangAr.setAttribute('hreflang', 'ar');
    hreflangAr.setAttribute('href', window.location.href);
    if (!document.head.contains(hreflangAr)) {
      document.head.appendChild(hreflangAr);
    }
    
    const hreflangArSA = document.querySelector('link[hreflang="ar-SA"]') || document.createElement('link');
    hreflangArSA.setAttribute('rel', 'alternate');
    hreflangArSA.setAttribute('hreflang', 'ar-SA');
    hreflangArSA.setAttribute('href', window.location.href);
    if (!document.head.contains(hreflangArSA)) {
      document.head.appendChild(hreflangArSA);
    }
    
    // Add prev/next pagination links
    if (book && pageNumber && totalPages) {
      // Remove existing prev/next links
      document.querySelectorAll('link[rel="prev"], link[rel="next"]').forEach(link => link.remove());
      
      if (pageNumber > 1) {
        const prevLink = document.createElement('link');
        prevLink.setAttribute('rel', 'prev');
        prevLink.setAttribute('href', `${window.location.origin}/book/${book.id}?page=${pageNumber - 1}`);
        document.head.appendChild(prevLink);
      }
      
      if (pageNumber < totalPages) {
        const nextLink = document.createElement('link');
        nextLink.setAttribute('rel', 'next');
        nextLink.setAttribute('href', `${window.location.origin}/book/${book.id}?page=${pageNumber + 1}`);
        document.head.appendChild(nextLink);
      }
    }
    
    // Add canonical URL
    const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    if (lesson && book) {
      canonical.setAttribute('href', `${window.location.origin}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`);
    } else if (book && pageNumber) {
      canonical.setAttribute('href', `${window.location.origin}/book/${book.id}?page=${pageNumber}`);
    } else {
      canonical.setAttribute('href', window.location.href);
    }
    if (!document.head.contains(canonical)) {
      document.head.appendChild(canonical);
    }
    
  }, [book, lesson, pageNumber, pageTitle, customTitle, customDescription, noindex, totalPages]);
  
  const updateOrCreateMetaTag = (attribute: string, value: string, content: string) => {
    let tag = document.querySelector(`meta[${attribute}="${value}"]`);
    if (tag) {
      tag.setAttribute('content', content);
    } else {
      tag = document.createElement('meta');
      tag.setAttribute(attribute, value);
      tag.setAttribute('content', content);
      document.head.appendChild(tag);
    }
  };
  
  return null; // This component doesn't render anything
}