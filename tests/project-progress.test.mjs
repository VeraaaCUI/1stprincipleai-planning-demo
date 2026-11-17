import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'project-progress.js'), 'utf8');
const styles = await readFile(path.join(root, 'project-progress.css'), 'utf8');
await import('../project-progress.js');
const progress = globalThis.FirstPrincipleProjectProgress;

test('detailed roadmap is behind a closed optional disclosure', () => {
  assert.match(source, /const roadmapDetails = node\('details', null, 'fpp-roadmap-details'\)/);
  assert.match(source, /roadmapDetails\.append\(node\('summary', 'View roadmap'\)\)/);
  assert.match(source, /roadmapDetails\.append\(roadmapHint, roadmap, detail, next, loops\)/);
  assert.match(source, /shell\.append\(header, scopeNote, milestoneList, roadmapDetails, node\('p'/);
  assert.doesNotMatch(source, /roadmapDetails\.open/);
  assert.match(styles, /\.fpp-roadmap-details>summary\{[^}]*cursor:pointer/);
  assert.match(styles, /\.fpp-roadmap-details>summary\{[^}]*min-height:44px/);
  assert.match(styles, /\.fpp-roadmap-details>summary\{[^}]*overflow-wrap:anywhere/);
  assert.match(styles, /\.fpp-progress summary:focus-visible\{outline:3px solid #[0-9a-f]{6};outline-offset:3px\}/i);
});

test('roadmap disclosure does not change preparation progress calculations', () => {
  const empty = progress.deriveProgress();
  const brief = progress.deriveProgress({
    hasContext: true,
    supportedNSW: true,
    route: 'brief',
    budget: {entered: 1, errors: []}
  });

  assert.equal(empty.localPreparedCount, 0);
  assert.equal(empty.localMilestoneTotal, 4);
  assert.equal(brief.localPreparedCount, 3);
  assert.equal(brief.localMilestoneTotal, 4);
  assert.equal(brief.stages.length, 10);
  assert.equal(brief.currentStageId, 'scope');
});
