-- Update page 52 OCR data to correctly represent the linked list diagram
UPDATE page_summaries 
SET 
  ocr_text = 'تمارين على القوائم المترابطة

6
باستخدام العقد التالية ارسم القائمة المترابطة، ثم اكتب القيم في القائمة بالترتيب السليم.
الرأس = 3

الرسم التوضيحي يظهر 4 عقد من اليسار إلى اليمين:
- العقدة 5: تحتوي على القيمة 9 ومؤشر يشير إلى العقدة 2
- العقدة 3: تحتوي على القيمة 0 ومؤشر يشير إلى العقدة 4  
- العقدة 4: تحتوي على القيمة 1 ومؤشر يشير إلى العقدة 5
- العقدة 2: تحتوي على القيمة -3 ومؤشر يشير إلى null (نهاية القائمة)

7
أنشئ قائمة تضم الأرقام التالية: 5 و 20 و 45 و 8 و 1.
• ارسم العقد في القائمة المترابطة.
• صف عملية إضافة الرقم 7 بعد الرقم 45.
• ارسم القائمة الجديدة.
• صف العملية المطلوبة لحذف العقدة الثانية من القائمة.
• ارسم القائمة المترابطة النهائية.

وزارة التعليم
Ministry of Education
2023 - 1447

52',
  ocr_structured = jsonb_set(
    ocr_structured,
    '{visual_elements,0}',
    '{"type": "diagram", "title": "العقد الأولية للقائمة المترابطة", "description": "A series of blue rectangular nodes arranged from left to right, each divided into two sections. The left section contains a numerical data value, and the right section represents a pointer to the next node. The rightmost node has a black dot in its pointer section, indicating a null or end-of-list pointer.", "axes_labels": null, "data_description": "The diagram shows 4 distinct nodes arranged from left to right. Node 5: Data value = 9, Pointer = Node 2. Node 3: Data value = 0, Pointer = Node 4. Node 4: Data value = 1, Pointer = Node 5. Node 2: Data value = -3, Pointer = null (end of list). The question specifies الرأس = 3 (Head = 3), indicating that Node 3 is the starting point of the linked list.", "key_values": ["Node 5: Data 9, Pointer Node 2", "Node 3: Data 0, Pointer Node 4", "Node 4: Data 1, Pointer Node 5", "Node 2: Data -3, Pointer null"], "numeric_data": null, "table_structure": null, "educational_context": "These nodes represent a linked list data structure. Students need to arrange them in the correct order based on the pointer relationships, starting from the head node (Node 3). Following the pointers: Node 3 → Node 4 → Node 5 → Node 2 → null, giving the sequence: 0, 1, 9, -3.", "estimated": false}'::jsonb
  )
WHERE book_id = 'artificialintelligence12-1' AND page_number = 52;