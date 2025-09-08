import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
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

const AddBookForm = () => {
  const [isLoading, setIsLoading] = useState(false);
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

  // Generate page pattern detection
  const generatePagePattern = (url: string) => {
    if (!url) return "page-{n}.jpg";
    
    const filename = url.split('/').pop() || "";
    
    // Try to detect common patterns
    if (filename.includes('page-1')) {
      return filename.replace('1', '{n}');
    } else if (filename.includes('-1.')) {
      return filename.replace('-1.', '-{n}.');
    } else if (/\d+/.test(filename)) {
      return filename.replace(/\d+/, '{n}');
    }
    
    return "page-{n}.jpg";
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

  // Function to add book to database
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
        grade: formData.grade,
        semester_range: formData.semester.toString(),
        description: formData.description || undefined,
        base_page_url: baseUrl,
        total_pages: formData.totalPages
      };

      console.log("Adding book to database:", bookData);

      // Call the admin add book function
      const result = await callFunction('admin-add-book', bookData);
      
      if (result.success) {
        toast.success(`تم إضافة الكتاب "${bookTitle}" بنجاح!`);
        
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
      } else {
        throw new Error(result.error || 'فشل في إضافة الكتاب');
      }

    } catch (error: any) {
      console.error("خطأ في إضافة الكتاب:", error);
      toast.error(error.message || "حدث خطأ أثناء إضافة الكتاب");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          إضافة كتاب جديد إلى المكتبة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="subject">المادة الدراسية</Label>
          <Select 
            value={formData.subject} 
            onValueChange={(value) => handleInputChange('subject', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر المادة الدراسية" />
            </SelectTrigger>
            <SelectContent>
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
              <Label htmlFor="customSubjectEn">اسم المادة (بالإنجليزية)</Label>
              <Input
                id="customSubjectEn"
                type="text"
                value={formData.customSubjectEn}
                onChange={(e) => handleInputChange('customSubjectEn', e.target.value)}
                placeholder="Subject Name in English"
                className="dir-ltr"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customSubjectAr">اسم المادة (بالعربية)</Label>
              <Input
                id="customSubjectAr"
                type="text"
                value={formData.customSubjectAr}
                onChange={(e) => handleInputChange('customSubjectAr', e.target.value)}
                placeholder="اسم المادة بالعربية"
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="grade">الصف الدراسي</Label>
            <Select 
              value={formData.grade.toString()} 
              onValueChange={(value) => handleInputChange('grade', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الصف" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({length: 12}, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    الصف {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="semester">الفصل الدراسي</Label>
            <Select 
              value={formData.semester.toString()} 
              onValueChange={(value) => handleInputChange('semester', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الفصل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">الفصل الأول</SelectItem>
                <SelectItem value="2">الفصل الثاني</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="totalPages">عدد الصفحات الإجمالي</Label>
          <Input
            id="totalPages"
            type="number"
            min="1"
            max="1000"
            value={formData.totalPages}
            onChange={(e) => handleInputChange('totalPages', parseInt(e.target.value) || 1)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="firstPageUrl">رابط الصفحة الأولى</Label>
          <Input
            id="firstPageUrl"
            type="url"
            value={formData.firstPageUrl}
            onChange={(e) => handleInputChange('firstPageUrl', e.target.value)}
            placeholder="https://example.com/book/page-1.jpg"
            className="dir-ltr"
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
            {formData.firstPageUrl && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">معاينة روابط الصفحات:</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>الصفحة 1: {extractBaseUrl(formData.firstPageUrl)}/page-1.jpg</div>
                  <div>الصفحة 2: {extractBaseUrl(formData.firstPageUrl)}/page-2.jpg</div>
                  <div>الصفحة 3: {extractBaseUrl(formData.firstPageUrl)}/page-3.jpg</div>
                  <div>...</div>
                </div>
              </div>
            )}
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
              جاري إضافة الكتاب...
            </>
          ) : (
            "إضافة الكتاب إلى المكتبة"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AddBookForm;