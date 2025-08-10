import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { books } from "@/data/books";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ContentHit {
  book_id: string;
  page_number: number;
  summary_md: string | null;
  ocr_text: string | null;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"books" | "content">("books");
  const [grade, setGrade] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentHits, setContentHits] = useState<ContentHit[]>([]);
  const navigate = useNavigate();

  // Open with Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.subject && set.add(b.subject));
    return Array.from(set).sort();
  }, []);

  const filteredBooks = useMemo(() => {
    const ids = books.filter((b) => {
      if (grade && b.grade !== grade) return false;
      if (semester && b.semester !== semester) return false;
      if (subject && b.subject !== subject) return false;
      if (!q.trim()) return true;
      const hay = [b.title, b.subject, ...(b.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
    return ids;
  }, [q, grade, semester, subject]);

  // Debounced content search
  useEffect(() => {
    let timer: any;
    const run = async () => {
      if (tab !== "content") return;
      const term = q.trim();
      if (term.length < 2) {
        setContentHits([]);
        return;
      }
      setLoading(true);
      try {
        // Restrict by available book_ids from filters
        const allowed = books
          .filter((b) => {
            if (grade && b.grade !== grade) return false;
            if (semester && b.semester !== semester) return false;
            if (subject && b.subject !== subject) return false;
            return true;
          })
          .map((b) => b.id);

        let query = (supabase as any)
          .from("page_summaries")
          .select("book_id,page_number,summary_md,ocr_text")
          .or(
            `summary_md.ilike.%${term}%,ocr_text.ilike.%${term}%`
          )
          .limit(20);

        if (allowed.length > 0) {
          query = query.in("book_id", allowed);
        }

        const { data, error } = await query;
        if (!error) {
          setContentHits((data as ContentHit[]) || []);
        } else {
          setContentHits([]);
        }
      } finally {
        setLoading(false);
      }
    };
    timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  }, [q, tab, grade, semester, subject]);

  const openBook = (bookId: string) => {
    navigate(`/book/${bookId}`);
    setOpen(false);
  };

  const openContentHit = (hit: ContentHit) => {
    try {
      localStorage.setItem(`book:lastPage:${hit.book_id}`, String(hit.page_number));
    } catch {}
    navigate(`/book/${hit.book_id}`);
    setOpen(false);
  };

  const FilterChip = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div dir="rtl">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <FilterChip active={tab === "books"} onClick={() => setTab("books")}>الكتب</FilterChip>
            <FilterChip active={tab === "content"} onClick={() => setTab("content")}>المحتوى</FilterChip>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(tab === "books" && "font-medium text-foreground")}>Ctrl/⌘+K</span>
          </div>
        </div>
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder={tab === "books" ? "ابحث عن كتاب بالعنوان/المادة..." : "ابحث في محتوى الصفحات..."}
        />

        {/* Filters */}
        <div className="px-3 py-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">الصف</span>
          {[10, 11, 12].map((g) => (
            <FilterChip key={g} active={grade === g} onClick={() => setGrade(grade === g ? null : g)}>
              {g}
            </FilterChip>
          ))}
          <span className="text-xs text-muted-foreground ml-2">الفصل</span>
          {[1, 2, 3].map((s) => (
            <FilterChip key={s} active={semester === s} onClick={() => setSemester(semester === s ? null : s)}>
              {s}
            </FilterChip>
          ))}
          <span className="text-xs text-muted-foreground ml-2">المادة</span>
          <div className="flex gap-1 flex-wrap">
            {subjects.map((s) => (
              <FilterChip
                key={s}
                active={subject === s}
                onClick={() => setSubject(subject === s ? null : s)}
              >
                {s === "Physics" ? "الفيزياء" : s === "Chemistry" ? "الكيمياء" : s === "Sample" ? "عينة" : s}
              </FilterChip>
            ))}
          </div>
          {(grade || semester || subject || q) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setQ("");
                setGrade(null);
                setSemester(null);
                setSubject(null);
              }}
            >
              مسح
            </Button>
          )}
        </div>

        <CommandList>
          <CommandEmpty>{tab === "books" ? "لا توجد كتب مطابقة" : loading ? "جارٍ البحث..." : "لا توجد نتائج في المحتوى"}</CommandEmpty>

          {tab === "books" && (
            <>
              <CommandGroup heading="كتب">
                {filteredBooks.slice(0, 20).map((b) => (
                  <CommandItem key={b.id} onSelect={() => openBook(b.id)}>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{b.title}</span>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {b.subject && <Badge variant="secondary">{b.subject === 'Physics' ? 'الفيزياء' : b.subject === 'Chemistry' ? 'الكيمياء' : b.subject === 'Sample' ? 'عينة' : b.subject}</Badge>}
                          {b.grade && <Badge variant="outline">الصف {b.grade}</Badge>}
                          {b.semester && <Badge variant="outline">الفصل {b.semester}</Badge>}
                        </div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {tab === "content" && (
            <>
              <CommandGroup heading="نتائج المحتوى">
                {contentHits.map((h, i) => {
                  const bk = books.find((b) => b.id === h.book_id);
                  const preview = (h.summary_md || h.ocr_text || "").replace(/\s+/g, " ").slice(0, 120);
                  return (
                    <CommandItem key={`${h.book_id}-${h.page_number}-${i}`} onSelect={() => openContentHit(h)}>
                      <div className="flex flex-col w-full">
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
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
        </CommandList>
      </div>
    </CommandDialog>
  );
}
