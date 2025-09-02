import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Edit,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Share2,
  XCircle,
} from "lucide-react";

import { books } from "@/data/books";
import { enhancedBooks } from "@/data/enhancedBooks";
import { supabase } from "@/integrations/supabase/client";
import { EnhancedSummary } from "@/components/EnhancedSummary";
import { StrictModeToggle } from "@/components/StrictModeToggle";
import { extractStructuredData } from "@/lib/ocrStructuredExtractor";

export interface BookPage {
  src: string;
  alt: string;
}

const BookViewer = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(enhancedBooks.find((b) => b.id === bookId) || enhancedBooks[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(book.totalPages || 1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [strictMode, setStrictMode] = useState(true);

  useEffect(() => {
    if (bookId) {
      const selectedBook = enhancedBooks.find((b) => b.id === bookId) || enhancedBooks[0];
      setBook(selectedBook);
      setTotalPages(selectedBook.totalPages || 1);
      setCurrentPage(1);
    }
  }, [bookId]);

  useEffect(() => {
    const fetchPageContent = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("page_summaries")
          .select("ocr_text, summary_md")
          .eq("book_id", bookId)
          .eq("page_number", currentPage)
          .single();

        if (error) {
          console.error("Error fetching page content:", error);
          setCurrentText("");
          setSummary("");
        } else {
          setCurrentText(data?.ocr_text || "");
          setSummary(data?.summary_md || "");
        }
      } catch (e) {
        console.error("Unexpected error fetching page content:", e);
        setError("Failed to load page content.");
        setCurrentText("");
        setSummary("");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPageContent();
  }, [bookId, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleScaleChange = (newScale: number[]) => {
    setScale(newScale[0] / 100);
  };

  const handleRotationChange = (newRotation: number[]) => {
    setRotation(newRotation[0]);
  };

  const handleReset = () => {
    setScale(1.0);
    setRotation(0);
  };

  const handleSummarize = async () => {
    if (!currentText.trim()) {
      toast({
        title: "لا يوجد نص",
        description: "لا يوجد نص في هذه الصفحة للتلخيص",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Starting summarization with strict mode:', strictMode);
      
      // Extract or retrieve structured OCR data
      let ocrData = null;
      
      // Try to get existing OCR data from database first
      try {
        const { data: existingPage } = await supabase
          .from('page_summaries')
          .select('ocr_json')
          .eq('book_id', bookId)
          .eq('page_number', currentPage)
          .single();
          
        if (existingPage?.ocr_json) {
          ocrData = existingPage.ocr_json;
          console.log('Using existing OCR data from database');
        }
      } catch (dbError) {
        console.log('No existing OCR data found, will extract from text');
      }
      
      // If no existing OCR data, extract it from the current text
      if (!ocrData && currentText.includes('الجدول') || currentText.includes('الشكل')) {
        const extractedData = extractStructuredDataFromText(currentText);
        if (extractedData) {
          ocrData = { rawStructuredData: { visual_elements: extractedData } };
          console.log('Extracted structured data from text:', extractedData.length, 'elements');
        }
      }

      const response = await supabase.functions.invoke('summarize', {
        body: { 
          text: currentText, 
          lang: 'ar', 
          page: currentPage, 
          title: book.title,
          ocrData,
          strictMode,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Summarization failed');
      }

      const summaryText = response.data?.summary;
      if (!summaryText) {
        throw new Error('No summary returned from API');
      }

      // Save summary with OCR data and validation metadata
      const { error: saveError } = await supabase
        .from('page_summaries')
        .upsert({
          book_id: bookId,
          page_number: currentPage,
          summary: summaryText,
          ocr_text: currentText,
          ocr_json: ocrData,
          validation_meta: response.data?.metadata || {},
          strict_validated: strictMode,
          confidence: 0.95,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (saveError) {
        console.error('Error saving summary:', saveError);
        toast({
          title: "تحذير",
          description: "تم إنشاء الملخص لكن حدثت مشكلة في الحفظ",
          variant: "destructive",
        });
      }

      setSummary(summaryText);
      
      toast({
        title: "تم التلخيص بنجاح",
        description: `تم إنشاء ملخص الصفحة ${currentPage}${strictMode ? ' (وضع صارم)' : ''}`,
      });

    } catch (error) {
      console.error('Summarization error:', error);
      
      if (error.message?.includes('validation failed')) {
        setError(`فشل في التحقق من صحة الملخص: ${error.message}`);
        toast({
          title: "فشل التحقق من الصحة",
          description: "الملخص لا يلبي المعايير المطلوبة. جرب الوضع غير الصارم أو راجع المحتوى.",
          variant: "destructive",
        });
      } else {
        setError(`خطأ في التلخيص: ${error.message}`);
        toast({
          title: "خطأ في التلخيص",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to extract structured data from text
  const extractStructuredDataFromText = (text: string) => {
    const elements = [];
    
    // Extract tables
    const tableRegex = /(?:الجدول|جدول)\s*(\d+-?\d*)[:\s]*([^]*?)(?=\n\n|$|(?:الجدول|جدول|الشكل|شكل))/gi;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(text)) !== null) {
      const tableNumber = tableMatch[1];
      const tableContent = tableMatch[2].trim();
      
      // Parse table rows
      const lines = tableContent.split('\n').filter(line => line.trim());
      const headers = [];
      const rows = [];
      
      lines.forEach((line, index) => {
        const columns = line.split(/\s{2,}|\t/).map(col => col.trim()).filter(col => col);
        if (columns.length > 0) {
          if (index < 2) {
            headers.push(...columns);
          } else {
            rows.push(columns);
          }
        }
      });
      
      if (headers.length > 0 && rows.length > 0) {
        elements.push({
          type: 'table',
          title: `الجدول ${tableNumber}`,
          description: `Table with ${rows.length} data rows`,
          table_structure: {
            headers: [...new Set(headers)],
            rows: rows,
          },
          key_values: rows.flat(),
        });
      }
    }
    
    // Extract figures
    const figureRegex = /(?:الشكل|شكل)\s*(\d+-?\d*)[:\s]*([^]*?)(?=\n\n|$|(?:الشكل|شكل|الجدول|جدول))/gi;
    let figureMatch;
    
    while ((figureMatch = figureRegex.exec(text)) !== null) {
      elements.push({
        type: 'figure',
        title: `الشكل ${figureMatch[1]}`,
        description: figureMatch[2].trim(),
      });
    }
    
    return elements.length > 0 ? elements : null;
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleFirstPage = () => {
    setCurrentPage(1);
  };

  const handleLastPage = () => {
    setCurrentPage(totalPages);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const pageNumber = parseInt(event.currentTarget.value, 10);
      if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
        setCurrentPage(pageNumber);
      } else {
        toast({
          title: "رقم الصفحة غير صالح",
          description: `أدخل رقم صفحة بين 1 و ${totalPages}`,
          variant: "destructive",
        });
      }
    }
  };

  const handleBookChange = (bookId: string) => {
    navigate(`/book/${bookId}`);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 flex-none bg-gray-100 border-r border-gray-200 py-4 px-3">
        <div className="mb-4">
          <Label htmlFor="book-select" className="block text-sm font-medium text-gray-700">
            اختر كتاب
          </Label>
          <Select value={book.id} onValueChange={handleBookChange}>
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="اختر كتاب" />
            </SelectTrigger>
            <SelectContent>
              {enhancedBooks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-2" />

        <div className="mb-4">
          <Label htmlFor="page-number" className="block text-sm font-medium text-gray-700">
            رقم الصفحة
          </Label>
          <div className="relative mt-1 rounded-md shadow-sm">
            <Input
              type="number"
              name="page-number"
              id="page-number"
              className="block w-full pr-10 text-gray-900 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="أدخل رقم الصفحة"
              value={currentPage}
              onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
              onKeyDown={handleKeyDown}
            />
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
              <span className="text-gray-500 sm:text-sm">/ {totalPages}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between mb-4">
          <Button variant="outline" size="icon" onClick={handleFirstPage} disabled={currentPage === 1}>
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handlePreviousPage} disabled={currentPage === 1}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextPage} disabled={currentPage === totalPages}>
            <ArrowRightIcon className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleLastPage} disabled={currentPage === totalPages}>
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>

        <Separator className="my-2" />

        <div className="mb-4">
          <Label htmlFor="scale-slider" className="block text-sm font-medium text-gray-700">
            حجم الصفحة
          </Label>
          <Slider
            id="scale-slider"
            defaultValue={[scale * 100]}
            max={200}
            min={50}
            step={1}
            onValueChange={handleScaleChange}
            aria-label="حجم الصفحة"
            className="mt-2"
          />
          <div className="text-sm text-gray-500 mt-1">
            {scale * 100}%
          </div>
        </div>

        <div className="mb-4">
          <Label htmlFor="rotation-slider" className="block text-sm font-medium text-gray-700">
            تدوير الصفحة
          </Label>
          <Slider
            id="rotation-slider"
            defaultValue={[rotation]}
            max={360}
            min={0}
            step={1}
            onValueChange={handleRotationChange}
            aria-label="تدوير الصفحة"
            className="mt-2"
          />
          <div className="text-sm text-gray-500 mt-1">
            {rotation}°
          </div>
        </div>

        <Button variant="secondary" className="w-full" onClick={handleReset}>
          إعادة تعيين
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 py-2 px-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">
              {book.title} - صفحة {currentPage}
            </h1>
            <div>
              <Button
                variant="default"
                className="mr-2"
                onClick={handleSummarize}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري التلخيص...
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    تلخيص الصفحة
                  </>
                )}
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-2 text-sm text-red-600">
              <XCircle className="inline w-4 h-4 mr-1" />
              {error}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left panel - Book display */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full flex flex-col bg-white">
                <div className="flex-1 overflow-auto p-4">
                  <AspectRatio ratio={3 / 4} className="w-full">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-full bg-gray-100 rounded-md">
                        <Loader2 className="mr-2 h-6 w-6 animate-spin text-gray-500" />
                        <span className="text-gray-500">جاري تحميل الصفحة...</span>
                      </div>
                    ) : (
                      <img
                        src={book.buildPages()[currentPage - 1]?.src}
                        alt={`صفحة ${currentPage} من ${book.title}`}
                        style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
                        className="object-contain rounded-md shadow-md"
                      />
                    )}
                  </AspectRatio>
                </div>
                
                {/* Add Strict Mode Toggle */}
                <div className="p-3 border-b">
                  <StrictModeToggle
                    enabled={strictMode}
                    onChange={setStrictMode}
                  />
                </div>

                <div className="p-3 border-t">
                  <h3 className="text-sm font-medium text-gray-700">
                    نص الصفحة الحالي
                  </h3>
                  <div className="mt-2 text-sm text-gray-600 overflow-y-auto max-h-40">
                    {currentText ? (
                      currentText
                    ) : (
                      <span className="text-gray-500">لا يوجد نص متاح لهذه الصفحة.</span>
                    )}
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className="bg-gray-200" />

            {/* Right panel - Summary display */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full flex flex-col bg-white">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-medium text-gray-700">
                    ملخص الصفحة
                  </h3>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {summary ? (
                    <EnhancedSummary content={summary} />
                  ) : (
                    <div className="text-center text-gray-500">
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                          جاري إنشاء الملخص...
                        </>
                      ) : (
                        "لا يوجد ملخص متاح. اضغط على زر 'تلخيص الصفحة' لإنشاء ملخص."
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
};

export default BookViewer;
