import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enhancedBooks } from "@/data/enhancedBooks";

interface NewBookData {
  subject: string;
  firstPageUrl: string;
  totalPages: number;
  grade: number;
  semester: number;
  customSubjectEn?: string;
  customSubjectAr?: string;
  customBookId?: string;
}

const AddBookForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<NewBookData>({
    subject: "",
    firstPageUrl: "",
    totalPages: 1,
    grade: 12,
    semester: 1,
    customSubjectEn: "",
    customSubjectAr: "",
    customBookId: ""
  });

  const subjects = [
    { value: "Mathematics", label: "Mathematics / رياضيات", arabic: "رياضيات" },
    { value: "Physics", label: "Physics / فيزياء", arabic: "فيزياء" },
    { value: "Chemistry", label: "Chemistry / كيمياء", arabic: "كيمياء" },
    { value: "Biology", label: "Biology / أحياء", arabic: "أحياء" },
    { value: "Arabic", label: "Arabic / عربي", arabic: "عربي" },
    { value: "English", label: "English / إنجليزي", arabic: "إنجليزي" },
    { value: "History", label: "History / تاريخ", arabic: "تاريخ" },
    { value: "Geography", label: "Geography / جغرافيا", arabic: "جغرافيا" },
    { value: "Islamic Studies", label: "Islamic Studies / تربية إسلامية", arabic: "تربية إسلامية" },
    { value: "Custom", label: "مادة مخصصة / Custom Subject", arabic: "مادة مخصصة" }
  ];

  const handleInputChange = (field: keyof NewBookData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const generateBookId = (subject: string, grade: number, semester: number) => {
    const subjectCode = subject.toLowerCase().replace(/\s+/g, '');
    return `${subjectCode}${grade}-${semester}`;
  };

  const generateBookTitle = (subject: string, grade: number, semester: number, customSubjectAr?: string) => {
    if (subject === "Custom" && customSubjectAr) {
      return `كتاب ${customSubjectAr} الصف ${grade} (الفصل ${semester})`;
    }
    const subjectObj = subjects.find(s => s.value === subject);
    const arabicSubject = subjectObj?.arabic || subject;
    return `كتاب ${arabicSubject} الصف ${grade} (الفصل ${semester})`;
  };

  const extractBaseUrl = (firstPageUrl: string) => {
    try {
      const url = new URL(firstPageUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      // Remove the filename to get the base directory
      const basePath = pathParts.slice(0, -1).join('/');
      return url.origin + basePath + '/';
    } catch (error) {
      throw new Error("Invalid URL format");
    }
  };

  const generatePagePattern = (firstPageUrl: string, totalPages: number) => {
    try {
      const url = new URL(firstPageUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      // Extract pattern from filename (e.g., "kitab-alfizya3-12025-2.webp" -> "kitab-alfizya3-12025-")
      const match = fileName.match(/^(.+?)(\d+)(\.[^.]+)$/);
      if (!match) {
        throw new Error("Cannot detect page numbering pattern from filename");
      }
      
      const prefix = match[1];
      const extension = match[3];
      
      return { prefix, extension };
    } catch (error) {
      throw new Error("Invalid page URL pattern");
    }
  };

  const validateForm = () => {
    if (!formData.subject) {
      toast.error("Please select a subject");
      return false;
    }
    
    if (formData.subject === "Custom") {
      if (!formData.customSubjectEn || !formData.customSubjectAr) {
        toast.error("Please enter both English and Arabic names for the custom subject");
        return false;
      }
    }
    
    if (!formData.firstPageUrl) {
      toast.error("Please provide the first page URL");
      return false;
    }
    
    if (formData.totalPages < 1 || formData.totalPages > 1000) {
      toast.error("Number of pages must be between 1 and 1000");
      return false;
    }
    
    if (formData.grade < 1 || formData.grade > 12) {
      toast.error("Grade must be between 1 and 12");
      return false;
    }
    
    if (formData.semester < 1 || formData.semester > 3) {
      toast.error("Semester must be 1, 2, or 3");
      return false;
    }

    try {
      new URL(formData.firstPageUrl);
    } catch {
      toast.error("Please provide a valid URL");
      return false;
    }

    return true;
  };

  const addBookToLibrary = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    
    try {
      // Generate book details
      const bookId = formData.customBookId || generateBookId(formData.subject === "Custom" ? formData.customSubjectEn! : formData.subject, formData.grade, formData.semester);
      const bookTitle = generateBookTitle(formData.subject, formData.grade, formData.semester, formData.customSubjectAr);
      
      // Check if book already exists
      const existingBook = enhancedBooks.find(book => book.id === bookId);
      if (existingBook) {
        toast.error(`Book with ID "${bookId}" already exists in the library`);
        return;
      }

      // Extract URL patterns
      const baseUrl = extractBaseUrl(formData.firstPageUrl);
      const { prefix, extension } = generatePagePattern(formData.firstPageUrl, formData.totalPages);
      
      // Get subject info
      const finalSubject = formData.subject === "Custom" ? formData.customSubjectEn! : formData.subject;
      const finalSubjectArabic = formData.subject === "Custom" ? formData.customSubjectAr! : 
        (subjects.find(s => s.value === formData.subject)?.arabic || formData.subject);
      
      // Create new book object
      const newBook = {
        id: bookId,
        title: bookTitle,
        slug: `${finalSubjectArabic}-${formData.semester}`,
        rtl: true,
        grade: 12, // Default to grade 12, can be made configurable
        semester: formData.semester,
        subject: finalSubject,
        subjectArabic: finalSubjectArabic,
        cover: "/placeholder.svg",
        totalPages: formData.totalPages,
        description: `كتاب ${finalSubjectArabic} للصف ${formData.grade} - الفصل الدراسي ${formData.semester}`,
        keywords: [finalSubjectArabic, finalSubject, `Grade ${formData.grade}`, `Semester ${formData.semester}`, "نظام المسارات"],
        buildPages: () => {
          return Array.from({ length: formData.totalPages }, (_, i) => ({
            src: `${baseUrl}${prefix}${i + 2}${extension}`,
            alt: `صفحة كتاب ${finalSubjectArabic} ${i + 2}`,
          }));
        },
        lessons: []
      };

      // Here we would normally update the books file, but since we can't modify read-only files,
      // we'll show the user the generated book configuration
      console.log("Generated book configuration:", newBook);
      
      toast.success(`Book "${bookTitle}" configuration generated successfully!`);
      toast.info("Book configuration logged to console. In a production environment, this would be added to the library automatically.");
      
      // Reset form
      setFormData({
        subject: "",
        firstPageUrl: "",
        totalPages: 1,
        grade: 12,
        semester: 1,
        customSubjectEn: "",
        customSubjectAr: "",
        customBookId: ""
      });

    } catch (error) {
      console.error("Error adding book:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          إضافة كتاب جديد إلى المكتبة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            استخدم هذا النموذج لإضافة كتاب جديد إلى المكتبة. تأكد من صحة رابط الصفحة الأولى ونمط ترقيم الصفحات.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subject">المادة / Subject *</Label>
            <Select value={formData.subject} onValueChange={(value) => handleInputChange('subject', value)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المادة..." />
              </SelectTrigger>
              <SelectContent>
                {subjects.map(subject => (
                  <SelectItem key={subject.value} value={subject.value}>
                    {subject.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade">الصف / Grade *</Label>
            <Input
              id="grade"
              type="number"
              min="1"
              max="12"
              value={formData.grade}
              onChange={(e) => handleInputChange('grade', parseInt(e.target.value) || 12)}
              placeholder="مثال: 12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="semester">الفصل الدراسي / Semester *</Label>
            <Select value={formData.semester.toString()} onValueChange={(value) => handleInputChange('semester', parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفصل..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">الفصل الأول</SelectItem>
                <SelectItem value="2">الفصل الثاني</SelectItem>
                <SelectItem value="3">الفصل الثالث</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalPages">عدد الصفحات / Total Pages *</Label>
            <Input
              id="totalPages"
              type="number"
              min="1"
              max="1000"
              value={formData.totalPages}
              onChange={(e) => handleInputChange('totalPages', parseInt(e.target.value) || 1)}
              placeholder="مثال: 200"
            />
          </div>
        </div>

        {formData.subject === "Custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="customSubjectEn">Subject Name (English) *</Label>
              <Input
                id="customSubjectEn"
                type="text"
                value={formData.customSubjectEn || ""}
                onChange={(e) => handleInputChange('customSubjectEn', e.target.value)}
                placeholder="e.g., Computer Science"
                className="dir-ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customSubjectAr">اسم المادة (عربي) *</Label>
              <Input
                id="customSubjectAr"
                type="text"
                value={formData.customSubjectAr || ""}
                onChange={(e) => handleInputChange('customSubjectAr', e.target.value)}
                placeholder="مثال: علوم الحاسوب"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="firstPageUrl">رابط الصفحة الأولى / First Page URL *</Label>
          <Input
            id="firstPageUrl"
            type="url"
            value={formData.firstPageUrl}
            onChange={(e) => handleInputChange('firstPageUrl', e.target.value)}
            placeholder="https://example.com/books/subject/page-2.webp"
            className="dir-ltr"
          />
          <p className="text-sm text-muted-foreground">
            مثال: https://ksa.idros.ai/books/math12-1-3/math12-3-1-2.webp
          </p>
        </div>

        {formData.subject && formData.grade && formData.semester && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="bookId">معرف الكتاب / Book ID</Label>
              <Input
                id="bookId"
                type="text"
                value={formData.customBookId || generateBookId(formData.subject === "Custom" ? formData.customSubjectEn || "custom" : formData.subject, formData.grade, formData.semester)}
                onChange={(e) => handleInputChange('customBookId', e.target.value)}
                placeholder={generateBookId(formData.subject === "Custom" ? formData.customSubjectEn || "custom" : formData.subject, formData.grade, formData.semester)}
                className="dir-ltr font-mono"
              />
              <p className="text-xs text-muted-foreground">
                يمكنك تعديل معرف الكتاب أو استخدام المعرف المُولد تلقائياً
              </p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">معاينة عنوان الكتاب:</p>
              <p className="text-sm">{generateBookTitle(formData.subject, formData.grade, formData.semester, formData.customSubjectAr)}</p>
            </div>
          </div>
        )}

        <Button 
          onClick={addBookToLibrary} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              جاري الإضافة...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              إضافة الكتاب إلى المكتبة
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AddBookForm;