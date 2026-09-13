#!/usr/bin/env node
/** Build one isolated Gestaltrun package; publishing requires an explicit fork release. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const NAME = '@gestaltrun/dsh-git-remotes';
export const REPOSITORY = 'gestaltrun/dsh-git-remotes';
const SIDEBAR = '@gestaltrun/dsh-better-sidebar';
const SIDEBAR_VERSION = '0.19.1-gestaltrun.0';

/** Refuse an upstream identity, a local dependency, or install-time build. */
export function validatePackage(pkg) {
  if (pkg.name !== NAME || pkg.repository?.url !== `https://github.com/${REPOSITORY}`) throw new Error('Unexpected package or repository');
  if (!/^\d+\.\d+\.\d+-gestaltrun\.\d+$/.test(pkg.version)) throw new Error('Expected an exact Gestaltrun candidate version');
  if (pkg.publishConfig?.access !== 'public' || pkg.publishConfig.registry !== 'https://registry.npmjs.org/') throw new Error('Unexpected npm destination');
  if (pkg.peerDependencies?.[SIDEBAR] !== SIDEBAR_VERSION || pkg.peerDependencies?.['@deepseek-ai/cordis'] !== '^4.0.2') throw new Error('Unexpected host peers');
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml' || JSON.stringify(pkg.dsh?.client?.inject) !== JSON.stringify([SIDEBAR])) throw new Error('Incomplete bundle or client registration');
  for (const phase of ['preinstall', 'install', 'postinstall', 'prepare']) if (phase in (pkg.scripts ?? {})) throw new Error(`Install lifecycle is forbidden: ${phase}`);
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(pkg[field] ?? {})) {
      if (name === 'cordis' || name === 'dsh-better-sidebar' || name.includes('client-runtime') || /^(file:|link:|workspace:)/.test(version)) throw new Error(`Unshippable dependency: ${name}`);
    }
  }
}

/** Neither a branch push nor another fork can authorize publication. */
export function assertPublishContext(pkg, env) {
  validatePackage(pkg);
  if (env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error('Publishing requires the Gestaltrun fork');
  if (env.GITHUB_EVENT_NAME === 'release') {
    if (env.GITHUB_REF !== `refs/tags/v${pkg.version}` || env.RELEASE_TAG !== `v${pkg.version}`) throw new Error('Release tag must equal package version');
  } else if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.PUBLISH_PACKAGE !== 'true') throw new Error('Publishing requires explicit release or dispatch consent');
}

/** Hash the immutable bytes consumed by the product. */
export function integrity(path) { return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`; }
function tar(path, args) { return execFileSync('tar', [...args, path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
function packedManifest(path) { return JSON.parse(execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' })); }

/** Verify all executable entries required by the shipped profile and module loader. */
export function validateArchive(path) {
  const pkg = packedManifest(path);
  validatePackage(pkg);
  const entries = new Set(tar(path, ['-tzf']).trim().split('\n'));
  for (const name of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'LICENSE']) if (!entries.has(`package/${name}`)) throw new Error(`Missing archive entry: ${name}`);
  const client = execFileSync('tar', ['-xOf', path, 'package/lib/client.js'], { encoding: 'utf8' });
  const patch = parse(execFileSync('tar', ['-xOf', path, 'package/cordis.patch.yml'], { encoding: 'utf8' }));
  if (!client.includes(`id: ${JSON.stringify(NAME)}`) || patch[0]?.insert?.[0]?.name !== NAME) throw new Error('Stale client or patch identity');
  if (client.includes('@deepseek-ai/dsh-client-runtime') || /require\(["']cordis["']\)/.test(client)) throw new Error('Retired client runtime or duplicate Cordis');
  for (const entry of entries) {
    if (!/^package\/lib\/client(?:-registry)?\.js$/.test(entry)) continue;
    const code = execFileSync('tar', ['-xOf', path, entry], { encoding: 'utf8' });
    if (/dsh-css:(?:[/\\]|[A-Za-z]:)/.test(code)) throw new Error('Absolute CSS module identifier in archive');
  }
  return pkg;
}
function pnpm(args) {
  const cli = process.env.npm_execpath;
  if (!cli || !/(?:^|[\\/])pnpm(?:\.[cm]?js)?$/.test(cli)) throw new Error('Invoke through the pinned pnpm script');
  execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' });
}

/** The optional supplied Sidebar is already published: require its exact locked bytes before the frozen install. */
export function validateSidebar(path) {
  const pkg = packedManifest(path);
  const lock = parse(readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8'));
  const expected = lock.packages?.[`${SIDEBAR}@${SIDEBAR_VERSION}`]?.resolution?.integrity;
  if (pkg.name !== SIDEBAR || pkg.version !== SIDEBAR_VERSION || expected !== integrity(path)) throw new Error('Sidebar archive differs from the locked published artifact');
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  validatePackage(pkg);
  if (command === 'guard') return assertPublishContext(pkg, process.env);
  if (!['pack', 'publish'].includes(command)) throw new Error('Expected pack, publish, or guard');
  const { values } = parseArgs({ args: args.filter(arg => arg !== '--'), options: { out: { type: 'string' }, 'sidebar-tarball': { type: 'string' } } });
  if (!values.out || !isAbsolute(values.out)) throw new Error('Usage: release:pack -- --out <absolute-directory> [--sidebar-tarball <archive>]');
  if (command === 'publish') assertPublishContext(pkg, process.env);
  if (values['sidebar-tarball']) validateSidebar(resolve(values['sidebar-tarball']));
  const out = resolve(values.out);
  const filename = `${NAME.slice(1).replace('/', '-')}-${pkg.version}.tgz`;
  const archive = join(out, filename);
  if (existsSync(archive)) throw new Error(`Artifact already exists: ${archive}`);
  pnpm(['install', '--frozen-lockfile', '--ignore-scripts']);
  pnpm(['run', 'build']);
  pnpm(['run', 'typecheck']);
  pnpm(['run', 'test']);
  pnpm(['run', 'test:release']);
  mkdirSync(out, { recursive: true });
  pnpm(['--config.ignore-scripts=true', 'pack', '--pack-destination', out]);
  validateArchive(archive);
  const result = { name: NAME, version: pkg.version, filename, integrity: integrity(archive), repository: REPOSITORY };
  writeFileSync(join(out, `${NAME.split('/')[1]}-artifact.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (command === 'publish') execFileSync('npm', ['publish', archive, '--ignore-scripts', '--provenance', '--access', 'public', '--tag', 'candidate', '--registry', 'https://registry.npmjs.org/'], { cwd: ROOT, stdio: 'inherit' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
