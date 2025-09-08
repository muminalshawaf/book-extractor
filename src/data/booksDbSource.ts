import { supabase } from "@/integrations/supabase/client";
import { books as localBooks, BookDef } from "./books";

export interface BookData {
  id: string;
  title: string;
  subject: string;
  subject_ar?: string;
  grade: number;
  semester_range: string;
  description?: string;
  cover_image_url?: string;
  base_page_url?: string;
  total_pages?: number;
  slug?: string;
  created_at?: string;
  updated_at?: string;
}

// Define our own BookPage interface that matches what we need
export interface BookPage {
  src: string;
  alt: string;
  pageNumber?: number;
  imageUrl?: string;
  title?: string;
}

export interface BookWithPages extends BookData {
  buildPages: () => BookPage[];
}

// Convert local book to database format
function convertLocalBookToDbFormat(localBook: BookDef): BookWithPages {
  return {
    id: localBook.id,
    title: localBook.title,
    subject: localBook.subject || "Unknown",
    grade: localBook.grade || 12,
    semester_range: localBook.semester?.toString() || "1",
    buildPages: localBook.buildPages
  };
}

// Convert database book to our local book format with page generation
function convertDbBookToLocalFormat(dbBook: BookData): BookWithPages {
  return {
    ...dbBook,
    buildPages: () => {
      // If we have base_page_url and total_pages, generate pages
      if (dbBook.base_page_url && dbBook.total_pages) {
        return Array.from({ length: dbBook.total_pages }, (_, i) => {
          // Ensure the base URL has the correct protocol
          const baseUrl = dbBook.base_page_url.startsWith('http') 
            ? dbBook.base_page_url 
            : `https://www.${dbBook.base_page_url}`;
          
          // Generate zero-padded page numbers (00000, 00001, etc.)
          const pageNumber = i.toString().padStart(5, '0');
          const pageUrl = `${baseUrl}/${pageNumber}.webp`;
          
          return {
            src: pageUrl,
            alt: `${dbBook.title} - صفحة ${i + 1}`,
            pageNumber: i + 1,
            imageUrl: pageUrl,
            title: `${dbBook.title} - صفحة ${i + 1}`
          };
        });
      }
      
      // Fallback: try to find matching local book
      const localBook = localBooks.find(book => book.id === dbBook.id);
      if (localBook) {
        return localBook.buildPages();
      }
      
      // Default: return empty array
      return [];
    }
  };
}

// Fetch books from database with fallback to local data
export async function fetchBooks(): Promise<BookWithPages[]> {
  try {
    console.log('Fetching books from database...');
    
    const { data: dbBooks, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching books from database:', error);
      console.log('Falling back to local books data');
      return localBooks.map(convertLocalBookToDbFormat);
    }

    if (!dbBooks || dbBooks.length === 0) {
      console.log('No books found in database, using local books');
      return localBooks.map(convertLocalBookToDbFormat);
    }

    console.log(`Found ${dbBooks.length} books in database`);
    
    // Convert database books to local format
    const booksWithPages = dbBooks.map(convertDbBookToLocalFormat);
    
    // Merge with local books (prioritize database books) - newest first
    const allBookIds = new Set(booksWithPages.map(book => book.id));
    const additionalLocalBooks = localBooks
      .filter(book => !allBookIds.has(book.id))
      .map(convertLocalBookToDbFormat);
    
    // Sort all books - database books first (newest first), then local books
    const allBooks = [...booksWithPages, ...additionalLocalBooks];
    
    return allBooks;
    
  } catch (err) {
    console.error('Error in fetchBooks:', err);
    console.log('Falling back to local books data');
    return localBooks.map(convertLocalBookToDbFormat);
  }
}

// Get a specific book by ID
export async function getBookById(id: string): Promise<BookWithPages | null> {
  try {
    const { data: dbBook, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching book from database:', error);
    }

    if (dbBook) {
      return convertDbBookToLocalFormat(dbBook);
    }

    // Fallback to local books
    const localBook = localBooks.find(book => book.id === id);
    return localBook ? convertLocalBookToDbFormat(localBook) : null;
    
  } catch (err) {
    console.error('Error in getBookById:', err);
    // Fallback to local books
    const localBook = localBooks.find(book => book.id === id);
    return localBook ? convertLocalBookToDbFormat(localBook) : null;
  }
}

// Get available subjects from database and local books
export async function getAvailableSubjects(): Promise<string[]> {
  try {
    const books = await fetchBooks();
    const subjects = [...new Set(books.map(book => book.subject))];
    return subjects.sort();
  } catch (err) {
    console.error('Error getting available subjects:', err);
    return ['Chemistry', 'Physics', 'Mathematics'];
  }
}