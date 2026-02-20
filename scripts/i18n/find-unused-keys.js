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

// Source root directory
const srcRoot = path.join(__dirname, '..', '..', 'src');

// Also scan Rust source directory
const rustSrcRoot = path.join(__dirname, '..', '..', 'src-tauri', 'src');

// Recursively flatten object to dot-separated keys
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

// Delete nested key from object
function deleteNestedKey(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      return false; // Path does not exist
    }
    current = current[keys[i]];
  }
  delete current[keys[keys.length - 1]];
  return true;
}

// Get list of source files
function getSourceFiles(dirs, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const files = [];
  function walk(currentDir, exts) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, exts);
      } else if (exts.includes(path.extname(fullPath))) {
        files.push(fullPath);
      }
    }
  }
  dirs.forEach(dir => walk(dir, extensions));
  return files;
}

// Check if key is used in file
function isKeyUsed(key, filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const isRust = filePath.endsWith('.rs');
  const patterns = [];
  if (isRust) {
    // For Rust files, search for JSON property access like get("key") or ["key"]
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push(`get\\("${escapedKey}"\\)`, `\\["${escapedKey}"\\]`);
  } else {
    // For TypeScript/JavaScript files
    patterns.push(
      `t\\('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`,
      `dict\\.${key.replace(/\./g, '\\.').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      `'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
      `"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
    );
  }
  return patterns.some(pattern => new RegExp(pattern, 'g').test(content));
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main function
async function findUnusedKeys() {
  try {
    const baseData = JSON.parse(fs.readFileSync(baseLocalePath, 'utf-8'));
    const zhData = JSON.parse(fs.readFileSync(zhLocalePath, 'utf-8'));
    const flattened = flatten(baseData);
    const allKeys = Object.keys(flattened);

    const tsFiles = getSourceFiles([srcRoot], ['.ts', '.tsx', '.js', '.jsx']);
    const rsFiles = getSourceFiles([rustSrcRoot], ['.rs']);
    const sourceFiles = tsFiles.concat(rsFiles);
    const usedKeys = new Set();

    for (const file of sourceFiles) {
      for (const key of allKeys) {
        if (isKeyUsed(key, file)) {
          usedKeys.add(key);
        }
      }
    }

    let unusedKeys = allKeys.filter(key => !usedKeys.has(key));

    // Exclude backend-used keys (e.g., tray section used in Rust)
    unusedKeys = unusedKeys.filter(key => !key.startsWith('settings.tray.') && !key.startsWith('settings.bucketAutoUpdate.'));

    console.log('Unused keys:');
    unusedKeys.forEach(key => console.log(`- ${key}`));
    console.log(`\nFound ${unusedKeys.length} unused keys.`);

    if (unusedKeys.length === 0) {
      rl.close();
      return;
    }

    const answer = await new Promise(resolve => {
      rl.question('Do you want to delete these unused keys? (y/n): ', resolve);
    });

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      // Deep copy objects
      const newBaseData = JSON.parse(JSON.stringify(baseData));
      const newZhData = JSON.parse(JSON.stringify(zhData));

      let deletedCount = 0;
      for (const key of unusedKeys) {
        if (deleteNestedKey(newBaseData, key)) {
          deleteNestedKey(newZhData, key); // Assuming zh.json has same structure
          deletedCount++;
        }
      }

      // Write back to files
      fs.writeFileSync(baseLocalePath, JSON.stringify(newBaseData, null, 2), 'utf-8');
      fs.writeFileSync(zhLocalePath, JSON.stringify(newZhData, null, 2), 'utf-8');

      console.log(`${deletedCount} keys deleted.`);
    } else {
      console.log('No keys deleted.');
    }

    rl.close();
  } catch (error) {
    console.error('Detection failed:', error.message);
    rl.close();
  }
}

findUnusedKeys();
