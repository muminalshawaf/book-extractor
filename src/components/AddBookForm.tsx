import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ChevronDown } from "lucide-react";
import { callFunction } from "@/lib/functionsClient";

interface NewBookData {
  subject: string;
  totalPages: number;
  firstPageUrl: string;
  grade: number;
  semester: number;
  customSubjectEn?: string;
  customSubjectAr?: string;
  customBookId?: string;
  description?: string;
}

interface AddBookFormProps {
  rtl?: boolean;
  onBookAdded?: (bookId: string) => void;
}

const AddBookForm: React.FC<AddBookFormProps> = ({ rtl = false, onBookAdded }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [formData, setFormData] = useState<NewBookData>({
    subject: "",
    totalPages: 50,
    firstPageUrl: "",
    grade: 12,
    semester: 1,
    customSubjectEn: "",
    customSubjectAr: "",
    customBookId: "",
    description: ""
  });

  const subjects = [
    { value: "Mathematics", label: "Mathematics / رياضيات", arabic: "الرياضيات" },
    { value: "Physics", label: "Physics / فيزياء", arabic: "الفيزياء" },
    { value: "Chemistry", label: "Chemistry / كيمياء", arabic: "الكيمياء" },
    { value: "Biology", label: "Biology / أحياء", arabic: "الأحياء" },
    { value: "Arabic", label: "Arabic / عربي", arabic: "العربية" },
    { value: "English", label: "English / إنجليزي", arabic: "الإنجليزية" },
    { value: "History", label: "History / تاريخ", arabic: "التاريخ" },
    { value: "Geography", label: "Geography / جغرافيا", arabic: "الجغرافيا" },
    { value: "Islamic Studies", label: "Islamic Studies / تربية إسلامية", arabic: "التربية الإسلامية" },
    { value: "Custom", label: "مادة مخصصة / Custom Subject", arabic: "مادة مخصصة" }
  ];

  const handleInputChange = (field: keyof NewBookData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Generate Book ID from subject, grade, and semester
  const generateBookId = (subject: string, grade: number, semester: number) => {
    const subjectCode = subject.toLowerCase().replace(/\s+/g, '');
    return `${subjectCode}${grade}-${semester}`;
  };

  // Generate Book Title in Arabic
  const generateBookTitle = (subject: string, grade: number, semester: number, customSubjectAr?: string) => {
    let subjectInArabic;
    
    if (subject === "Custom" && customSubjectAr) {
      subjectInArabic = customSubjectAr;
    } else {
      const subjectObj = subjects.find(s => s.value === subject);
      subjectInArabic = subjectObj?.arabic || subject;
    }
    
    return `كتاب ${subjectInArabic} - الصف ${grade} - الفصل ${semester}`;
  };

  // Extract base URL from first page URL
  const extractBaseUrl = (url: string) => {
    if (!url) return "";
    
    try {
      // Remove the filename from the URL to get the base directory
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      pathParts.pop(); // Remove the filename
      urlObj.pathname = pathParts.join('/');
      return urlObj.toString().replace(/\/$/, ''); // Remove trailing slash
    } catch {
      // Fallback: just remove everything after the last slash
      return url.substring(0, url.lastIndexOf('/'));
    }
  };

  // Validation function
  const validateForm = () => {
    if (!formData.subject) {
      return "يرجى اختيار المادة الدراسية";
    }
    
    if (formData.subject === "Custom") {
      if (!formData.customSubjectEn?.trim()) {
        return "يرجى إدخال اسم المادة باللغة الإنجليزية";
      }
      if (!formData.customSubjectAr?.trim()) {
        return "يرجى إدخال اسم المادة باللغة العربية";
      }
    }
    
    if (!formData.firstPageUrl?.trim()) {
      return "يرجى إدخال رابط الصفحة الأولى";
    }
    
    if (formData.totalPages < 1 || formData.totalPages > 1000) {
      return "عدد الصفحات يجب أن يكون بين 1 و 1000";
    }
    
    if (formData.grade < 1 || formData.grade > 12) {
      return "الصف الدراسي يجب أن يكون بين 1 و 12";
    }
    
    if (formData.semester < 1 || formData.semester > 2) {
      return "الفصل الدراسي يجب أن يكون 1 أو 2";
    }
    
    // Validate URL format
    try {
      new URL(formData.firstPageUrl);
    } catch {
      return "رابط الصفحة الأولى غير صالح";
    }
    
    return null;
  };

  // Function to add book to database and process all pages
  const addBookToLibrary = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Generate book details
      const bookId = formData.customBookId || generateBookId(formData.subject === "Custom" ? formData.customSubjectEn! : formData.subject, formData.grade, formData.semester);
      const bookTitle = generateBookTitle(formData.subject, formData.grade, formData.semester, formData.customSubjectAr);
      
      // Extract base URL for page generation
      const baseUrl = extractBaseUrl(formData.firstPageUrl);
      
      // Prepare book data for database
      const bookData = {
        book_id: bookId,
        title: bookTitle,
        subject: formData.subject === "Custom" ? formData.customSubjectEn : formData.subject,
        subject_ar: formData.subject === "Custom" ? formData.customSubjectAr : 
                    subjects.find(s => s.value === formData.subject)?.arabic,
        grade: formData.grade,
        semester_range: formData.semester.toString(),
        description: formData.description || undefined,
        base_page_url: baseUrl,
        total_pages: formData.totalPages
      };

      console.log("Adding complete book with data:", bookData);
      
      // Step 1: Add book to database
      toast.loading('إضافة الكتاب إلى قاعدة البيانات...', { id: 'book-addition' });
      const result = await callFunction('admin-add-book', bookData);
      
      if (!result.success) {
        throw new Error(result.error || 'فشل في إضافة الكتاب إلى قاعدة البيانات');
      }
      
      console.log('Book added to database:', result);
      
      // Step 2: Start processing all pages for the reader
      toast.loading('بدء معالجة صفحات الكتاب للقارئ...', { id: 'book-addition' });
      
      const processingResult = await callFunction('process-complete-book', {
        book_id: bookId,
        total_pages: formData.totalPages,
        base_page_url: baseUrl,
        title: bookTitle
      });
      
      console.log('Book processing started:', processingResult);
      
      toast.success(`تم إضافة الكتاب "${bookTitle}" بنجاح وبدء معالجة الصفحات`, { id: 'book-addition' });
      
      // Navigate to admin processing page for this book
      if (onBookAdded) {
        onBookAdded(bookId);
      } else {
        // Fallback navigation
        const url = `/admin/processing?bookId=${bookId}`;
        window.location.href = url;
      }
      
      // Reset form
      setFormData({
        subject: "",
        totalPages: 50,
        firstPageUrl: "",
        grade: 12,
        semester: 1,
        customSubjectEn: "",
        customSubjectAr: "",
        customBookId: "",
        description: ""
      });

    } catch (error: any) {
      console.error("خطأ في إضافة الكتاب:", error);
      toast.error(error.message || "حدث خطأ أثناء إضافة الكتاب إلى قاعدة البيانات", { id: 'book-addition' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full cursor-pointer">
              <div>
                <CardTitle className="text-2xl font-bold">
                  إضافة كتاب جديد إلى المكتبة والقارئ
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  سيتم حفظ الكتاب في قاعدة البيانات وإنشاء جميع الصفحات في القارئ مع معالجة المحتوى
                </p>
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="subject">المادة الدراسية *</Label>
          <Select 
            value={formData.subject} 
            onValueChange={(value) => handleInputChange('subject', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر المادة الدراسية" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-background border shadow-lg">
              {subjects.map((subject) => (
                <SelectItem key={subject.value} value={subject.value}>
                  {subject.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.subject === "Custom" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="customSubjectEn">اسم المادة (بالإنجليزية) *</Label>
              <Input
                id="customSubjectEn"
                type="text"
                value={formData.customSubjectEn}
                onChange={(e) => handleInputChange('customSubjectEn', e.target.value)}
                placeholder="Subject Name in English"
                className="dir-ltr"
                required={formData.subject === "Custom"}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customSubjectAr">اسم المادة (بالعربية) *</Label>
              <Input
                id="customSubjectAr"
                type="text"
                value={formData.customSubjectAr}
                onChange={(e) => handleInputChange('customSubjectAr', e.target.value)}
                placeholder="اسم المادة بالعربية"
                required={formData.subject === "Custom"}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="grade">الصف الدراسي *</Label>
            <Select 
              value={formData.grade.toString()} 
              onValueChange={(value) => handleInputChange('grade', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الصف" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background border shadow-lg max-h-60 overflow-y-auto">
                {Array.from({length: 12}, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    الصف {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="semester">الفصل الدراسي *</Label>
            <Select 
              value={formData.semester.toString()} 
              onValueChange={(value) => handleInputChange('semester', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الفصل" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background border shadow-lg">
                <SelectItem value="1">الفصل الأول</SelectItem>
                <SelectItem value="2">الفصل الثاني</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="totalPages">عدد الصفحات الإجمالي *</Label>
          <Input
            id="totalPages"
            type="number"
            min="1"
            max="1000"
            value={formData.totalPages}
            onChange={(e) => handleInputChange('totalPages', parseInt(e.target.value) || 1)}
            required
          />
          <p className="text-xs text-muted-foreground">
            العدد الإجمالي لصفحات الكتاب (1-1000)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="firstPageUrl">رابط الصفحة الأولى *</Label>
          <Input
            id="firstPageUrl"
            type="url"
            value={formData.firstPageUrl}
            onChange={(e) => handleInputChange('firstPageUrl', e.target.value)}
            placeholder="https://example.com/book/page-1.jpg"
            className="dir-ltr"
            required
          />
          <p className="text-sm text-muted-foreground">
            سيتم توليد روابط باقي الصفحات تلقائياً بناءً على هذا الرابط
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">وصف الكتاب (اختياري)</Label>
          <Input
            id="description"
            type="text"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="وصف مختصر عن محتوى الكتاب"
          />
          <p className="text-xs text-muted-foreground">
            وصف قصير يساعد في تصنيف وفهرسة الكتاب
          </p>
        </div>

        {formData.subject && formData.grade && formData.semester && (
          <div className="p-4 bg-muted rounded-lg border">
            <div className="space-y-4">
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
                  معرف فريد للكتاب - يُستخدم في الروابط والمراجع
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">معاينة عنوان الكتاب:</p>
                <p className="text-sm p-2 bg-background border rounded">{generateBookTitle(formData.subject, formData.grade, formData.semester, formData.customSubjectAr)}</p>
              </div>
              
              {formData.firstPageUrl && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">معاينة روابط الصفحات:</p>
                  <div className="text-xs text-muted-foreground space-y-1 p-2 bg-background border rounded">
                    <div>الصفحة 1: {extractBaseUrl(formData.firstPageUrl)}/page-1.jpg</div>
                    <div>الصفحة 2: {extractBaseUrl(formData.firstPageUrl)}/page-2.jpg</div>
                    <div>الصفحة 3: {extractBaseUrl(formData.firstPageUrl)}/page-3.jpg</div>
                    <div className="text-muted-foreground/70">... وهكذا حتى الصفحة {formData.totalPages}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Button 
          onClick={addBookToLibrary} 
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              جاري إضافة الكتاب إلى قاعدة البيانات...
            </>
          ) : (
            "إضافة الكتاب إلى المكتبة والقارئ"
          )}
        </Button>

        {formData.subject && formData.grade && formData.semester && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">ملاحظة هامة:</p>
            <p>سيتم حفظ الكتاب في قاعدة البيانات وإنشاء جميع الصفحات في القارئ مع بدء معالجة المحتوى تلقائياً</p>
          </div>
        )}
      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default AddBookForm;