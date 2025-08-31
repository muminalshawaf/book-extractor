import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Download, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { enhancedBooks } from '@/data/enhancedBooks';

interface SitemapGeneratorProps {
  rtl?: boolean;
}

export const SitemapGenerator: React.FC<SitemapGeneratorProps> = ({
  rtl = false
}) => {
  const [sitemap, setSitemap] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateSitemap = async () => {
    setGenerating(true);
    try {
      const baseUrl = window.location.origin;
      const today = new Date().toISOString().split('T')[0];
      
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      
      // Homepage
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>1.0</priority>\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/"/>\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="ar-SA" href="${baseUrl}/"/>\n`;
      xml += `  </url>\n`;
      
      // Library page
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/library</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/library"/>\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="ar-SA" href="${baseUrl}/library"/>\n`;
      xml += `  </url>\n`;
      
      // Book pages
      enhancedBooks.forEach(book => {
        // Main book page
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/book/${book.id}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/book/${book.id}"/>\n`;
        xml += `  </url>\n`;
        
        // Arabic book URL
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/${book.slug}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/${book.slug}"/>\n`;
        xml += `  </url>\n`;
        
        // Chapter pages
        if (book.lessons) {
          const chapters = [...new Set(book.lessons.map(l => l.chapterNumber))];
          chapters.forEach(chapterNum => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/${book.slug}/الفصل-${chapterNum}</loc>\n`;
            xml += `    <lastmod>${today}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.7</priority>\n`;
            xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/${book.slug}/الفصل-${chapterNum}"/>\n`;
            xml += `  </url>\n`;
          });
          
          // Individual lesson pages
          book.lessons.forEach(lesson => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}</loc>\n`;
            xml += `    <lastmod>${today}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.6</priority>\n`;
            xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${baseUrl}/${book.slug}/الفصل-${lesson.chapterNumber}/${lesson.slug}"/>\n`;
            xml += `  </url>\n`;
          });
        }
      });
      
      xml += `</urlset>`;
      
      setSitemap(xml);
      toast.success(rtl ? 'تم إنشاء خريطة الموقع بنجاح' : 'Sitemap generated successfully');
    } catch (error) {
      console.error('Error generating sitemap:', error);
      toast.error(rtl ? 'فشل في إنشاء خريطة الموقع' : 'Failed to generate sitemap');
    } finally {
      setGenerating(false);
    }
  };

  const downloadSitemap = () => {
    if (!sitemap) {
      toast.error(rtl ? 'لا توجد خريطة موقع للتنزيل' : 'No sitemap to download');
      return;
    }
    
    const blob = new Blob([sitemap], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(rtl ? 'تم تنزيل خريطة الموقع' : 'Sitemap downloaded');
  };

  const copySitemap = async () => {
    if (!sitemap) {
      toast.error(rtl ? 'لا توجد خريطة موقع للنسخ' : 'No sitemap to copy');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(sitemap);
      toast.success(rtl ? 'تم نسخ خريطة الموقع' : 'Sitemap copied to clipboard');
    } catch (error) {
      toast.error(rtl ? 'فشل في نسخ خريطة الموقع' : 'Failed to copy sitemap');
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className={cn("text-sm flex items-center gap-2", rtl && "flex-row-reverse")}>
          <FileText className="h-4 w-4" />
          {rtl ? "مولد خريطة الموقع" : "Sitemap Generator"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
          <Button
            onClick={generateSitemap}
            disabled={generating}
            variant="default"
            size="sm"
          >
            {generating ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {rtl ? "إنشاء خريطة الموقع" : "Generate Sitemap"}
          </Button>
          
          {sitemap && (
            <>
              <Button
                onClick={downloadSitemap}
                variant="outline"
                size="sm"
              >
                <Download className="h-3 w-3 mr-1" />
                {rtl ? "تنزيل" : "Download"}
              </Button>
              
              <Button
                onClick={copySitemap}
                variant="outline"
                size="sm"
              >
                {rtl ? "نسخ" : "Copy"}
              </Button>
            </>
          )}
        </div>

        {sitemap && (
          <Textarea
            value={sitemap}
            readOnly
            className="font-mono text-xs max-h-96"
            placeholder={rtl ? "ستظهر خريطة الموقع هنا..." : "Sitemap will appear here..."}
          />
        )}

        <div className="text-xs text-muted-foreground">
          {rtl 
            ? "يقوم هذا المولد بإنشاء خريطة موقع XML تتضمن جميع الصفحات مع الروابط العربية المحسنة لمحركات البحث"
            : "This generator creates an XML sitemap with all pages including SEO-optimized Arabic URLs"}
        </div>
      </CardContent>
    </Card>
  );
};