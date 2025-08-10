import { useEffect, useMemo, useState } from "react";
import { books, BookDef } from "@/data/books";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Filter, BookOpen } from "lucide-react";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState<string>(params.get("q") ?? "");
  const [grade, setGrade] = useState<number | null>(params.get("grade") ? Number(params.get("grade")) : null);
  const [semester, setSemester] = useState<number | null>(params.get("semester") ? Number(params.get("semester")) : null);
  const [subject, setSubject] = useState<string | null>(params.get("subject"));

  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (grade) next.set("grade", String(grade));
    if (semester) next.set("semester", String(semester));
    if (subject) next.set("subject", subject);
    setParams(next, { replace: true });
    document.title = "Library – Find Books (Grades 10–12)";
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

  const BookCard = ({ book }: { book: BookDef }) => (
    <Link to={`/book/${book.id}`} className="block group">
      <Card className="transition hover:shadow-md">
        <CardContent className="p-3">
          <AspectRatio ratio={3/4}>
            <img
              src={book.cover || "/placeholder.svg"}
              alt={`${book.title} cover`}
              loading="lazy"
              className="h-full w-full object-cover rounded-md"
            />
          </AspectRatio>
          <div className="mt-3 space-y-1">
            <h3 className="text-sm font-medium line-clamp-2">{book.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {book.subject && <Badge variant="secondary">{book.subject}</Badge>}
              {book.grade && <Badge variant="outline">G{book.grade}</Badge>}
              {book.semester && <Badge variant="outline">S{book.semester}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Books Library",
    itemListElement: filtered.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${window.location.origin}/book/${b.id}`,
      name: b.title,
    })),
  } as const;

  return (
    <div className="container mx-auto py-6 px-3">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Find Books by Grade and Semester</h1>
        <p className="text-muted-foreground mt-1">Filter by grade, semester, subject, or search by title/keywords.</p>
      </header>

      <section className="bg-muted/40 rounded-lg p-4 border">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search books..."
                className="pl-10"
                aria-label="Search books"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground flex items-center gap-1"><Filter className="h-4 w-4" /> Grade</span>
            {[10,11,12].map((g) => <GradeChip key={g} value={g} />)}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Semester</span>
            {[1,2,3].map((s) => <SemesterChip key={s} value={s} />)}
          </div>

          <div>
            <Select value={subject ?? undefined} onValueChange={(v) => setSubject(v)}>
              <SelectTrigger aria-label="Subject">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setQ(""); setGrade(null); setSemester(null); setSubject(null); }}>Clear</Button>
            <Link to={`/book/${books[0].id}`} className="ml-auto">
              <Button variant="secondary" className="gap-2"><BookOpen className="h-4 w-4" /> Open current</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{filtered.length} results</span>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {filtered.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      </section>
    </div>
  );
}
