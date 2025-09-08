import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { books } from "@/data/books";
import { enhancedBooks } from "@/data/enhancedBooks";
import { fetchBooks } from "@/data/booksDbSource";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Library from "./pages/Library";
import LessonPage from "./pages/LessonPage";
import ChapterPage from "./pages/ChapterPage";
import AdminProcessing from "./pages/AdminProcessing";
import GlobalSearch from "./components/search/GlobalSearch";

const queryClient = new QueryClient();

const App = () => {
  const [allBooks, setAllBooks] = React.useState(books);

  // Fetch books from database on app start
  React.useEffect(() => {
    const loadBooks = async () => {
      try {
        const dbBooks = await fetchBooks();
        if (dbBooks.length > 0) {
          setAllBooks(dbBooks);
        }
      } catch (error) {
        console.error('Failed to load books from database:', error);
      }
    };
    
    loadBooks();
  }, []);

  // Add error boundary logging
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      if (event.reason?.message?.includes('6815499131d56c71687ed8a3f50e2056')) {
        console.error('Found the specific error hash in promise rejection:', event.reason);
      }
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global Error:', event.error);
      if (event.error?.message?.includes('6815499131d56c71687ed8a3f50e2056')) {
        console.error('Found the specific error hash in global error:', event.error);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <GlobalSearch />
          <Routes>
            <Route path="/" element={<Navigate to={`/book/${allBooks[0]?.id || books[0].id}`} replace />} />
            <Route path="/library" element={<Library />} />
            <Route path="/book/:bookId" element={<Index />} />
            <Route path="/admin/processing" element={<AdminProcessing />} />
            
            {/* New SEO-optimized routes with Arabic slugs */}
            <Route path="/:bookSlug/الفصل-:chapterNumber" element={<ChapterPage />} />
            <Route path="/:bookSlug/الفصل-:chapterNumber/:lessonSlug" element={<LessonPage />} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
