import { EnhancedBookDef, LessonData } from '@/data/enhancedBooks';

interface StructuredDataSchemasProps {
  book?: EnhancedBookDef;
  lesson?: LessonData;
  pageNumber?: number;
  isLibraryPage?: boolean;
}

export default function StructuredDataSchemas({ 
  book, 
  lesson, 
  pageNumber, 
  isLibraryPage = false 
}: StructuredDataSchemasProps) {
  
  // Website Schema for main site
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "منصة إدرس",
    "alternateName": "Idros Platform",
    "url": window.location.origin,
    "description": "منصة إدرس التعليمية - كتب المنهج السعودي الرقمية مع ملخصات ذكية وبحث متقدم",
    "inLanguage": "ar-SA",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${window.location.origin}/library?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    },
    "sameAs": [
      "https://www.facebook.com/idrosplatform",
      "https://twitter.com/idrosplatform",
      "https://www.instagram.com/idrosplatform"
    ]
  };

  // Course Schema for individual books
  const courseSchema = book ? {
    "@context": "https://schema.org",
    "@type": "Course",
    "name": book.title,
    "description": book.description,
    "provider": {
      "@type": "Organization",
      "name": "منصة إدرس",
      "url": window.location.origin
    },
    "educationalLevel": `الصف ${book.grade}`,
    "teaches": book.subjectArabic,
    "inLanguage": "ar-SA",
    "courseCode": book.id,
    "numberOfCredits": book.semester,
    "timeRequired": `P${book.totalPages}D`,
    "keywords": book.keywords?.join(", "),
    "url": `${window.location.origin}/book/${book.id}`,
    "hasPart": book.lessons?.map(l => ({
      "@type": "LearningResource",
      "name": l.title,
      "description": l.metaDescription,
      "url": `${window.location.origin}/${book.slug}/الفصل-${l.chapterNumber}/${l.slug}`,
      "educationalLevel": l.difficultyLevel,
      "timeRequired": `PT${l.estimatedReadTime}M`,
      "learningResourceType": l.contentType,
      "teaches": l.arabicKeywords.join(", ")
    }))
  } : null;

  // Learning Resource Schema for individual lessons
  const learningResourceSchema = lesson && book ? {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    "name": lesson.title,
    "description": lesson.metaDescription,
    "url": `${window.location.origin}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`,
    "educationalLevel": lesson.difficultyLevel,
    "timeRequired": `PT${lesson.estimatedReadTime}M`,
    "learningResourceType": lesson.contentType,
    "teaches": lesson.arabicKeywords.join(", "),
    "inLanguage": "ar-SA",
    "isPartOf": {
      "@type": "Course",
      "name": book.title,
      "provider": {
        "@type": "Organization", 
        "name": "منصة إدرس"
      }
    },
    "author": {
      "@type": "Organization",
      "name": "وزارة التعليم - المملكة العربية السعودية"
    },
    "publisher": {
      "@type": "Organization",
      "name": "منصة إدرس"
    }
  } : null;

  // Article Schema for lesson pages
  const articleSchema = lesson && book ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": lesson.title,
    "description": lesson.metaDescription,
    "url": `${window.location.origin}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`,
    "datePublished": new Date().toISOString(),
    "dateModified": new Date().toISOString(),
    "author": {
      "@type": "Organization",
      "name": "وزارة التعليم - المملكة العربية السعودية"
    },
    "publisher": {
      "@type": "Organization", 
      "name": "منصة إدرس",
      "logo": {
        "@type": "ImageObject",
        "url": `${window.location.origin}/logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${window.location.origin}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}`
    },
    "keywords": [...lesson.arabicKeywords, ...lesson.englishKeywords].join(", "),
    "educationalLevel": `الصف ${book.grade}`,
    "inLanguage": "ar-SA"
  } : null;

  // Organization Schema
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "منصة إدرس",
    "alternateName": "Idros Platform",
    "url": window.location.origin,
    "logo": `${window.location.origin}/logo.png`,
    "description": "منصة تعليمية متخصصة في كتب المنهج السعودي الرقمية",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "SA",
      "addressLocality": "الرياض"
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "availableLanguage": ["Arabic", "English"]
    }
  };

  const schemas = [
    websiteSchema,
    organizationSchema,
    ...(courseSchema ? [courseSchema] : []),
    ...(learningResourceSchema ? [learningResourceSchema] : []),
    ...(articleSchema ? [articleSchema] : [])
  ];

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}