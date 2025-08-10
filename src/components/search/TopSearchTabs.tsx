import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { books } from "@/data/books";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ContentHit { book_id: string; page_number: number; summary_md: string | null; ocr_text: string | null; }

interface TopSearchTabsProps { rtl?: boolean; currentBookId: string }

export function TopSearchTabs({ rtl = true, currentBookId }: TopSearchTabsProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"library" | "content">("library");
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentHits, setContentHits] = useState<ContentHit[]>([]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => b.subject && set.add(b.subject));
    return Array.from(set).sort();
  }, []);

  const filteredBooks = useMemo(() => {
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

  useEffect(() => {
    let t: any;
    const run = async () => {
      if (tab !== "content") { setContentHits([]); return; }
      const term = q.trim();
      if (term.length < 2) { setContentHits([]); return; }
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('page_summaries')
          .select('book_id,page_number,ocr_text')
          .eq('book_id', currentBookId)
          .ilike('ocr_text', `%${term}%`)
          .limit(50);
        if (!error) setContentHits((data as ContentHit[]) || []); else setContentHits([]);
      } finally {
        setLoading(false);
      }
    };
    t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [q, tab, currentBookId]);

  const openBook = (id: string) => navigate(`/book/${id}`);
  const openContent = (h: ContentHit) => {
    try { localStorage.setItem(`book:lastPage:${h.book_id}`, String(h.page_number)); } catch {}
    navigate(`/book/${h.book_id}`);
  };

  const GradeChip = ({ value }: { value: number }) => (
    <Button
      type="button"
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
      type="button"
      variant={semester === value ? "default" : "outline"}
      size="sm"
      onClick={() => setSemester(semester === value ? null : value)}
      className="rounded-full"
    >
      {value}
    </Button>
  );

  return (
    <section dir={rtl ? "rtl" : "ltr"}>
      <h1 className="sr-only">البحث عن الكتب والمحتوى</h1>
      <Tabs dir={rtl ? "rtl" : "ltr"} value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">{rtl ? "تصفح المكتبة" : "Library"}</TabsTrigger>
          <TabsTrigger value="content">{rtl ? "البحث في المحتوى" : "Content"}</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-3">
          <div className="bg-muted/40 rounded-lg p-3 border">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={rtl ? "ابحث عن الكتب بالعنوان/الكلمات..." : "Search books by title/keywords..."}
                  aria-label={rtl ? "بحث عن الكتب" : "Search books"}
                />
              </div>
              <div className={cn("flex items-center gap-2 flex-wrap", rtl && "flex-row-reverse justify-end")}>
                <span className="text-sm text-muted-foreground">{rtl ? "الصف" : "Grade"}</span>
                {[10,11,12].map((g) => <GradeChip key={g} value={g} />)}
              </div>
              <div className={cn("flex items-center gap-2 flex-wrap", rtl && "flex-row-reverse justify-end")}>
                <span className="text-sm text-muted-foreground">{rtl ? "الفصل" : "Semester"}</span>
                {[1,2,3].map((s) => <SemesterChip key={s} value={s} />)}
              </div>
              <div>
                <Select value={subject ?? undefined} onValueChange={(v) => setSubject(v)}>
                  <SelectTrigger aria-label={rtl ? "المادة" : "Subject"}>
                    <SelectValue placeholder={rtl ? "كل المواد" : "All subjects"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>{s === 'Physics' ? 'الفيزياء' : s === 'Chemistry' ? 'الكيمياء' : s === 'Sample' ? 'عينة' : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                {(q || grade || semester || subject) && (
                  <Button variant="outline" onClick={() => { setQ(""); setGrade(null); setSemester(null); setSubject(null); }}>
                    {rtl ? "مسح" : "Clear"}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {filteredBooks.slice(0, 12).map((b) => (
                <button key={b.id} type="button" onClick={() => openBook(b.id)} className="text-right border rounded-md p-2 hover:bg-accent/60 transition">
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {b.subject && <Badge variant="secondary">{b.subject === 'Physics' ? 'الفيزياء' : b.subject === 'Chemistry' ? 'الكيمياء' : b.subject === 'Sample' ? 'عينة' : b.subject}</Badge>}
                    {b.grade && <Badge variant="outline">{rtl ? `الصف ${b.grade}` : `Grade ${b.grade}`}</Badge>}
                    {b.semester && <Badge variant="outline">{rtl ? `الفصل ${b.semester}` : `Sem ${b.semester}`}</Badge>}
                  </div>
                  <div className="text-sm mt-1 line-clamp-2">{b.title}</div>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-3">
          <div className="bg-muted/40 rounded-lg p-3 border">
            <div className="grid gap-3">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={rtl ? "ابحث في محتوى هذا الكتاب..." : "Search within this book..."}
                aria-label={rtl ? "بحث في محتوى الكتاب" : "Content search in current book"}
              />
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">{loading ? (rtl ? 'جارٍ البحث...' : 'Searching...') : (rtl ? `عدد النتائج: ${contentHits.length}` : `Results: ${contentHits.length}`)}</div>
              {contentHits.map((h, i) => {
                const preview = (h.ocr_text || '').replace(/\s+/g, ' ').slice(0, 160);
                return (
                  <button
                    key={`${h.book_id}-${h.page_number}-${i}`}
                    type="button"
                    className="w-full text-right px-3 py-3 hover:bg-accent/60 border rounded transition"
                    onClick={() => openContent(h)}
                    aria-label={rtl ? `فتح صفحة ${h.page_number}` : `Open page ${h.page_number}`}
                  >
                    <div className="text-xs text-muted-foreground">{rtl ? `صفحة ${h.page_number}` : `Page ${h.page_number}`}</div>
                    <div className="text-sm mt-1 text-muted-foreground">{preview}...</div>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

export default TopSearchTabs;
