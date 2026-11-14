import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(serverDir, '..');
const requireFromClient = createRequire(path.join(rootDir, 'client', 'package.json'));
const { transform } = requireFromClient('esbuild');

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-demo') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full));
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const serverFiles = await filesUnder(path.join(serverDir, 'src'));
serverFiles.push(...await filesUnder(path.join(serverDir, 'db')));
serverFiles.push(...await filesUnder(path.join(serverDir, 'test')));
const clientFiles = await filesUnder(path.join(rootDir, 'client', 'src'));

for (const file of serverFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
for (const file of clientFiles) {
  const source = await readFile(file, 'utf8');
  await transform(source, { loader: file.endsWith('.jsx') ? 'jsx' : 'js', sourcefile: file, logLevel: 'silent' });
}

console.log(`Syntax checks passed for ${serverFiles.length + clientFiles.length} JavaScript and JSX files.`);
