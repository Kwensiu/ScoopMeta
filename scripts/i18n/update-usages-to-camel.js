import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source root directory
const srcRoot = path.join(__dirname, '..', '..', 'src');

// Convert snake_case to camelCase
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Get list of source files
function getSourceFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const files = [];
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.includes(path.extname(fullPath))) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

// Update translation usages in file
function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  let updateCount = 0;

  // Improved regex to handle t('key'), t("key"), t(`key`) with optional parameters
  content = content.replace(/t\(['"`]([^'"]*?)['"`](?:\s*,\s*[^)]*)?\s*\)/g, (match, key) => {
    const newKey = key.split('.').map(toCamelCase).join('.');
    if (newKey !== key) {
      changed = true;
      updateCount++;
      console.log(`Updated t() key "${key}" to "${newKey}" in ${filePath}`);
      return match.replace(key, newKey);
    }
    return match;
  });

  // Update dict.key or dict['key']
  content = content.replace(/dict\.([a-zA-Z_$][a-zA-Z0-9_.$]*)/g, (match, keys) => {
    const newKeys = keys.split('.').map(toCamelCase).join('.');
    if (newKeys !== keys) {
      changed = true;
      updateCount++;
      console.log(`Updated dict.key "${keys}" to "${newKeys}" in ${filePath}`);
      return match.replace(keys, newKeys);
    }
    return match;
  });

  // Update dict['key'] or dict["key"]
  content = content.replace(/dict\[['"`]([^'"]*?)['"`]\]/g, (match, key) => {
    const newKey = toCamelCase(key);
    if (newKey !== key) {
      changed = true;
      updateCount++;
      console.log(`Updated dict['key'] "${key}" to "${newKey}" in ${filePath}`);
      return match.replace(key, newKey);
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${updateCount} translation usage(s) in ${filePath}`);
  }
}

// Main function
function updateUsages() {
  const sourceFiles = getSourceFiles(srcRoot);
  for (const file of sourceFiles) {
    updateFile(file);
  }
  console.log('All translation usages updated to camelCase.');
}

updateUsages();
