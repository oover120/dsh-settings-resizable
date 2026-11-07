#!/usr/bin/env node
/**
 * Static self-check for the dsh-settings-resizable plugin package.
 *
 * It does not start a browser or Electron. It verifies the expected client
 * artifact markers, manifest metadata, locale files and icon constraints, so a
 * broken package fails before it ever reaches DSH.
 *
 * Usage: node scripts/smoke.mjs
 * Exit code: 0 when every check passes, 1 otherwise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

/**
 * Record one assertion.
 * @param {string} name - short check name.
 * @param {boolean} passed - assertion result.
 * @param {string} [detail] - failure detail.
 */
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
}

/**
 * Read a file relative to the package root.
 * @param {string} relative - package-relative path.
 * @returns {string} file contents as UTF-8.
 */
function read(relative) {
  return readFileSync(join(root, relative), 'utf8');
}

/**
 * Convert a package `files` pattern into a regular expression.
 * @param {string} pattern - pattern such as `locale/*.json`.
 * @returns {RegExp} matcher for package-relative paths.
 */
function patternToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp('^' + escaped + '$');
}

const client = read('client.js');
const host = read('index.js');
const patch = read('cordis.patch.yml');

// Compile the client without running it: the module only talks to
// window.__ModuleLoader__ when it is executed, so `new Function` is a real
// syntax check that never touches the browser globals.
try {
  // eslint-disable-next-line no-new-func
  new Function(client);
  check('client.js: syntax check', true);
} catch (error) {
  check('client.js: syntax check', false, String(error));
}

const clientMarkers = [
  ['module loader entry', client.includes('__ModuleLoader__.load')],
  ['plugin id', /id:\s*'dsh-settings-resizable'/.test(client)],
  ['apply entry', /apply\s*\(/.test(client)],
  ['MutationObserver', client.includes('MutationObserver')],
  ['pointerdown handling', client.includes('pointerdown')],
  ['localStorage persistence', client.includes('localStorage')],
  ['settings anchor attribute', client.includes('data-shortcut-modal="settings"')],
  ['mobile breakpoint', /innerWidth\s*<=\s*767/.test(client)],
  ['no setInterval', !/setInterval/.test(client)],
  ['no console.log', !/console\.log\s*\(/.test(client)],
];
for (const [name, passed] of clientMarkers) check('client.js: ' + name, passed);

check('client.js: host half does not import DOM globals', !/document\.body\.appendChild/.test(client));
check('index.js: exports apply', /export\s+function\s+apply\s*\(/.test(host));
check('cordis.patch.yml: inserts the plugin', /id:\s*settings-resizable/.test(patch) && /name:\s*dsh-settings-resizable/.test(patch));

let manifest = null;
try {
  manifest = JSON.parse(read('package.json'));
  check('package.json: parses', true);
} catch (error) {
  check('package.json: parses', false, String(error));
}

if (manifest) {
  check('package.json: name', manifest.name === 'dsh-settings-resizable');
  check('package.json: version', typeof manifest.version === 'string' && /^\d+\.\d+\.\d+$/.test(manifest.version));
  check('package.json: private', manifest.private === true);
  check('package.json: type module', manifest.type === 'module');
  check('package.json: bundle patch declared', manifest.dsh?.bundle?.patch === './cordis.patch.yml');
  check('package.json: client platform web', manifest.dsh?.client?.platform === 'web');
  check('package.json: client immediately', manifest.dsh?.client?.immediately === true);

  const exportTargets = Object.values(manifest.exports || {}).map((value) => String(value).replace(/^\.\//, ''));
  for (const target of exportTargets) {
    if (target.includes('*')) {
      const regExp = patternToRegExp(target);
      const dir = target.split('/')[0];
      let matches = [];
      try {
        matches = readdirSync(join(root, dir)).map((name) => dir + '/' + name);
      } catch {
        matches = [];
      }
      check('exports: ' + target + ' resolves', matches.some((path) => regExp.test(path)));
    } else {
      let exists = false;
      try {
        exists = statSync(join(root, target)).isFile();
      } catch {
        exists = false;
      }
      check('exports: ' + target + ' exists', exists);
    }
  }

  const runtimeFiles = [
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'icon.svg',
    'locale/en.json',
    'locale/ru.json',
    'locale/zh.json',
  ];
  const patterns = (manifest.files || []).map(patternToRegExp);
  for (const file of runtimeFiles) {
    check('files: covers ' + file, patterns.some((pattern) => pattern.test(file)));
  }
}

for (const locale of ['en', 'ru', 'zh']) {
  const relative = 'locale/' + locale + '.json';
  let data = null;
  try {
    data = JSON.parse(read(relative));
    check(relative + ': parses', true);
  } catch (error) {
    check(relative + ': parses', false, String(error));
    continue;
  }
  check(relative + ': meta.title', typeof data.meta?.title === 'string' && data.meta.title.length > 0);
  check(relative + ': meta.description', typeof data.meta?.description === 'string' && data.meta.description.length > 0);
  for (const key of ['resizeHandle', 'resizeHandleHorizontal', 'resizeHandleVertical']) {
    check(relative + ': ' + key, typeof data[key] === 'string' && data[key].length > 0);
  }
  if (locale === 'ru') {
    check(relative + ': uses Cyrillic', /[\u0400-\u04FF]/.test(data.meta.title + data.meta.description + data.resizeHandle));
  }
  if (locale === 'zh') {
    check(relative + ': uses CJK', /[\u4E00-\u9FFF]/.test(data.meta.title + data.meta.description + data.resizeHandle));
  }
}

// The client carries its own fallback dictionaries for all baseline locales;
// their English strings must stay in sync with locale/en.json.
const englishBlock = /en:\s*\{([\s\S]*?)\n\s*\}/.exec(client);
const englishLabels = englishBlock ? (englishBlock[1].match(/'([^']+)'/g) || []).map((raw) => raw.slice(1, -1)) : [];
check('client.js: english dictionary found', englishLabels.length > 0);
let englishText = '';
try {
  englishText = read('locale/en.json');
} catch {
  englishText = '';
}
check('locale/en.json: exists', englishText.length > 0);
for (const label of englishLabels) {
  check('locale/en.json: mirrors "' + label + '"', englishText.includes(label));
}

let zhExists = false;
try {
  zhExists = statSync(join(root, 'locale/zh.json')).isFile();
} catch {
  zhExists = false;
}
check('locale/zh.json: exists', zhExists);

let icon = '';
try {
  icon = read('icon.svg');
  const size = statSync(join(root, 'icon.svg')).size;
  check('icon.svg: parses as text', icon.startsWith('<svg') || icon.startsWith('<?xml'));
  check('icon.svg: contains svg root', icon.includes('<svg'));
  check('icon.svg: at most 256 KiB', size <= 256 * 1024, 'size=' + size);
  check('icon.svg: no external links', !/(href|xlink:href)\s*=\s*["']https?:/i.test(icon) && !/<image\b/i.test(icon));
} catch (error) {
  check('icon.svg: readable', false, String(error));
}

for (const file of ['client.js', 'index.js', 'package.json', 'cordis.patch.yml', 'locale/en.json', 'locale/ru.json', 'locale/zh.json', 'icon.svg']) {
  let text = '';
  try {
    text = read(file);
  } catch {
    continue;
  }
  check(file + ': no BOM', !text.startsWith('\uFEFF'));
  check(file + ': LF line endings', !text.includes('\r'));
}

let failed = 0;
for (const result of results) {
  if (result.passed) continue;
  failed += 1;
  console.error('[FAIL] ' + result.name + (result.detail ? ' - ' + result.detail : ''));
}
const passedCount = results.length - failed;
console.log(`smoke: ${passedCount}/${results.length} checks passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
