# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-08

### Added

- Navigation column resizing: a vertical divider between the navigation column and the options that
  changes the dialog's first grid column through the `--dsh-sr-nav-width` custom property. The
  injected rule only sets `grid-template-columns` and is scoped to `@media (width > 767px)`, so the
  shell keeps owning the rows and the grid areas, and the fullscreen layout is untouched.
- Pointer dragging of the divider with a 1:1 delta: the dialog's left edge does not move, so
  `DRAG_SCALE` is deliberately not applied. Release handling, the `event.buttons` guard, best-effort
  pointer capture, the 150 ms debounced save and the forced flush reuse the edge-handle code paths.
- Keyboard resizing of the navigation column in 16 px steps. The divider is always a tab stop and is
  exposed as `role="separator"` with `aria-orientation="vertical"` and a localized `aria-label`.
- Navigation width bounds: 140–480 px, additionally capped so the options column keeps at least
  320 px. The width is re-clamped and re-applied whenever the dialog changes size (edge drag,
  keyboard resize, window resize).
- `aria-valuemin` / `aria-valuemax` / `aria-valuenow` on the divider, tracking the current
  navigation width and its bounds.
- `navWidth` in the persisted record, which is now `{width, height, navWidth}`. Records written by
  0.1.0 resolve to the 188 px default, so an upgrade keeps the current column width.
- `resizeNavigation` label in the built-in dictionaries and in `locale/en.json`, `locale/ru.json`,
  `locale/zh.json`.
- Splitter constants, selectors, injected rule, ARIA attributes and storage-schema checks in
  `scripts/smoke.mjs` (104 checks).
- README sections for the divider (features, usage, internals, files, verified behaviour) and the
  version bump to 0.2.0.
- Live verification in a DSH 0.2.2-rc.1 web host at a 1408 × 797 viewport over the Chrome DevTools
  Protocol: divider drags in both directions, both clamps (140 px / 480 px), the 320 px options
  floor, 16 px keyboard steps, reopen, and the mobile handoff, all with a clean console. The
  measured numbers are in the README table.

### Fixed

- Opening the Settings dialog could stall the renderer: the overlay-height probe was appended to the
  panel, so every measurement mutated the observed dialog and the observer scheduled the next scan
  from inside a scan. The probe now mounts in `<body>` behind its own
  `data-dsh-settings-resizable-probe` marker, `isOwnNode()` keeps the plugin's own additions and
  removals out of the mutation filter, and the overlay height and the dialog limits are cached for
  one scan pass (`resetMeasurements()`), so a pass measures the overlay once instead of once per
  consumer.
- The navigation column now really changes width. The injected rule and the shell's own column rule
  have equal specificity (0,1,0), and the shell's stylesheet is appended to `head` after ours, so
  document order kept `grid-template-columns` at `188px 612px` while `--dsh-sr-nav-width` followed
  the drag. `applyNavWidth()` writes the template inline on the dialog instead, which wins without
  an importance override, and calls `positionSplitter()` after that write so the divider sits on the
  real column boundary. The inline template is removed in `removeSplitter()`, `detach()`,
  `dispose()` and in both mobile handoff branches (`scan()` and `onResize()`), so the fullscreen
  layout keeps its own single column. The injected rule is kept as a fallback in document order
  where no later stylesheet shadows it, and `--dsh-sr-nav-width` stays as a diagnostic hook. The
  stored record is unaffected: `navWidth` is clamped to 140–480 px and to the dialog width minus
  320 px before it is written.
- `scripts/smoke.mjs` gained four regression guards for the inline column: the assignment and its
  ordering before `positionSplitter()`, the removal in `removeSplitter()`/`detach()`, the removal in
  the mobile branch of `scan()`, and the absence of an importance override in the injected CSS
  (108 checks).

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
