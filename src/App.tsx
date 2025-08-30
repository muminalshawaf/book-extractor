import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { books } from "@/data/books";
import { enhancedBooks } from "@/data/enhancedBooks";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Library from "./pages/Library";
import LessonPage from "./pages/LessonPage";
import ChapterPage from "./pages/ChapterPage";
import GlobalSearch from "./components/search/GlobalSearch";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GlobalSearch />
        <Routes>
          <Route path="/" element={<Navigate to={`/book/${books[0].id}`} replace />} />
          <Route path="/library" element={<Library />} />
          {/* Legacy book URL redirects to semantic URLs */}
          <Route path="/book/chem12-1-3" element={<Navigate to="/kimiya-3/fasl-1" replace />} />
          <Route path="/book/physics12-1-3" element={<Navigate to="/fiziya-3/fasl-1" replace />} />
          <Route path="/book/math12-1-3" element={<Navigate to="/riyadiyat-3/fasl-1" replace />} />
          <Route path="/book/:bookId" element={<Index />} />
          
          {/* SEO-optimized routes with URL-safe Arabic transliteration */}
          <Route path="/:bookSlug/fasl-:chapterNumber" element={<ChapterPage />} />
          <Route path="/:bookSlug/fasl-:chapterNumber/:lessonSlug" element={<LessonPage />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
