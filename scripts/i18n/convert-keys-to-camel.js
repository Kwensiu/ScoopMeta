import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base locale file path (en.json)
const baseLocalePath = path.join(__dirname, '..', '..', 'src', 'locales', 'en.json');
const zhLocalePath = path.join(__dirname, '..', '..', 'src', 'locales', 'zh.json');

// Convert snake_case to camelCase
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Recursively transform object keys to camelCase
function transformKeys(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = toCamelCase(key);
    newObj[newKey] = transformKeys(value);
  }
  return newObj;
}

// Main function
async function convertToCamelCase() {
  try {
    const baseData = JSON.parse(fs.readFileSync(baseLocalePath, 'utf-8'));
    const zhData = JSON.parse(fs.readFileSync(zhLocalePath, 'utf-8'));

    const newBaseData = transformKeys(baseData);
    const newZhData = transformKeys(zhData);

    console.log('Keys will be converted from snake_case to camelCase.');
    console.log('English locale file:', path.relative(__dirname, baseLocalePath));
    console.log('Chinese locale file:', path.relative(__dirname, zhLocalePath));
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Do you want to proceed with the conversion? (y/N): ', (input) => {
        rl.close();
        resolve(input.toLowerCase());
      });
    });

    if (answer === 'y' || answer === 'yes') {
      // Write back to files
      fs.writeFileSync(baseLocalePath, JSON.stringify(newBaseData, null, 2), 'utf-8');
      fs.writeFileSync(zhLocalePath, JSON.stringify(newZhData, null, 2), 'utf-8');

      console.log('Keys converted to camelCase.');
    } else {
      console.log('Conversion cancelled.');
    }
  } catch (error) {
    console.error('Conversion failed:', error.message);
  }
}

convertToCamelCase();
