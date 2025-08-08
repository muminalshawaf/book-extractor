import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, FileImage } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface UploadedImage {
  id: string;
  src: string;
  alt: string;
  file: File;
}

interface ImageUploaderProps {
  onImagesChange: (images: UploadedImage[]) => void;
  rtl?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesChange, rtl = false }) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(rtl ? 'يرجى اختيار ملفات صور فقط' : 'Please select image files only');
        return false;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error(rtl ? 'حجم الملف كبير جداً (الحد الأقصى 10 ميجا)' : 'File too large (max 10MB)');
        return false;
      }
      return true;
    });

    const newImages: UploadedImage[] = validFiles.map((file, index) => ({
      id: `uploaded-${Date.now()}-${index}`,
      src: URL.createObjectURL(file),
      alt: `${rtl ? 'صفحة مرفوعة' : 'Uploaded page'} ${uploadedImages.length + index + 1}`,
      file
    }));

    const updatedImages = [...uploadedImages, ...newImages];
    setUploadedImages(updatedImages);
    onImagesChange(updatedImages);

    toast.success(rtl ? `تم رفع ${newImages.length} صورة` : `Uploaded ${newImages.length} image(s)`);
  }, [uploadedImages, onImagesChange, rtl]);

  const removeImage = (id: string) => {
    const updatedImages = uploadedImages.filter(img => {
      if (img.id === id) {
        URL.revokeObjectURL(img.src); // Clean up object URL
        return false;
      }
      return true;
    });
    setUploadedImages(updatedImages);
    onImagesChange(updatedImages);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const clearAll = () => {
    uploadedImages.forEach(img => URL.revokeObjectURL(img.src));
    setUploadedImages([]);
    onImagesChange([]);
    toast(rtl ? 'تم مسح جميع الصور' : 'All images cleared');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {rtl ? 'رفع صور الكتاب' : 'Upload Book Images'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            "hover:border-primary hover:bg-primary/5"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <FileImage className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {rtl ? 'اسحب وأفلت الصور هنا أو' : 'Drag and drop images here or'}
            </p>
            <label htmlFor="image-upload">
              <Button variant="outline" className="cursor-pointer">
                {rtl ? 'اختر الملفات' : 'Choose Files'}
              </Button>
              <input
                id="image-upload"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {rtl ? 'صيغ مدعومة: JPG, PNG, GIF (حد أقصى 10 ميجا لكل ملف)' : 'Supported: JPG, PNG, GIF (max 10MB each)'}
          </p>
        </div>

        {/* Uploaded Images Grid */}
        {uploadedImages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {rtl ? `الصور المرفوعة (${uploadedImages.length})` : `Uploaded Images (${uploadedImages.length})`}
              </h3>
              <Button variant="outline" size="sm" onClick={clearAll}>
                {rtl ? 'مسح الكل' : 'Clear All'}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {uploadedImages.map((image, index) => (
                <div key={image.id} className="relative group">
                  <div className="aspect-[3/4] rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-1 text-center rounded-b-lg">
                    {rtl ? `صفحة ${index + 1}` : `Page ${index + 1}`}
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(image.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImageUploader;