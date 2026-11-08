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

// Navigation splitter: constants, selectors, ARIA and the injected grid rule.
const navigatorMarkers = [
  ['navigation width variable', client.includes('--dsh-sr-nav-width')],
  ['splitter class', /'dsh-sr-handle dsh-sr-split'/.test(client)],
  ['splitter attribute', client.includes("'data-dsh-settings-resizable-split'")],
  ['splitter role separator', /setAttribute\('role',\s*'separator'\)/.test(client)],
  ['splitter vertical orientation', /setAttribute\('aria-orientation',\s*'vertical'\)/.test(client)],
  ['splitter column resize cursor', /cursor:\s*col-resize/.test(client)],
  ['splitter grid rule', /grid-template-columns:\s*var\(--dsh-sr-nav-width,\s*188px\)\s*minmax\(0,\s*1fr\)/.test(client)],
  ['splitter desktop-only media query', /@media\s*\(width > 767px\)/.test(client)],
  ['navigation default width 188', /NAV_DEFAULT_WIDTH\s*=\s*188/.test(client)],
  ['navigation minimum width 140', /NAV_MIN_WIDTH\s*=\s*140/.test(client)],
  ['navigation maximum width 480', /NAV_MAX_WIDTH\s*=\s*480/.test(client)],
  ['options column minimum 320', /NAV_OPTIONS_MIN_WIDTH\s*=\s*320/.test(client)],
  ['splitter drag applies delta 1:1', /startWidth\s*\+\s*\(moveEvent\.clientX - startX\)/.test(client)],
  ['splitter keyboard arrow step', /ArrowRight'\)\s*step\s*=\s*KEYBOARD_STEP/.test(client)],
  ['splitter removed on dispose', /function removeSplitter\(/.test(client)],
];
for (const [name, passed] of navigatorMarkers) check('client.js: ' + name, passed);

// Storage schema: one key, three fields, and a default for records written
// before the navigation width existed.
check('client.js: storage schema keeps width, height and navWidth', /width:\s*Math\.round\(width\)[\s\S]{0,120}navWidth:\s*Math\.round\(/.test(client));
check('client.js: legacy records default the navigation width', /Number\.isFinite\(savedNav\)[\s\S]{0,120}NAV_DEFAULT_WIDTH/.test(client));

// Inline navigation column. The injected rule lost to the shell's own
// `.panel { grid-template: ... }`: both selectors weigh (0,1,0), but the shell
// chunk is appended to <head> after ours, so the column stayed at 188px even
// though --dsh-sr-nav-width changed. The width is now written inline on the
// dialog (inline wins without an importance override), and every handoff has to
// drop that inline template so the fullscreen layout keeps its single column.
const inlineColumnMarkers = [
  [
    'navigation width applied inline on the panel before positioning',
    /function applyNavWidth\([\s\S]{0,900}panel\.style\.gridTemplateColumns\s*=\s*navWidth \+ 'px minmax\(0, 1fr\)'[\s\S]{0,200}positionSplitter\(\)/.test(client),
  ],
  [
    'inline grid columns cleared in removeSplitter and detach',
    /function removeSplitter\(\)[\s\S]{0,900}removeProperty\('grid-template-columns'\)/.test(client)
      && /function detach\(\)[\s\S]{0,900}removeProperty\('grid-template-columns'\)/.test(client),
  ],
  [
    'mobile scan branch clears the inline grid columns',
    /function scan\(\)[\s\S]{0,1200}if \(isMobile\(\)\) \{[\s\S]{0,700}removeProperty\('grid-template-columns'\)/.test(client),
  ],
  ['injected css carries no importance override', !/!\s*important/.test(client)],
];
for (const [name, passed] of inlineColumnMarkers) check('client.js: ' + name, passed);

// Regression guards for the 0.2.0 hang: overlayHeight() appended its probe to
// the dialog, that mutation matched shouldScan(), and the next scan measured
// again — an endless microtask loop that pegged the renderer at 100% CPU.
// The probe must live in <body>, the filter must ignore injected nodes, and one
// pass must measure once.
const loopMarkers = [
  [
    'overlay probe is mounted in <body>',
    /function overlayHeight\(\)[\s\S]{0,900}doc\.body\.appendChild\(probe\)/.test(client),
  ],
  ['overlay probe never touches the dialog', !/panel\.appendChild\(probe\)/.test(client)],
  [
    'scan filter ignores injected nodes',
    /const OWN_ATTRS = \[HANDLE_ATTR, SPLIT_ATTR, PROBE_ATTR\]/.test(client)
      && /function isOwnNode\(node\)[\s\S]{0,500}hasAttribute\(attr\)/.test(client)
      && /function shouldScan\(records\)[\s\S]{0,900}isOwnNode\(node\)/.test(client),
  ],
  [
    'measurement is re-entrancy guarded per pass',
    /let measuring = false/.test(client)
      && /function resetMeasurements\(\)/.test(client)
      && /function scan\(\)[\s\S]{0,400}resetMeasurements\(\)/.test(client)
      && /function onResize\(\)[\s\S]{0,400}resetMeasurements\(\)/.test(client),
  ],
];
for (const [name, passed] of loopMarkers) check('client.js: ' + name, passed);

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
  for (const key of ['resizeHandle', 'resizeHandleHorizontal', 'resizeHandleVertical', 'resizeNavigation']) {
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
