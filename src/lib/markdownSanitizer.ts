import DOMPurify from 'dompurify';

// Safe markdown sanitization configuration
const MARKDOWN_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 'strike', 'del',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src',
    'class', 'id',
    'colspan', 'rowspan',
    'target', 'rel'
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target', 'rel']
};

/**
 * Sanitizes HTML content to prevent XSS attacks while preserving markdown formatting
 */
export function sanitizeMarkdown(content: string): string {
  if (!content) return '';
  
  const sanitized = DOMPurify.sanitize(content, MARKDOWN_SANITIZE_CONFIG);
  
  // Additional safety: ensure external links open safely
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitized;
  
  const links = tempDiv.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
  
  return tempDiv.innerHTML;
}

/**
 * Sanitizes plain text content for safe display
 */
export function sanitizeText(content: string): string {
  if (!content) return '';
  
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
}