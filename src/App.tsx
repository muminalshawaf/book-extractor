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
          <Route path="/book/:bookId" element={<Index />} />
          
          {/* New SEO-optimized routes with English structure and Arabic lesson names */}
          <Route path="/:bookSlug/chapter-:chapterNumber" element={<ChapterPage />} />
          <Route path="/:bookSlug/chapter-:chapterNumber/:lessonSlug" element={<LessonPage />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
