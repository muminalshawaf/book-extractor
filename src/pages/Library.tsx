import { useEffect, useMemo, useState } from "react";
import { books, BookDef } from "@/data/books";
import { enhancedBooks, getBookBySlug } from "@/data/enhancedBooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Search, Filter, BookOpen, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DynamicSEOHead from "@/components/seo/DynamicSEOHead";
import StructuredDataSchemas from "@/components/seo/StructuredDataSchemas";
import EnhancedSEOBreadcrumb from "@/components/seo/EnhancedSEOBreadcrumb";
import SEOFAQSchema from "@/components/SEOFAQSchema";

interface ContentHit { book_id: string; page_number: number; summary_md: string | null; ocr_text: string | null; }

export default function Library() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState<string>(params.get("q") ?? "");
  const [grade, setGrade] = useState<number | null>(params.get("grade") ? Number(params.get("grade")) : null);
  const [semester, setSemester] = useState<number | null>(params.get("semester") ? Number(params.get("semester")) : null);
  const [subject, setSubject] = useState<string | null>(params.get("subject"));
  const [tab, setTab] = useState<"library" | "content">("library");
  const [loading, setLoading] = useState(false);
  const [contentHits, setContentHits] = useState<ContentHit[]>([]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (grade) next.set("grade", String(grade));
    if (semester) next.set("semester", String(semester));
    if (subject) next.set("subject", subject);
    setParams(next, { replace: true });
  }, [q, grade, semester, subject, setParams]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => b.subject && set.add(b.subject));
    return Array.from(set).sort();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return books.filter(b => {
      if (grade && b.grade !== grade) return false;
      if (semester && b.semester !== semester) return false;
      if (subject && b.subject !== subject) return false;
      if (!term) return true;
      const hay = [b.title, b.subject, ...(b.keywords ?? [])].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [q, grade, semester, subject]);

  // Debounced content search
  useEffect(() => {
    let t: any;
    const run = async () => {
      if (tab !== "content") { setContentHits([]); return; }
      const term = q.trim();
      if (term.length < 2) { setContentHits([]); return; }
      setLoading(true);
      try {
        const allowed = books
          .filter(b => (
            (!grade || b.grade === grade) &&
            (!semester || b.semester === semester) &&
            (!subject || b.subject === subject)
          ))
          .map(b => b.id);

        let query = (supabase as any)
          .from('page_summaries')
          .select('book_id,page_number,summary_md,ocr_text')
          .or(`summary_md.ilike.%${term}%,ocr_text.ilike.%${term}%`)
          .limit(50);
        if (allowed.length > 0) query = query.in('book_id', allowed);
        const { data, error } = await query;
        if (!error) setContentHits((data as ContentHit[]) || []);
        else setContentHits([]);
      } finally {
        setLoading(false);
      }
    };
    t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [q, tab, grade, semester, subject]);

  const GradeChip = ({ value }: { value: number }) => (
    <Button
      variant={grade === value ? "default" : "outline"}
      size="sm"
      onClick={() => setGrade(grade === value ? null : value)}
      className="rounded-full"
    >
      {value}
    </Button>
  );

  const SemesterChip = ({ value }: { value: number }) => (
    <Button
      variant={semester === value ? "default" : "outline"}
      size="sm"
      onClick={() => setSemester(semester === value ? null : value)}
      className="rounded-full"
    >
      {value}
    </Button>
  );

  const BookCard = ({ book }: { book: BookDef }) => {
    const enhancedBook = enhancedBooks.find(eb => eb.id === book.id);
    const hasLessons = enhancedBook?.lessons && enhancedBook.lessons.length > 0;
    
    return (
      <Card className="transition hover:shadow-md">
        <CardContent className="p-3">
          <AspectRatio ratio={3/4}>
            <img
              src={(book.buildPages?.()[0]?.src) || book.cover || "/placeholder.svg"}
              alt={`${book.title} cover`}
              loading="lazy"
              className="h-full w-full object-cover rounded-md"
            />
          </AspectRatio>
          <div className="mt-2 space-y-1 text-center">
            <h3 className="font-medium text-sm leading-tight">{book.title}</h3>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {book.subject === 'Physics' ? 'الفيزياء' : book.subject === 'Chemistry' ? 'الكيمياء' : book.subject || '—'}
              </Badge>
              <span>الصف {book.grade ?? '—'}</span>
            </div>
            
            {/* Navigation Options */}
            <div className="flex flex-col gap-1 mt-2">
              {hasLessons ? (
                <>
                  <Link 
                    to={`/${enhancedBook!.slug}/الفصل-1`} 
                    className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/90 transition-colors flex items-center gap-1 justify-center"
                  >
                    <BookOpen className="h-3 w-3" />
                    عرض الدروس
                  </Link>
                  <Link 
                    to={`/book/${book.id}`}
                    className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded hover:bg-muted/80 transition-colors flex items-center gap-1 justify-center"
                  >
                    <ExternalLink className="h-3 w-3" />
                    الكتاب الكامل
                  </Link>
                </>
              ) : (
                <Link 
                  to={`/book/${book.id}`}
                  className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/90 transition-colors flex items-center gap-1 justify-center"
                >
                  <BookOpen className="h-3 w-3" />
                  فتح الكتاب
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

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
}
