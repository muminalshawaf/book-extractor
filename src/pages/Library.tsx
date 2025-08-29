import { useEffect, useMemo, useState } from "react";
import { books, BookDef } from "@/data/books";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Search, Filter, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";

interface ContentHit { book_id: string; page_number: number; summary_md: string | null; ocr_text: string | null; }

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced SEO Components */}
      <DynamicSEOHead 
        customTitle="مكتبة الكتب الرقمية - المنهج السعودي"
        customDescription="اكتشف كتب المنهج السعودي للصف الثاني عشر مع البحث الذكي والتلخيص التلقائي. فيزياء، كيمياء، رياضيات بتقنية متقدمة"
      />
      <StructuredDataSchemas isLibraryPage={true} />
      <EnhancedSEOBreadcrumb />
      <SEOFAQSchema />
      
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3" dir="rtl">
            مكتبة الكتب الرقمية
          </h1>
          <p className="text-xl text-muted-foreground" dir="rtl">
            اكتشف كتب المنهج السعودي للصف الثاني عشر مع البحث الذكي والتلخيص التلقائي
          </p>
        </div>

        <Tabs dir="rtl" value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">تصفح المكتبة</TabsTrigger>
            <TabsTrigger value="content">البحث في المحتوى</TabsTrigger>
          </TabsList>

        {/* Tab: Library */}
        <TabsContent value="library" className="mt-4">
          <section className="bg-muted/40 rounded-lg p-4 border">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث عن الكتب..."
                    className="pr-10"
                    aria-label="بحث عن الكتب"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground flex items-center gap-1"><Filter className="h-4 w-4" /> الصف</span>
                {[10,11,12].map((g) => <GradeChip key={g} value={g} />)}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">الفصل</span>
                {[1,2,3].map((s) => <SemesterChip key={s} value={s} />)}
              </div>

              <div>
                <Select value={subject ?? undefined} onValueChange={(v) => setSubject(v)}>
                  <SelectTrigger aria-label="المادة">
                    <SelectValue placeholder="كل المواد" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>{s === 'Physics' ? 'الفيزياء' : s === 'Chemistry' ? 'الكيمياء' : s === 'Sample' ? 'عينة' : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setQ(""); setGrade(null); setSemester(null); setSubject(null); }}>مسح</Button>
                <Link to={`/book/${books[0].id}`} className="ml-auto">
                  <Button variant="secondary" className="gap-2"><BookOpen className="h-4 w-4" /> فتح الكتاب الحالي</Button>
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">عدد النتائج: {filtered.length}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {filtered.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          </section>
        </TabsContent>

        {/* Tab: Content */}
        <TabsContent value="content" className="mt-4">
          <section className="bg-muted/40 rounded-lg p-4 border">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث في المحتوى..."
                    className="pr-10"
                    aria-label="بحث في المحتوى"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground flex items-center gap-1"><Filter className="h-4 w-4" /> الصف</span>
                {[10,11,12].map((g) => <GradeChip key={g} value={g} />)}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">الفصل</span>
                {[1,2,3].map((s) => <SemesterChip key={s} value={s} />)}
              </div>

              <div>
                <Select value={subject ?? undefined} onValueChange={(v) => setSubject(v)}>
                  <SelectTrigger aria-label="المادة">
                    <SelectValue placeholder="كل المواد" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>{s === 'Physics' ? 'الفيزياء' : s === 'Chemistry' ? 'الكيمياء' : s === 'Sample' ? 'عينة' : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setQ(""); setGrade(null); setSemester(null); setSubject(null); }}>مسح</Button>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{loading ? 'جارٍ البحث...' : `عدد النتائج: ${contentHits.length}`}</span>
            </div>

            <div className="mt-3 space-y-2">
              {contentHits.map((h, i) => {
                const bk = books.find(b => b.id === h.book_id);
                const preview = (h.summary_md || h.ocr_text || '').replace(/\s+/g, ' ').slice(0, 160);
                return (
                  <button
                    key={`${h.book_id}-${h.page_number}-${i}`}
                    type="button"
                    className="w-full text-right px-3 py-3 hover:bg-accent/60 border rounded transition"
                    onClick={() => {
                      try { localStorage.setItem(`book:lastPage:${h.book_id}`, String(h.page_number)); } catch {}
                      navigate(`/book/${h.book_id}`);
                    }}
                    aria-label={`فتح صفحة ${h.page_number} في ${bk?.title || h.book_id}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{bk?.subject === 'Physics' ? 'الفيزياء' : bk?.subject === 'Chemistry' ? 'الكيمياء' : bk?.subject || '—'}</Badge>
                      <span>الصف {bk?.grade ?? '—'}</span>
                      <span>الفصل {bk?.semester ?? '—'}</span>
                      <span>صفحة {h.page_number}</span>
                    </div>
                    <div className="text-sm mt-1">
                      <span className="font-medium">{bk?.title || h.book_id}</span>
                      <span className="mx-2 text-muted-foreground">—</span>
                      <span className="text-muted-foreground">{preview}...</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
export default Library;
