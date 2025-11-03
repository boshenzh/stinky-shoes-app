import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, 'utf8');
}

async function main() {
  const targetPath = path.resolve(__dirname, '../public/china_gyms.json');
  const backupPath = path.resolve(__dirname, `../public/china_gyms.backup.json`);

  console.log('Reading', targetPath);
  const data = await readJson(targetPath);
  if (!Array.isArray(data)) {
    throw new Error('Expected an array in public/china_gyms.json');
  }

  const seen = new Set();
  const deduped = [];
  let missingIdCount = 0;
  for (const item of data) {
    const id = item && item.id;
    if (!id) {
      missingIdCount += 1;
      deduped.push(item);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(item);
  }

  console.log(`Original: ${data.length}`);
  console.log(`Deduped:  ${deduped.length}`);
  if (missingIdCount > 0) {
    console.log(`Entries without id kept as-is: ${missingIdCount}`);
  }

  console.log('Backing up original to', backupPath);
  await writeJson(backupPath, data);

  console.log('Writing deduped data back to', targetPath);
  await writeJson(targetPath, deduped);
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


