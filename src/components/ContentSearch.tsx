import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, ChevronUp, ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
interface SearchResult {
  pageIndex: number;
  text: string;
  startIndex: number;
  endIndex: number;
  context: string;
}
interface ContentSearchProps {
  pages: Record<number, string>;
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  onHighlight: (searchTerm: string) => void;
  rtl?: boolean;
}
export const ContentSearch: React.FC<ContentSearchProps> = ({
  pages,
  currentPageIndex,
  onPageChange,
  onHighlight,
  rtl = false
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const performSearch = useCallback((term: string) => {
    console.log('ContentSearch: Performing search for term:', term);
    console.log('ContentSearch: Available pages with text:', Object.keys(pages));
    console.log('ContentSearch: Pages content preview:', Object.entries(pages).map(([key, text]) => `Page ${key}: ${text.substring(0, 100)}...`));
    if (!term.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(0);
      onHighlight("");
      return;
    }
    setIsSearching(true);
    const results: SearchResult[] = [];
    const lowercaseTerm = term.toLowerCase();
    Object.entries(pages).forEach(([pageIndexStr, extractedText]) => {
      const pageIndex = parseInt(pageIndexStr);
      if (!extractedText) return;
      const text = extractedText.toLowerCase();
      let startIndex = 0;
      while (true) {
        const foundIndex = text.indexOf(lowercaseTerm, startIndex);
        if (foundIndex === -1) break;

        // Get context around the found term (50 chars before and after)
        const contextStart = Math.max(0, foundIndex - 50);
        const contextEnd = Math.min(extractedText.length, foundIndex + term.length + 50);
        const context = extractedText.substring(contextStart, contextEnd);
        results.push({
          pageIndex,
          text: extractedText.substring(foundIndex, foundIndex + term.length),
          startIndex: foundIndex,
          endIndex: foundIndex + term.length,
          context: contextStart > 0 ? "..." + context : context + (contextEnd < extractedText.length ? "..." : "")
        });
        startIndex = foundIndex + 1;
      }
    });
    console.log('ContentSearch: Search completed, found', results.length, 'results');
    setSearchResults(results);
    setCurrentResultIndex(0);
    setIsSearching(false);
    onHighlight(term);

    // Navigate to first result if found
    if (results.length > 0) {
      console.log('ContentSearch: Navigating to first result on page', results[0].pageIndex);
      onPageChange(results[0].pageIndex);
    } else {
      console.log('ContentSearch: No results found for term:', term);
    }
  }, [pages, onPageChange, onHighlight]);
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchTerm);
  };
  const clearSearch = () => {
    setSearchTerm("");
    setSearchResults([]);
    setCurrentResultIndex(0);
    onHighlight("");
  };
  const navigateToResult = (index: number) => {
    if (index < 0 || index >= searchResults.length) return;
    setCurrentResultIndex(index);
    onPageChange(searchResults[index].pageIndex);
  };
  const nextResult = () => {
    const nextIndex = (currentResultIndex + 1) % searchResults.length;
    navigateToResult(nextIndex);
  };
  const previousResult = () => {
    const prevIndex = currentResultIndex === 0 ? searchResults.length - 1 : currentResultIndex - 1;
    navigateToResult(prevIndex);
  };
  const highlightSearchTerm = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => regex.test(part) ? <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
          {part}
        </mark> : part);
  };
  const hasAnyExtractedText = Object.keys(pages).length > 0;
  return <Card className="shadow-sm">
      <CardContent className="p-4">
        {!hasAnyExtractedText}
        <form onSubmit={handleSearch} className="space-y-3">
          <div className={cn("flex gap-2", rtl && "flex-row-reverse")}>
            <div className="relative flex-1">
              <Search className={cn("absolute top-2.5 h-4 w-4 text-muted-foreground", rtl ? "right-3" : "left-3")} />
              <Input type="text" placeholder={rtl ? "البحث في المحتوى..." : "Search content..."} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={cn("h-9", rtl ? "pr-10" : "pl-10")} dir={rtl ? "rtl" : "ltr"} />
              {searchTerm && <Button type="button" variant="ghost" size="icon" onClick={clearSearch} className={cn("absolute top-0 h-9 w-9", rtl ? "left-0" : "right-0")}>
                  <X className="h-3 w-3" />
                </Button>}
            </div>
            
            {searchResults.length > 0 && <div className={cn("flex items-center gap-1", rtl && "flex-row-reverse")}>
                <Button type="button" variant="outline" size="icon" onClick={previousResult} disabled={searchResults.length <= 1} className="h-9 w-9">
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={nextResult} disabled={searchResults.length <= 1} className="h-9 w-9">
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>}
          </div>

          {/* Search results summary */}
          {searchTerm && <div className={cn("flex items-center justify-between text-sm text-muted-foreground", rtl && "flex-row-reverse")}>
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3" />
                <span>
                  {searchResults.length === 0 ? rtl ? "لا توجد نتائج" : "No results" : rtl ? `${currentResultIndex + 1} من ${searchResults.length} نتيجة` : `${currentResultIndex + 1} of ${searchResults.length} results`}
                </span>
              </div>
              
              {searchResults.length > 0 && <Badge variant="secondary" className="text-xs">
                  {rtl ? `الصفحة ${searchResults[currentResultIndex].pageIndex + 1}` : `Page ${searchResults[currentResultIndex].pageIndex + 1}`}
                </Badge>}
            </div>}

          {/* Current result context and clickable results */}
          {searchResults.length > 0 && searchResults[currentResultIndex] && <>
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <div className="text-sm leading-relaxed" dir={rtl ? "rtl" : "ltr"}>
                  {highlightSearchTerm(searchResults[currentResultIndex].context, searchTerm)}
                </div>
              </div>

              {/* All results list - click to jump to page */}
              <div className="mt-3">
                <div className={cn("text-xs text-muted-foreground mb-2", rtl && "text-right")}>
                  {rtl ? "النتائج" : "Results"}
                </div>
                <div className="max-h-60 overflow-auto rounded border">
                  {searchResults.map((r, i) => <button key={`${r.pageIndex}-${r.startIndex}-${i}`} type="button" onClick={() => navigateToResult(i)} className={cn("w-full text-left px-3 py-2 hover:bg-accent/60 focus:bg-accent/60 transition", i === currentResultIndex && "bg-accent/50", rtl && "text-right")} dir={rtl ? "rtl" : "ltr"} aria-label={rtl ? `الانتقال إلى الصفحة ${r.pageIndex + 1}` : `Go to page ${r.pageIndex + 1}`}>
                      <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
                        <span className="text-xs text-muted-foreground">{rtl ? `الصفحة ${r.pageIndex + 1}` : `Page ${r.pageIndex + 1}`}</span>
                        {i === currentResultIndex && <Badge variant="secondary">{rtl ? "الحالية" : "Current"}</Badge>}
                      </div>
                      <div className="text-sm">
                        {highlightSearchTerm(r.context, searchTerm)}
                      </div>
                    </button>)}
                </div>
              </div>
            </>}
        </form>
      </CardContent>
    </Card>;
};