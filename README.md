# dsh-settings-resizable

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-informational.svg)](CHANGELOG.md)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.1%2B-green.svg)](https://github.com/deepseek-ai)
[![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](package.json)

**Resizable Settings dialog for DeepSeek Harness.** Drag any edge or corner of the Settings window,
hit the arrow keys on a focused handle, and the dialog keeps the size you chose the next time you
open it.

A local DeepSeek Harness (DSH) client plugin that makes the Settings dialog resizable. It adds
eight pointer handles to the edges and corners of the dialog, lets the user drag them or press the
arrow keys to change the size, remembers the chosen size in `localStorage`, and clamps every size to
the viewport so the dialog can never grow past the window. The plugin is a pure web-UI decoration:
it never replaces the application root, never appends a second application, and never relies on
build-hashed class names.

**Version:** 0.1.0 · **License:** MIT · **Host half:** intentionally empty (all behaviour is in `client.js`)

## Screenshots

![Settings dialog at its default size](docs/settings-default.png)

Default size on a 1408 × 797 viewport: 800 px wide, 749 px tall.

![Settings dialog after resizing](docs/settings-resized.png)

After dragging the right edge and the bottom edge, with the size persisted across a reload.

## Features

- Eight resize handles: north, south, east, west, and the four corners.
- Pointer dragging with window-level tracking, so a drag keeps working outside the dialog; a lost
  `pointerup` (release outside the window, Alt-Tab) is detected on the next pointer move and ends
  the drag instead of leaving it alive.
- Keyboard resizing with the arrow keys in 16 px steps on the focused handle.
- Size persistence under a single versioned key, `dsh-settings-resizable:v1`.
- Minimum size of 480 × 400 px, with viewport-derived maximums applied on every resize.
- Automatic handoff in the shell's fullscreen layout (narrow viewports, and the titlebar/Electron
  layout that never docks): the dialog stays fullscreen and the plugin removes its inline styles and
  handles.
- Accessible handles: each handle is a `role="separator"` with a localized `aria-label`, an
  orientation attribute, and a visible focus ring. Only the east, south, and south-east handles are
  tab stops (`tabindex="0"`); the other five use `tabindex="-1"` so the tab order does not stop eight
  times in a row. The edge handles also expose an `aria-valuemin` / `aria-valuemax` /
  `aria-valuenow` triple that follows the current size and limits; corners carry a position in
  their label instead.
- Localized labels for Chinese, English, and Russian through the DSH locale service, with a built-in
  fallback. Both baseline locales (`zh` and `en`) are registered, which the service requires.
- Zero polling: a `MutationObserver` watches the document and re-attaches the decoration when the
  dialog is reopened.
- Full cleanup on close and on unload: listeners, timers, handles, and the injected stylesheet are
  released, and a pending debounced save is flushed before teardown.

## How it works

### Anchor attribute

The plugin locates the dialog through the stable attribute selector
`[data-shortcut-modal="settings"]`. Build-hashed class names are never used as anchors, so a shell
rebuild does not break the plugin. If a modal dialog is present but the anchor is missing, the
plugin logs one warning and stays inactive rather than guessing at a different element.

### Pointer handles

On attach, the plugin appends eight `div` elements with the `data-dsh-settings-resizable` attribute
and classes `dsh-sr-handle dsh-sr-<direction>`. A `pointerdown` on a handle records the pointer id
and the dialog's current size, then installs `pointermove` / `pointerup` / `pointercancel`
listeners on the window. The horizontal delta is applied only for handles containing `e` or `w`, the
vertical delta only for handles containing `n` or `s`; corners apply both. Sizing is written as
inline `width` and `height` on the dialog only: layout, centering, and the dialog's grid columns
remain owned by the shell stylesheet, which is why the left navigation column stays 188 px and the
content area stays `width - 188`.

The dialog is centered by the overlay's flexbox, so a width change of N moves each edge by N / 2.
Applying the raw pointer delta would therefore make the grabbed edge travel at half the cursor
speed. The plugin doubles the delta (×2 for `e`/`w` and for `n`/`s`, both axes on corners), so the
edge under the cursor follows the pointer one-to-one.

Limits (maximum width and height) are measured once on `pointerdown` and once per window `resize`,
then passed into `setSize()` for the whole drag, instead of forcing a computed-style and layout read
on every `pointermove`. Keyboard resizing measures per keypress, which is cheap enough.

Pointer capture is attempted but treated as best effort. The window-level listeners are the
reliable path, so a synthetic event that cannot allocate a capture target still resizes correctly.
Each `pointermove` first checks `event.buttons`: when the primary button is no longer held, the
drag is finished immediately, because a `pointerup` delivered outside the window (or swallowed by
Alt-Tab) may never arrive.

### Persistence

Sizes are stored as JSON `{width, height}` under the key `dsh-settings-resizable:v1`. During a drag
writes are debounced by 150 ms; the last value is flushed on `pointerup`, `pointercancel`, Escape,
teardown, and — as of the current release — on `dispose()` before anything else is torn down, so a
pending write is never lost. A stored value is validated on read (finite positive numbers, otherwise
ignored) and re-clamped against the current viewport when the dialog is reopened. Keyboard resizes
are written immediately. If storage is denied, resizing still works for the session.

### Limits

Width is clamped to `min(computed CSS max-width, innerWidth - 48)`. The shell does not express its
height cap as a `max-height`, so the plugin reconstructs it from the same frame variable the shell
uses. That variable (`--dsh-frame-overlay-top`) is a `calc()` expression in the Electron titlebar
window and on macOS, so its computed value is not a plain number and is never parsed. Instead a
hidden zero-width probe — carrying `height: calc(2 * max(24px, var(--dsh-frame-overlay-top, 24px)))`
— is appended to the panel, measured with `getBoundingClientRect()`, and removed in a `finally`
block; the result is subtracted from `innerHeight`. A real numeric computed `max-height` still wins
when the shell states one. Minimums are 480 px wide and 400 px tall; the clamp helper returns the
maximum when it is below the minimum, so a very small viewport cannot force the dialog larger than
the space that exists.

### Mobile behaviour

The shell's fullscreen branch is the `@media (width<=767px)` query, but it is additionally guarded
for the Electron titlebar window and macOS, and only that branch drops the panel's `max-width`. The
plugin therefore asks the layout instead of the viewport: when the panel's computed `max-width` is
`none`, the fullscreen layout is active. Only when no dialog is mounted does it fall back to
`innerWidth <= 767`. In the fullscreen layout the plugin removes its handles, restores the dialog's
original inline `width` and `height`, and ignores pointer and keyboard input. Resizing the window
back to the docked layout re-attaches the decoration and re-applies the saved size. A resize handler
re-clamps the dialog when the viewport shrinks, and only refreshes the ARIA bounds while a drag is
in flight.

### Cleanup

Close paths are not patched. Instead, the observer notices that the dialog left the document and the
plugin detaches: it aborts any drag, removes all handles (including orphans left by a reconciler),
restores the inline styles it captured on attach, clears the current size, and leaves the saved
value in storage. On dispose it additionally flushes the pending save, disconnects the observer,
removes the window `resize` listener, and removes the `<style id="dsh-settings-resizable-style">`
element only when this instance created it and no handles remain anywhere in the document — so a
second instance that inherited the stylesheet never loses it. Scans re-create the stylesheet when it
is missing again, for example after React drops the injected element.

Reconciliation is handled explicitly: React may drop unknown children while re-rendering the
dialog, so after every relevant mutation the plugin verifies that all eight handles are still
connected and still labelled, and re-adds them if they are not. Mutation batches are filtered so
streaming chat content does not trigger a rescan on every token.

## Requirements

- DSH 0.2.2-rc.1 web UI or newer. The plugin was verified in a live DSH 0.2.2-rc.1 web host.
- A profile directory that DSH can install local plugin packages into.
- No runtime dependencies: the client module is plain browser JavaScript loaded through
  `window.__ModuleLoader__`.

## Installation

The bundle is a local plugin package. Either route works.

### Get the files

- Download the source ZIP from [Releases](../../releases/latest) and unpack it anywhere.
- Or clone: `git clone <repo-url>` and check the build locally with `node scripts/smoke.mjs`
  (79 checks, no dependencies).

### Route 1: command line

From a terminal:

```
dsh plugin --profile desktop add link:<absolute path to this package>
```

Then restart the DSH desktop application. Installing adds the package to `dsh.profile.bundles` in the
profile `package.json` automatically, so the bundle loads on the next start.

### Route 2: Plugin Manager

Open Settings → Plugins and, if the Plugin Manager offers "install from folder", point it at this
package directory. Restart DSH afterwards.

### Route 3: manual, for the Electron-managed profile

The desktop application owns the `desktop` profile, so the CLI refuses to touch it:

```
error: profile "desktop" is managed exclusively by the Electron application
```

For that profile, install by hand instead — add one dependency and one bundle entry to
`<DSH_HOME>/profiles/desktop/package.json`, then link the package into the profile's
`node_modules`:

```json
{
  "dependencies": { "dsh-settings-resizable": "link:C:/path/to/dsh-settings-resizable" },
  "dsh": { "profile": { "bundles": ["…", "dsh-settings-resizable"] } }
}
```

```bat
mklink /J "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-settings-resizable" "C:\path\to\dsh-settings-resizable"
```

Back up `package.json` first, and check the result with `dsh --profile <copy> --dump-config`: the
composed tree must contain `id: settings-resizable`. Because the package is linked, later edits to
`client.js` are picked up on the next start without reinstalling.

The restart is required: the client module is loaded at startup through `window.__ModuleLoader__`,
so a plugin added to a running app is not picked up until the app starts again.

## Usage

- **Drag an edge or corner.** Move the pointer over an edge of the Settings dialog, then drag. The
  east and west handles are 5 px thick so they do not cover the options column's scrollbar; the
  north and south handles are 8 px thick, the three smaller corner handles are 14 px, and the
  south-east corner is 16 px. The grabbed edge follows the pointer: because the dialog is centered,
  a 300 px pointer move along one axis changes that dimension by 600 px.
- **Keyboard.** Only the east, south, and south-east handles are in the tab order. Tab to one of
  them and press the arrow keys: on the east and south handles a single axis changes; the
  south-east corner accepts both. Each press moves 16 px, and the result is saved immediately. The
  other five handles keep `tabindex="-1"` but still respond if focused programmatically.
- **Reset the size.** The chosen size is remembered, so to get the default back, clear the stored
  key in the browser console and reopen the dialog:

  ```js
  localStorage.removeItem('dsh-settings-resizable:v1');
  ```

  The next open starts from the dialog's own default size and re-clamps it to the viewport.

## Verified behaviour

Measured in a live DSH 0.2.2-rc.1 web host at a 1408 × 797 viewport, driven over the Chrome
DevTools Protocol with real mouse and keyboard events.

| Scenario | Result |
| --- | --- |
| Default size on open | 800 × 749 px (height clamped by the viewport) |
| Drag the right edge +150 px | width 1100 px; the grabbed edge stays under the pointer (0 px gap) |
| Drag the bottom edge −100 px | height 549 px (−200 px, following the 2× drag rule) |
| Drag the right edge far left | width stops at the 480 px minimum |
| ArrowRight on the focused east handle | width +16 px, saved immediately |
| Tab stops added by the plugin | three (`s`, `e`, `se`); the other handles are pointer-only |
| Height cap with a 61 px frame overlay top | 675 px = `innerHeight − 122`, instead of 749 px |
| Left navigation column | 188 px, content area equals `width - 188` |
| Size across reload | persisted and restored |
| Escape, ✕, mask click | dialog closes, handles removed |
| Console | no error from the plugin |
| 390 × 844 viewport | fullscreen dialog, no inline styles, no handles |

## Files

| Path | Purpose |
| --- | --- |
| `package.json` | Manifest: name, version, exports, `dsh.bundle` patch, `dsh.client` platform |
| `client.js` | The browser module: anchor detection, handles, resizing, persistence, cleanup |
| `index.js` | Host half; `export function apply() {}` and nothing else |
| `cordis.patch.yml` | Bundle patch that inserts the plugin into the host |
| `locale/en.json` | English labels and plugin metadata (baseline locale) |
| `locale/zh.json` | Chinese labels and plugin metadata (baseline locale) |
| `locale/ru.json` | Russian labels and plugin metadata |
| `icon.svg` | Plugin icon |
| `scripts/smoke.mjs` | Static self-check for the package artifacts |
| `docs/` | Screenshots referenced above, captured from a live DSH web host |

## Development

Syntax check both halves:

```
node --check client.js
node --check index.js
```

Run the static smoke test. It does not start a browser or Electron; it compiles `client.js` with
`new Function` (a real syntax check that does not execute the module), verifies client artifact
markers, manifest metadata, locale files (including that every English fallback label in `client.js`
is mirrored in `locale/en.json`), icon constraints, BOM absence, and LF line endings, and exits
non-zero on any failure:

```
node scripts/smoke.mjs
```

The same check is available as `npm run smoke`.

## License

MIT. See [LICENSE](LICENSE).

## Кратко по-русски

Плагин для клиентского веб-интерфейса DSH, который делает окно настроек растягиваемым. По краям и
углам диалога появляются восемь маркеров перетаскивания; размер можно менять мышью или стрелками
клавиатуры (шаг 16 px), минимальный размер — 480 × 400 px. Перетаскиваемый край следует за
курсором: поскольку диалог центрирован, смещение указателя на 300 px меняет размер на 600 px.
Выбранный размер сохраняется в `localStorage` под ключом `dsh-settings-resizable:v1` и
восстанавливается при следующем открытии; размер всегда ограничивается размерами окна браузера.
При полноэкранной раскладке (ширина окна меньше 768 px либо Electron-окно без рамки) диалог
разворачивается на весь экран, и плагин убирает свои маркеры и встроенные стили. Подписи маркеров
локализованы: китайский и английский — базовые локали, русский — дополнительный. В порядке Tab
участвуют только три маркера: восточный, южный и юго-восточный.

Установка: `dsh plugin --profile desktop add link:<абсолютный путь к пакету>`, затем перезапуск
приложения DSH; либо через «Настройки → Плагины», если менеджер плагинов умеет устанавливать из
папки. Сброс размера — удалить ключ `dsh-settings-resizable:v1` из `localStorage` и открыть настройки
заново. Плагин не подменяет корень приложения и не зависит от хешированных имён классов: он находит
диалог по стабильному атрибуту `[data-shortcut-modal="settings"]`.
