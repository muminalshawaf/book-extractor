import { useEffect, useMemo, useState } from "react";
import { books as fallbackBooks, BookDef } from "@/data/books";
import { fetchBooks, BookWithPages } from "@/data/booksDbSource";
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
  const [books, setBooks] = useState<BookWithPages[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);

  // Load books from database
  useEffect(() => {
    const loadBooks = async () => {
      try {
        setBooksLoading(true);
        const dbBooks = await fetchBooks();
        setBooks(dbBooks);
      } catch (error) {
        console.error('Failed to load books from database:', error);
        // Fallback to local books
        setBooks(fallbackBooks.map(book => ({
          ...book,
          semester_range: book.semester?.toString() || "1"
        })) as BookWithPages[]);
      } finally {
        setBooksLoading(false);
      }
    };

    loadBooks();
  }, []);

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
  }, [books]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return books.filter(b => {
      if (grade && b.grade !== grade) return false;
      if (semester) {
        const bookSemester = b.semester_range ? parseInt(b.semester_range) : null;
        if (bookSemester !== semester) return false;
      }
      if (subject && b.subject !== subject) return false;
      if (!term) return true;
      const hay = [
        b.title, 
        b.subject, 
        b.subject_ar,
        b.description
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [q, grade, semester, subject, books]);

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
          .filter(b => {
            if (grade && b.grade !== grade) return false;
            if (semester) {
              const bookSemester = b.semester_range ? parseInt(b.semester_range) : null;
              if (bookSemester !== semester) return false;
            }
            if (subject && b.subject !== subject) return false;
            return true;
          })
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
  }, [q, tab, grade, semester, subject, books]);

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

  const BookCard = ({ book }: { book: BookWithPages }) => (
    <Link to={`/book/${book.id}`} className="block group">
      <Card className="transition hover:shadow-md">
        <CardContent className="p-3">
          <AspectRatio ratio={3/4}>
            <img
              src={(book.buildPages?.()[0]?.src) || book.cover_image_url || "/placeholder.svg"}
              alt={`${book.title} cover`}
              loading="lazy"
              className="h-full w-full object-cover rounded-md"
            />
          </AspectRatio>
          <div className="mt-3 space-y-1">
            <h3 className="text-sm font-medium line-clamp-2">{book.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {book.subject && (
                <Badge variant="secondary">
                  {book.subject_ar || (book.subject === 'Physics' ? 'الفيزياء' : 
                   book.subject === 'Chemistry' ? 'الكيمياء' : 
                   book.subject === 'Mathematics' ? 'الرياضيات' :
                   book.subject === 'Sample' ? 'عينة' : book.subject)}
                </Badge>
              )}
              {book.grade && <Badge variant="outline">الصف {book.grade}</Badge>}
              {book.semester_range && (
                <Badge variant="outline">
                  الفصل {book.semester_range}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

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
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((g) => <GradeChip key={g} value={g} />)}
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
                    {subjects.map((s) => {
                      const bookWithSubject = books.find(b => b.subject === s);
                      const displayName = bookWithSubject?.subject_ar || 
                        (s === 'Physics' ? 'الفيزياء' : 
                         s === 'Chemistry' ? 'الكيمياء' : 
                         s === 'Mathematics' ? 'الرياضيات' :
                         s === 'Sample' ? 'عينة' : s);
                      return (
                        <SelectItem key={s} value={s}>{displayName}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setQ(""); setGrade(null); setSemester(null); setSubject(null); }}>مسح</Button>
                {books.length > 0 && (
                  <Link to={`/book/${books[0].id}`} className="ml-auto">
                    <Button variant="secondary" className="gap-2"><BookOpen className="h-4 w-4" /> فتح الكتاب الحالي</Button>
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {booksLoading ? 'جاري تحميل الكتب...' : `عدد النتائج: ${filtered.length}`}
              </span>
            </div>

            {booksLoading ? (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] bg-muted rounded-md"></div>
                    <div className="mt-3 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="flex gap-2">
                        <div className="h-3 bg-muted rounded w-16"></div>
                        <div className="h-3 bg-muted rounded w-12"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {filtered.map((b) => (
                  <BookCard key={b.id} book={b} />
                ))}
                {filtered.length === 0 && !booksLoading && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    لا توجد كتب تطابق معايير البحث
                  </div>
                )}
              </div>
            )}
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
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((g) => <GradeChip key={g} value={g} />)}
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
                    {subjects.map((s) => {
                      // Find a book with this subject to get the Arabic name
                      const bookWithSubject = books.find(b => b.subject === s);
                      const displayName = bookWithSubject?.subject_ar || 
                        (s === 'Physics' ? 'الفيزياء' : 
                         s === 'Chemistry' ? 'الكيمياء' : 
                         s === 'Mathematics' ? 'الرياضيات' :
                         s === 'Sample' ? 'عينة' : s);
                      return (
                        <SelectItem key={s} value={s}>{displayName}</SelectItem>
                      );
                    })}
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
                      <Badge variant="secondary">
                        {bk?.subject_ar || (bk?.subject === 'Physics' ? 'الفيزياء' : 
                         bk?.subject === 'Chemistry' ? 'الكيمياء' : 
                         bk?.subject === 'Mathematics' ? 'الرياضيات' :
                         bk?.subject || '—')}
                      </Badge>
                      <span>الصف {bk?.grade ?? '—'}</span>
                      <span>الفصل {(bk?.semester_range) ?? '—'}</span>
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
