import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base locale file path (en.json)
const baseLocalePath = path.join(__dirname, '..', '..', 'src', 'locales', 'en.json');

// Recursively generate interface string
function generateInterface(obj, indent = '') {
  let result = '';
  for (const [key, value] of Object.entries(obj)) {
    // Check if key needs quotes
    const needsQuotes = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
    const quotedKey = needsQuotes ? `"${key}"` : key;
    if (needsQuotes) {
      console.warn(`Warning: Key "${key}" may be invalid TypeScript identifier, quotes added.`);
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object
      result += `${indent}${quotedKey}: {\n${generateInterface(value, indent + '  ')}${indent}};\n`;
    } else {
      // String or function type (assuming string or template function)
      result += `${indent}${quotedKey}: string;\n`;
    }
  }
  return result;
}

// Main function
function generateTypes() {
  try {
    const baseData = JSON.parse(fs.readFileSync(baseLocalePath, 'utf-8'));
    const interfaceStr = `export interface Dict {\n${generateInterface(baseData, '  ')}\n  [key: string]: string | ((...args: any[]) => string) | any;\n}`;

    const outputPath = path.join(__dirname, '..', '..', 'src', 'types', 'dict-types.ts');
    fs.writeFileSync(outputPath, interfaceStr, 'utf-8');
    console.log(`Type file generated: ${outputPath}`);
  } catch (error) {
    console.error('Type generation failed:', error.message);
  }
}

generateTypes();