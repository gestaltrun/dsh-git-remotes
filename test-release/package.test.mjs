import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePackage, validateArchive, assertPublishContext, REPOSITORY } from '../scripts/gestaltrun-release.mjs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test('rejects upstream identities, install hooks and retired host dependencies', () => {
  validatePackage(pkg);
  assert.throws(() => validatePackage({ ...pkg, name: 'dsh-original' }));
  assert.throws(() => validatePackage({ ...pkg, repository: { url: 'https://github.com/upstream/plugin' } }));
  assert.throws(() => validatePackage({ ...pkg, scripts: { prepare: 'build' } }));
  assert.throws(() => validatePackage({ ...pkg, dependencies: { cordis: '^4' } }));
  assert.throws(() => validatePackage({ ...pkg, dependencies: { library: 'file:../library' } }));
});
test('publishing requires explicit fork dispatch or matching release tag', () => {
  const env = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_NAME: 'workflow_dispatch', PUBLISH_PACKAGE: 'true' };
  assertPublishContext(pkg, env);
  assert.throws(() => assertPublishContext(pkg, { ...env, GITHUB_EVENT_NAME: 'push' }));
  assert.throws(() => assertPublishContext(pkg, { ...env, PUBLISH_PACKAGE: 'false' }));
  assert.throws(() => assertPublishContext(pkg, { ...env, GITHUB_REPOSITORY: 'upstream/plugin' }));
  assert.throws(() => assertPublishContext(pkg, { ...env, GITHUB_EVENT_NAME: 'release', RELEASE_TAG: 'v1', GITHUB_REF: 'refs/tags/v1' }));
  assertPublishContext(pkg, { ...env, GITHUB_EVENT_NAME: 'release', RELEASE_TAG: `v${pkg.version}`, GITHUB_REF: `refs/tags/v${pkg.version}` });
});

test('an archive missing its browser entry cannot pass the release guard', () => {
  const root = mkdtempSync(join(tmpdir(), 'gestaltrun-archive-negative-'));
  try {
    mkdirSync(join(root, 'package/lib'), { recursive: true });
    writeFileSync(join(root, 'package/package.json'), JSON.stringify(pkg));
    writeFileSync(join(root, 'package/lib/index.js'), 'export function apply() {}');
    execFileSync('tar', ['-czf', join(root, 'broken.tgz'), '-C', root, 'package']);
    assert.throws(() => validateArchive(join(root, 'broken.tgz')), /Missing archive entry: lib\/client.js/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('development branches verify while publication has no push trigger', () => {
  const ci = parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const release = parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));
  assert.ok(ci.on.push.branches.includes('codex/**'));
  assert.equal(release.on.push, undefined);
  assert.equal(release.permissions['id-token'], 'write');
});

for (const filename of ['/Users/example/project/panel.css', 'C:/checkout/panel.css', 'C:\\checkout\\panel.css']) {
  test(`rejects an absolute CSS virtual module identifier: ${filename}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'gestaltrun-css-negative-'));
    try {
      mkdirSync(join(root, 'package/lib'), { recursive: true });
      writeFileSync(join(root, 'package/package.json'), JSON.stringify(pkg));
      writeFileSync(join(root, 'package/lib/index.js'), 'export function apply() {}');
      writeFileSync(join(root, 'package/LICENSE'), 'fixture');
      writeFileSync(join(root, 'package/cordis.patch.yml'), `- insert:\n    - id: git-remotes\n      name: "${pkg.name}"\n`);
      writeFileSync(join(root, 'package/lib/client.js'), `window.__ModuleLoader__.load({ id: "${pkg.name}" });\n//#region \\0dsh-css:${filename}.mjs\n`);
      execFileSync('tar', ['-czf', join(root, 'absolute.tgz'), '-C', root, 'package']);
      assert.throws(() => validateArchive(join(root, 'absolute.tgz')), /Absolute CSS module identifier/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
