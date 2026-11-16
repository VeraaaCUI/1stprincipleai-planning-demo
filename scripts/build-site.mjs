import {createHash} from 'node:crypto';
import {copyFile, lstat, mkdir, readFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');
const manifestPath = path.join(root, 'deployment-manifest.json');

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.startsWith('/') || path.posix.isAbsolute(value)) return false;
  const parts = value.split('/');
  return parts.every(part => part && part !== '.' && part !== '..') && parts[0] !== 'dist';
}

function localReference(from, reference) {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(reference)) return null;
  const url = new URL(reference, `https://bundle.invalid/${from}`);
  if (url.origin !== 'https://bundle.invalid') return null;
  return decodeURIComponent(url.pathname.slice(1));
}

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unexpected non-file in output: ${relative}`);
  }
  return result.sort();
}

const repository = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!repository.files || typeof repository.files !== 'object' || Array.isArray(repository.files))
  throw new Error('The deployment manifest has no valid files map.');
const assetPaths = Object.keys(repository.files).sort();
if (repository.public_asset_count !== assetPaths.length) throw new Error('The deployment manifest count is inconsistent.');
for (const asset of assetPaths) if (!safeRelativePath(asset)) throw new Error(`Unsafe manifest path: ${asset}`);

const listed = new Set(assetPaths);
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const stylesheets = [];
for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  const target = localReference('index.html', match[1]);
  if (target && !listed.has(target)) throw new Error(`HTML reference is not in the manifest: ${match[1]}`);
  if (target?.endsWith('.css')) stylesheets.push(target);
}
for (const stylesheet of stylesheets) {
  const css = await readFile(path.join(root, stylesheet), 'utf8');
  for (const match of css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
    const target = localReference(stylesheet, match[2].trim());
    if (target && !listed.has(target)) throw new Error(`CSS reference is not in the manifest: ${stylesheet} -> ${match[2]}`);
  }
}

if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unsafe build output path.');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const asset of assetPaths) {
  const source = path.join(root, ...asset.split('/'));
  const info = await lstat(source);
  if (!info.isFile()) throw new Error(`Manifest resource is not a regular file: ${asset}`);
  const bytes = await readFile(source);
  const expected = repository.files[asset];
  if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)
    throw new Error(`Manifest integrity check failed: ${asset}`);
  const target = path.join(output, ...asset.split('/'));
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(source, target);
}

const outputPaths = await listFiles(output);
if (JSON.stringify(outputPaths) !== JSON.stringify(assetPaths)) throw new Error('Build output does not match the manifest.');
for (const asset of outputPaths) {
  const bytes = await readFile(path.join(output, ...asset.split('/')));
  const expected = repository.files[asset];
  if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)
    throw new Error(`Output integrity check failed: ${asset}`);
}
console.log(`Built and verified ${outputPaths.length} public resources in dist/.`);
