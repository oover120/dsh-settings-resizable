# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-07

### Added

- Eight pointer resize handles (north, south, east, west, and four corners) on the Settings dialog,
  anchored on the stable `[data-shortcut-modal="settings"]` attribute.
- Pointer dragging through window-level listeners, with best-effort pointer capture.
- Keyboard resizing on focused handles: arrow keys in 16 px steps, applied per axis.
- Size persistence in `localStorage` under `dsh-settings-resizable:v1` as JSON `{width, height}`,
  debounced at 150 ms during drags and flushed when the drag ends.
- Minimum size of 480 × 400 px and viewport-derived maximums: width clamped to
  `min(CSS max-width, innerWidth - 48)`, height derived from `--dsh-frame-overlay-top`.
- Fullscreen handoff below 768 px viewport width: inline styles restored and handles removed.
- `MutationObserver`-based attach and re-attach, with handle integrity checks after reconciliation
  and filtered mutation batches.
- Localized handle labels for English and Russian through the DSH locale service, with built-in
  fallbacks, and accessible handles (`role="separator"`, `aria-label`, `aria-orientation`, keyboard
  focus ring).
- Complete cleanup on close and dispose: listeners, timers, handles, and the injected
  `<style id="dsh-settings-resizable-style">` element.
- Static package self-check in `scripts/smoke.mjs`.

### Changed

- Dragging now follows the pointer one-to-one. The dialog is centered, so one edge moves by only
  half of any size change; the pointer delta is doubled (both axes on corners) and the grabbed edge
  travels with the cursor instead of lagging behind it.
- Limits are measured once per drag (on `pointerdown`) and once per window `resize`, then passed
  into the size setter instead of being re-measured on every `pointermove`.
- The east and west handles are 5 px thick instead of 8 px, so they no longer cover the options
  column's scrollbar. Corner and north/south handles keep their previous sizes.
- Only the east, south, and south-east handles are tab stops; the other five use `tabindex="-1"`.
  Edge handles expose `aria-valuemin` / `aria-valuemax` / `aria-valuenow` that track the current
  size and limits.
- `scripts/smoke.mjs` now compiles `client.js` with `new Function`, accepts any semver-shaped
  version instead of pinning `0.1.0`, and checks the `zh` locale plus the English fallback strings.
- `package.json` drops the empty `repository` and `homepage` keys and gains `npm run smoke`.

### Fixed

- The height cap is now measured in layout with a hidden probe instead of parsing
  `--dsh-frame-overlay-top`, whose computed value is a `calc()` expression in the Electron titlebar
  window and on macOS. The titlebar window no longer gets a wrong maximum height.
- A lost `pointerup` (released outside the window, Alt-Tab) can no longer leave a drag alive: each
  `pointermove` checks `event.buttons` and finishes the drag when the primary button is gone.
- The injected stylesheet is re-created by a scan when it disappeared, and `dispose()` removes it
  only when no handles remain, so one instance cannot strip styles owned by another.
- Added the `zh` dictionary (baseline locale) and `locale/zh.json`; without `zh` and `en` the locale
  service rejects the registration and labels fall back.
- `dispose()` flushes a pending debounced save before tearing down, so the last size is not lost.
- ARIA labels resolve the locale service on every scan instead of capturing the translate function
  once, so labels self-correct when the service mounts after the plugin starts.
- The clamp helper returns the maximum when it is below the minimum, so a very short viewport does
  not force the dialog taller than the window.
