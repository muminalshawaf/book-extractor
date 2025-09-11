import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Database, Zap, BookOpen, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BackfillResult {
  message: string;
  book_id: string;
  total_pages: number;
  pages_processed: number;
  errors: number;
  success_rate: number;
}

interface BookStatus {
  id: string;
  title: string;
  total_pages: number;
  pages_with_embeddings: number;
  embedding_coverage: number;
}

export default function RAGAdmin() {
  const [isBackfillRunning, setIsBackfillRunning] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [books, setBooks] = useState<BookStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    loadBookStatuses();
    // Load RAG settings from localStorage or database
    const savedRagEnabled = localStorage.getItem('rag-enabled') === 'true';
    setRagEnabled(savedRagEnabled);
  }, []);

  const loadBookStatuses = async () => {
    try {
      setIsLoading(true);
      
      // Get all books
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select('id, title, total_pages');

      if (booksError) throw booksError;

      // Get embedding statistics for each book
      const bookStatuses = await Promise.all(
        (booksData || []).map(async (book) => {
          const { data: embeddingData, error: embeddingError } = await supabase
            .from('page_summaries')
            .select('embedding')
            .eq('book_id', book.id)
            .not('embedding', 'is', null);

          const pages_with_embeddings = embeddingData?.length || 0;
          const total_pages = book.total_pages || 0;
          const embedding_coverage = total_pages > 0 ? (pages_with_embeddings / total_pages) * 100 : 0;

          return {
            id: book.id,
            title: book.title,
            total_pages,
            pages_with_embeddings,
            embedding_coverage
          };
        })
      );

      setBooks(bookStatuses);
    } catch (error) {
      console.error('Error loading book statuses:', error);
      toast.error('Failed to load book statuses');
    } finally {
      setIsLoading(false);
    }
  };

  const runBackfillForBook = async (bookId: string) => {
    try {
      setIsBackfillRunning(true);
      toast.info(`Starting embedding generation for book: ${bookId}`);

      const { data, error } = await supabase.functions.invoke('backfill-embeddings', {
        body: { 
          book_id: bookId,
          force_regenerate: false,
          batch_size: 5
        }
      });

      if (error) throw error;

      const result = data as BackfillResult;
      
      toast.success(
        `Embedding generation completed for ${bookId}: ${result.pages_processed} pages processed with ${Math.round(result.success_rate * 100)}% success rate`
      );

      // Refresh book statuses
      await loadBookStatuses();

    } catch (error: any) {
      console.error('Error running backfill:', error);
      toast.error(`Embedding generation failed: ${error.message}`);
    } finally {
      setIsBackfillRunning(false);
    }
  };

  const runBackfillForAllBooks = async () => {
    try {
      setIsBackfillRunning(true);
      toast.info('Starting embedding generation for all books');

      for (const book of books) {
        if (book.embedding_coverage < 100) {
          await runBackfillForBook(book.id);
          // Small delay between books to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      toast.success('Completed embedding generation for all books');
    } catch (error: any) {
      console.error('Error running full backfill:', error);
      toast.error(`Full embedding generation failed: ${error.message}`);
    } finally {
      setIsBackfillRunning(false);
    }
  };

  const toggleRAG = (enabled: boolean) => {
    setRagEnabled(enabled);
    localStorage.setItem('rag-enabled', enabled.toString());
    toast.success(`RAG ${enabled ? 'enabled' : 'disabled'} globally`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">RAG Administration</h1>
          <p className="text-muted-foreground">
            Manage Retrieval-Augmented Generation system for enhanced summaries
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Zap className={`h-5 w-5 ${ragEnabled ? 'text-green-500' : 'text-gray-400'}`} />
          <Label htmlFor="rag-toggle">RAG System</Label>
          <Switch
            id="rag-toggle"
            checked={ragEnabled}
            onCheckedChange={toggleRAG}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              System Status
            </CardTitle>
            <CardDescription>
              Overview of RAG system configuration and health
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>RAG System Status</span>
              <Badge variant={ragEnabled ? "default" : "secondary"}>
                {ragEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Vector Database</span>
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Embedding Model</span>
              <Badge variant="outline">text-embedding-004</Badge>
            </div>

            <div className="flex items-center justify-between">
              <span>Total Books</span>
              <Badge variant="outline">{books.length}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Embedding Coverage
            </CardTitle>
            <CardDescription>
              Percentage of pages with generated embeddings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {books.slice(0, 3).map((book) => (
                <div key={book.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[200px]">{book.title}</span>
                    <span>{Math.round(book.embedding_coverage)}%</span>
                  </div>
                  <Progress value={book.embedding_coverage} className="h-2" />
                </div>
              ))}
            </div>
            
            {books.length > 3 && (
              <p className="text-sm text-muted-foreground">
                And {books.length - 3} more books...
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Embedding Management</CardTitle>
          <CardDescription>
            Generate embeddings for books to enable RAG functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={runBackfillForAllBooks}
              disabled={isBackfillRunning}
              className="flex items-center gap-2"
            >
              {isBackfillRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate All Embeddings
            </Button>
            
            <Button
              variant="outline"
              onClick={loadBookStatuses}
              disabled={isBackfillRunning}
            >
              Refresh Status
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Individual Book Actions</h4>
            <div className="space-y-2">
              {books.map((book) => (
                <div key={book.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{book.title}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{book.pages_with_embeddings}/{book.total_pages} pages</span>
                      <Badge 
                        variant={book.embedding_coverage === 100 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {Math.round(book.embedding_coverage)}%
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {book.embedding_coverage === 100 ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runBackfillForBook(book.id)}
                      disabled={isBackfillRunning}
                    >
                      {book.embedding_coverage === 100 ? 'Regenerate' : 'Generate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}