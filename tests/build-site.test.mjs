import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

test('public build contains only integrity-verified manifest resources', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-site.mjs'], {cwd: root, encoding: 'utf8'});
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const manifest = JSON.parse(await readFile(path.join(root, 'deployment-manifest.json'), 'utf8'));
  const actual = await files(path.join(root, 'dist'));
  assert.deepEqual(actual, Object.keys(manifest.files).sort());
  assert.equal(actual.length, manifest.public_asset_count);
  for (const file of actual) {
    const bytes = await readFile(path.join(root, 'dist', ...file.split('/')));
    assert.equal(bytes.length, manifest.files[file].bytes, file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[file].sha256, file);
  }
  for (const excluded of ['README.md', 'deployment-manifest.json', 'docs/website-stage07-owner-test.md', 'tests/build-site.test.mjs', 'scripts/build-site.mjs'])
    assert.equal(actual.includes(excluded), false, excluded);
});
