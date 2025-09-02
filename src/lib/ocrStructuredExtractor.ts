
/**
 * OCR Structured Data Extractor
 * Extracts tables, graphs, and other structured data from OCR text
 */

export interface StructuredTable {
  title: string;
  headers: string[];
  rows: string[][];
  context?: string;
}

export interface StructuredGraph {
  title: string;
  description: string;
  data_points: Array<{ x: number; y: number; label?: string }>;
  axis_labels: { x: string; y: string };
}

export interface StructuredData {
  tables: StructuredTable[];
  graphs: StructuredGraph[];
  formulas: string[];
  key_values: string[];
  figures: Array<{ title: string; description: string }>;
}

/**
 * Extract structured data from OCR text
 */
export function extractStructuredData(ocrText: string): StructuredData {
  const data: StructuredData = {
    tables: extractTables(ocrText),
    graphs: extractGraphs(ocrText),
    formulas: extractFormulas(ocrText),
    key_values: extractKeyValues(ocrText),
    figures: extractFigures(ocrText),
  };

  console.log('Extracted structured data:', {
    tables: data.tables.length,
    graphs: data.graphs.length,
    formulas: data.formulas.length,
    figures: data.figures.length,
  });

  return data;
}

/**
 * Extract tables from OCR text
 */
function extractTables(text: string): StructuredTable[] {
  const tables: StructuredTable[] = [];
  
  // Look for table patterns with Arabic table identifiers
  const tableRegex = /(?:الجدول|جدول|Table)\s*(\d+-?\d*)[:\s]*([^]*?)(?=\n\n|$|(?:الجدول|جدول|Table))/gi;
  let match;
  
  while ((match = tableRegex.exec(text)) !== null) {
    const tableNumber = match[1];
    const tableContent = match[2].trim();
    
    // Parse table content
    const lines = tableContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) continue;
    
    // First line is usually the title or headers
    const title = `الجدول ${tableNumber}`;
    
    // Extract headers and rows
    const headers: string[] = [];
    const rows: string[][] = [];
    
    lines.forEach((line, index) => {
      // Split by multiple spaces or tabs to identify columns
      const columns = line.split(/\s{2,}|\t/).map(col => col.trim()).filter(col => col);
      
      if (index === 0 || index === 1) {
        // First two lines might be headers
        headers.push(...columns);
      } else {
        // Data rows
        if (columns.length > 0) {
          rows.push(columns);
        }
      }
    });
    
    // Clean up headers (remove duplicates)
    const uniqueHeaders = [...new Set(headers.filter(h => h.length > 0))];
    
    if (uniqueHeaders.length > 0 && rows.length > 0) {
      tables.push({
        title,
        headers: uniqueHeaders,
        rows,
        context: `Table ${tableNumber} with ${rows.length} data rows`,
      });
    }
  }
  
  return tables;
}

/**
 * Extract graph information from OCR text
 */
function extractGraphs(text: string): StructuredGraph[] {
  const graphs: StructuredGraph[] = [];
  
  // Look for graph/figure patterns
  const graphRegex = /(?:الشكل|شكل|Figure)\s*(\d+-?\d*)[:\s]*([^]*?)(?=\n\n|$|(?:الشكل|شكل|Figure))/gi;
  let match;
  
  while ((match = graphRegex.exec(text)) !== null) {
    const figureNumber = match[1];
    const figureContent = match[2].trim();
    
    // Extract numerical data points if present
    const dataPoints: Array<{ x: number; y: number; label?: string }> = [];
    const numberRegex = /(\d+(?:\.\d+)?)/g;
    const numbers = figureContent.match(numberRegex);
    
    if (numbers && numbers.length >= 4) {
      // Try to pair numbers as coordinates
      for (let i = 0; i < numbers.length - 1; i += 2) {
        const x = parseFloat(numbers[i]);
        const y = parseFloat(numbers[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          dataPoints.push({ x, y });
        }
      }
    }
    
    graphs.push({
      title: `الشكل ${figureNumber}`,
      description: figureContent,
      data_points: dataPoints,
      axis_labels: { x: 'X', y: 'Y' }, // Default labels
    });
  }
  
  return graphs;
}

/**
 * Extract mathematical formulas from text
 */
function extractFormulas(text: string): string[] {
  const formulas: string[] = [];
  
  // Extract expressions in $...$ or $$...$$
  const mathRegex = /\$\$?([^$]+)\$\$?/g;
  let match;
  
  while ((match = mathRegex.exec(text)) !== null) {
    const formula = match[1].trim();
    if (formula.length > 2) { // Filter out very short expressions
      formulas.push(formula);
    }
  }
  
  // Extract chemical equations and common patterns
  const equationPatterns = [
    /([A-Z][a-z]?\d*(?:\s*[+\-→←]\s*[A-Z][a-z]?\d*)*)/g,
    /(P\s*[Vv]\s*=\s*nRT)/gi,
    /(ΔH\s*=?\s*[^.\n]+)/gi,
    /([A-Za-z]\s*=\s*[^.\n]+)/g,
  ];
  
  equationPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const equation = match[1].trim();
      if (equation.length > 3 && !formulas.includes(equation)) {
        formulas.push(equation);
      }
    }
  });
  
  return formulas;
}

/**
 * Extract key numerical values and constants
 */
function extractKeyValues(text: string): string[] {
  const keyValues: string[] = [];
  
  // Extract values with units
  const valuePatterns = [
    /(\d+(?:\.\d+)?\s*(?:atm|Pa|bar|mol|L|K|°C|°F|g|kg|m|cm|mm|s|min|h))/gi,
    /(\d+(?:\.\d+)?\s*[×xX]\s*10\^?[-+]?\d+)/gi,
    /(KF?\s*[=:]\s*\d+(?:\.\d+)?)/gi,
    /(Kb?\s*[=:]\s*\d+(?:\.\d+)?)/gi,
  ];
  
  valuePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1].trim();
      if (!keyValues.includes(value)) {
        keyValues.push(value);
      }
    }
  });
  
  return keyValues;
}

/**
 * Extract figure descriptions
 */
function extractFigures(text: string): Array<{ title: string; description: string }> {
  const figures: Array<{ title: string; description: string }> = [];
  
  // Extract figure references
  const figureRegex = /(?:الشكل|شكل|Figure)\s*(\d+-?\d*)[:\s]*([^]*?)(?=\n\n|$|(?:الشكل|شكل|Figure|الجدول|جدول|Table))/gi;
  let match;
  
  while ((match = figureRegex.exec(text)) !== null) {
    const figureNumber = match[1];
    const description = match[2].trim();
    
    figures.push({
      title: `الشكل ${figureNumber}`,
      description,
    });
  }
  
  return figures;
}

/**
 * Convert structured data to a format suitable for AI processing
 */
export function formatStructuredDataForAI(data: StructuredData): string {
  let formatted = '';
  
  if (data.tables.length > 0) {
    formatted += '\n**TABLES AVAILABLE FOR CALCULATIONS:**\n';
    data.tables.forEach(table => {
      formatted += `\n${table.title}:\n`;
      formatted += `Headers: ${table.headers.join(' | ')}\n`;
      table.rows.forEach((row, index) => {
        formatted += `Row ${index + 1}: ${row.join(' | ')}\n`;
      });
      if (table.context) {
        formatted += `Context: ${table.context}\n`;
      }
    });
  }
  
  if (data.graphs.length > 0) {
    formatted += '\n**GRAPHS/FIGURES WITH DATA:**\n';
    data.graphs.forEach(graph => {
      formatted += `\n${graph.title}:\n`;
      formatted += `Description: ${graph.description}\n`;
      if (graph.data_points.length > 0) {
        formatted += `Data Points: ${graph.data_points.map(p => `(${p.x}, ${p.y})`).join(', ')}\n`;
      }
    });
  }
  
  if (data.formulas.length > 0) {
    formatted += '\n**FORMULAS IDENTIFIED:**\n';
    data.formulas.forEach(formula => {
      formatted += `- ${formula}\n`;
    });
  }
  
  if (data.key_values.length > 0) {
    formatted += '\n**KEY VALUES:**\n';
    data.key_values.forEach(value => {
      formatted += `- ${value}\n`;
    });
  }
  
  return formatted;
}
