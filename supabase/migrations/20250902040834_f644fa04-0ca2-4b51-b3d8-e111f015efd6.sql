UPDATE page_summaries 
SET ocr_text = ocr_text || '

--- SECTION: الجدول 6-1 ---
المذيب        KF (°C/m)    درجة التجمد °C
الماء         1.86         0.0
البنزين      5.12         5.5
رابع كلوريد الكربون  29.8   -23.0
الإيثانول    1.99        -114.1
الكلوروفورم  4.68        -63.5'
WHERE book_id = 'chem12-1-3' AND page_number = 50;