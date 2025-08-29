import { useEffect } from 'react';
import { EnhancedBookDef, LessonData } from '@/data/enhancedBooks';

interface DynamicSEOHeadProps {
  book?: EnhancedBookDef;
  lesson?: LessonData;
  pageNumber?: number;
  pageTitle?: string;
  customTitle?: string;
  customDescription?: string;
}

export default function DynamicSEOHead({ 
  book, 
  lesson, 
  pageNumber, 
  pageTitle, 
  customTitle, 
  customDescription 
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
    
    // Update Twitter tags
    updateOrCreateMetaTag('name', 'twitter:title', title);
    updateOrCreateMetaTag('name', 'twitter:description', description);
    
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
    
  }, [book, lesson, pageNumber, pageTitle, customTitle, customDescription]);
  
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