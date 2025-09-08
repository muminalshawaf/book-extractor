-- Add Arabic subject name column to books table
ALTER TABLE public.books 
ADD COLUMN subject_ar TEXT;

-- Update existing records with Arabic subject names
UPDATE public.books 
SET subject_ar = CASE 
  WHEN subject = 'Chemistry' THEN 'الكيمياء'
  WHEN subject = 'Physics' THEN 'الفيزياء'
  WHEN subject = 'Mathematics' THEN 'الرياضيات'
  WHEN subject = 'Biology' THEN 'الأحياء'
  WHEN subject = 'Arabic' THEN 'العربية'
  WHEN subject = 'English' THEN 'الإنجليزية'
  WHEN subject = 'History' THEN 'التاريخ'
  WHEN subject = 'Geography' THEN 'الجغرافيا'
  WHEN subject = 'Islamic Studies' THEN 'التربية الإسلامية'
  ELSE subject
END;