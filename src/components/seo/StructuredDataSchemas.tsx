import { EnhancedBookDef, LessonData } from '@/data/enhancedBooks';

interface StructuredDataSchemasProps {
  book?: EnhancedBookDef;
  lesson?: LessonData;
  pageNumber?: number;
  isLibraryPage?: boolean;
  pageContent?: {
    summary?: string;
    ocrText?: string;
    ocrJson?: any;
    summaryJson?: any;
  };
}

export default function StructuredDataSchemas({ 
  book, 
  lesson, 
  pageNumber, 
  isLibraryPage = false,
  pageContent
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

  // Book Schema for individual books  
  const bookSchema = book ? {
    "@context": "https://schema.org",
    "@type": "Book",
    "name": book.title,
    "description": book.description,
    "author": {
      "@type": "Organization",
      "name": "وزارة التعليم - المملكة العربية السعودية"
    },
    "publisher": {
      "@type": "Organization",
      "name": "منصة إدرس",
      "url": window.location.origin
    },
    "educationalLevel": `الصف ${book.grade}`,
    "about": {
      "@type": "Thing",
      "name": book.subjectArabic
    },
    "inLanguage": "ar-SA",
    "isbn": book.id,
    "numberOfPages": book.totalPages,
    "keywords": book.keywords?.join(", "),
    "url": `${window.location.origin}/book/${book.id}`,
    "audience": {
      "@type": "EducationalAudience",
      "educationalRole": "student",
      "audienceType": "طلاب الثانوية العامة السعودية"
    },
    "educationalUse": "دراسة ذاتية، تعلم، مراجعة"
  } : null;

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

  // Creative Work Schema for OCR content
  const creativeWorkSchema = pageContent?.ocrText && book ? {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": `محتوى الصفحة ${pageNumber} - ${book.title}`,
    "text": pageContent.ocrText.slice(0, 1000), // First 1000 chars for indexing
    "inLanguage": "ar-SA",
    "isPartOf": {
      "@type": "Course",
      "name": book.title
    },
    "educationalUse": "reading",
    "audience": {
      "@type": "EducationalAudience",
      "educationalRole": "student"
    }
  } : null;

  // Questions Schema from structured JSON
  const questionsSchema = pageContent?.summaryJson?.sections && book ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `أسئلة الصفحة ${pageNumber} - ${book.title}`,
    "numberOfItems": pageContent.summaryJson.sections.filter((s: any) => s.title.includes('سؤال') || s.title.includes('حل')).length,
    "itemListElement": pageContent.summaryJson.sections
      .filter((s: any) => s.title.includes('سؤال') || s.title.includes('حل') || /\d+\)\s/.test(s.title))
      .slice(0, 10) // Limit for performance
      .map((section: any, index: number) => ({
        "@type": "Question",
        "position": index + 1,
        "name": section.title.replace(/^\d+\)\s*/, ''),
        "text": section.content.slice(0, 200),
        "inLanguage": "ar-SA",
        "educationalUse": "assessment"
      }))
  } : null;

  // Structured OCR Schema from JSON
  const structuredOcrSchema = pageContent?.ocrJson && book && pageContent.ocrJson.sections ? {
    "@context": "https://schema.org",
    "@type": "ItemList", 
    "name": `محتوى منظم - الصفحة ${pageNumber}`,
    "numberOfItems": Math.min(pageContent.ocrJson.sections.length, 5),
    "itemListElement": pageContent.ocrJson.sections.slice(0, 5).map((section: any, index: number) => ({
      "@type": "CreativeWork",
      "position": index + 1,
      "name": section.title || `قسم ${index + 1}`,
      "text": section.content?.slice(0, 150) || '',
      "inLanguage": "ar-SA"
    }))
  } : null;

  // Enhanced Article Schema with structured content
  const enhancedArticleSchema = pageContent?.summaryJson && lesson && book ? {
    ...articleSchema,
    "text": pageContent.summaryJson.sections?.map((s: any) => s.content).join(' ').slice(0, 500),
    "wordCount": pageContent.summaryJson.wordCount || 0,
    "about": {
      "@type": "Thing", 
      "name": lesson.arabicKeywords.join(", ")
    },
    "hasPart": pageContent.summaryJson.hasQuestions ? [
      {
        "@type": "Quiz",
        "name": "أسئلة الصفحة",
        "inLanguage": "ar-SA"
      }
    ] : undefined
  } : pageContent?.summary && lesson && book ? {
    ...articleSchema,
    "text": pageContent.summary,
    "wordCount": pageContent.summary.split(/\s+/).length,
    "about": {
      "@type": "Thing",
      "name": lesson.arabicKeywords.join(", ")
    }
  } : articleSchema;

  const schemas = [
    websiteSchema,
    organizationSchema,
    ...(bookSchema ? [bookSchema] : []),
    ...(courseSchema ? [courseSchema] : []),
    ...(learningResourceSchema ? [learningResourceSchema] : []),
    ...(enhancedArticleSchema ? [enhancedArticleSchema] : []),
    ...(creativeWorkSchema ? [creativeWorkSchema] : []),
    ...(questionsSchema && questionsSchema.itemListElement.length > 0 ? [questionsSchema] : []),
    ...(structuredOcrSchema ? [structuredOcrSchema] : [])
  ].filter(schema => {
    // Hard cap: Remove schema if JSON stringified version exceeds 8KB
    const size = JSON.stringify(schema).length;
    return size < 8000;
  });

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