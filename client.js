/**
 * Client half of dsh-settings-resizable.
 *
 * The Settings shell renders its dialog through a portal and marks it with the
 * stable `data-shortcut-modal="settings"` attribute. Build-hashed class names
 * are never used as anchors. This module watches the document for that anchor,
 * decorates the dialog with pointer handles and restores the last saved size.
 * The host half (index.js) is intentionally empty.
 */
window.__ModuleLoader__.load({
  id: 'dsh-settings-resizable',
  factory(require) {
    // The loader passes require; this plugin needs no browser modules.
    const PANEL_SELECTOR = '[data-shortcut-modal="settings"]';
    const STORAGE_KEY = 'dsh-settings-resizable:v1';
    const STYLE_ID = 'dsh-settings-resizable-style';
    const HANDLE_ATTR = 'data-dsh-settings-resizable';
    const ACTIVE_ATTR = 'data-dsh-settings-resizable-active';
    const LOCALE_NS = 'dsh-settings-resizable';

    const MIN_WIDTH = 480;
    const MIN_HEIGHT = 400;
    const VIEWPORT_GUTTER = 48;
    const DEFAULT_OVERLAY_TOP = 24;
    const SAVE_DELAY_MS = 150;
    const KEYBOARD_STEP = 16;
    // The dialog is centered by the overlay's flexbox, so changing its width by
    // N moves each edge by N / 2. Doubling the pointer delta makes the grabbed
    // edge follow the cursor instead of lagging behind it.
    const DRAG_SCALE = 2;
    const DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

    /** Corner positions appended to the shared label of the diagonal handles. */
    const CORNER_NAMES = {
      ne: 'top-right',
      nw: 'top-left',
      se: 'bottom-right',
      sw: 'bottom-left',
    };

    /**
     * Labels mirrored in locale/en.json, locale/ru.json and locale/zh.json.
     * Both baseline locales (`zh` and `en`) must be present, otherwise the
     * locale service rejects the registration.
     */
    const DICTIONARIES = {
      en: {
        resizeHandle: 'Resize settings dialog',
        resizeHandleHorizontal: 'Resize settings dialog width',
        resizeHandleVertical: 'Resize settings dialog height',
      },
      ru: {
        resizeHandle: 'Изменить размер окна настроек',
        resizeHandleHorizontal: 'Изменить ширину окна настроек',
        resizeHandleVertical: 'Изменить высоту окна настроек',
      },
      zh: {
        resizeHandle: '调整设置窗口大小',
        resizeHandleHorizontal: '调整设置窗口宽度',
        resizeHandleVertical: '调整设置窗口高度',
      },
    };

    const CSS = `
.dsh-sr-handle {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: transparent;
}
.dsh-sr-handle:focus {
  outline: none;
}
.dsh-sr-handle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-border-l3, currentColor));
  outline-offset: -3px;
  border-radius: 4px;
}
.dsh-sr-handle::after {
  content: "";
  position: absolute;
  border-radius: 2px;
  background: var(--dsw-alias-label-tertiary, currentColor);
  opacity: 0;
  transition: opacity 0.12s ease;
  pointer-events: none;
}
.dsh-sr-handle:hover::after,
.dsh-sr-handle:focus-visible::after,
.dsh-sr-handle[data-dsh-settings-resizable-active]::after {
  opacity: 0.45;
}
.dsh-sr-n {
  top: 0;
  left: 14px;
  right: 14px;
  height: 8px;
  cursor: ns-resize;
}
.dsh-sr-n::after {
  top: 3px;
  left: 50%;
  width: 28px;
  height: 2px;
  transform: translateX(-50%);
}
.dsh-sr-s {
  bottom: 0;
  left: 14px;
  right: 14px;
  height: 8px;
  cursor: ns-resize;
}
.dsh-sr-s::after {
  bottom: 3px;
  left: 50%;
  width: 28px;
  height: 2px;
  transform: translateX(-50%);
}
.dsh-sr-e {
  top: 14px;
  right: 0;
  bottom: 14px;
  width: 5px;
  cursor: ew-resize;
}
.dsh-sr-e::after {
  top: 50%;
  right: 3px;
  width: 2px;
  height: 28px;
  transform: translateY(-50%);
}
.dsh-sr-w {
  top: 14px;
  left: 0;
  bottom: 14px;
  width: 5px;
  cursor: ew-resize;
}
.dsh-sr-w::after {
  top: 50%;
  left: 3px;
  width: 2px;
  height: 28px;
  transform: translateY(-50%);
}
.dsh-sr-ne {
  top: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
  z-index: 5;
}
.dsh-sr-nw {
  top: 0;
  left: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  z-index: 5;
}
.dsh-sr-sw {
  bottom: 0;
  left: 0;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
  z-index: 5;
}
.dsh-sr-se {
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 6;
}
.dsh-sr-se::before {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 9px;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--dsw-alias-label-tertiary, currentColor);
  border-bottom: 1.5px solid var(--dsw-alias-label-tertiary, currentColor);
  border-radius: 0 0 2px 0;
  opacity: 0.28;
  pointer-events: none;
}
.dsh-sr-se::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid var(--dsw-alias-label-tertiary, currentColor);
  border-bottom: 1.5px solid var(--dsw-alias-label-tertiary, currentColor);
  border-radius: 0 0 2px 0;
  background: none;
  opacity: 0.55;
  transition: opacity 0.12s ease;
  pointer-events: none;
}
.dsh-sr-se:hover::after,
.dsh-sr-se:focus-visible::after {
  opacity: 0.9;
}
`;

    /**
     * Keep a value inside an inclusive range. When a viewport is shorter than
     * the configured minimum, the upper bound wins: the dialog must not be
     * forced taller (or wider) than the space that actually exists.
     * @param {number} value - candidate size in CSS pixels.
     * @param {number} min - preferred lower bound.
     * @param {number} max - viewport-derived upper bound.
     * @returns {number} the clamped size.
     */
    function clamp(value, min, max) {
      if (max < min) return max;
      return Math.min(Math.max(value, min), max);
    }

    /**
     * Resolve fallback labels from the document language without depending on
     * the locale service.
     * @returns {{ resizeHandle: string, resizeHandleHorizontal: string, resizeHandleVertical: string }} labels.
     */
    function fallbackLabels() {
      const language = String(
        (typeof document !== 'undefined' && document.documentElement.getAttribute('lang'))
          || (typeof navigator !== 'undefined' && navigator.language)
          || 'en',
      ).toLowerCase();
      return language.startsWith('ru')
        ? DICTIONARIES.ru
        : language.startsWith('zh')
          ? DICTIONARIES.zh
          : DICTIONARIES.en;
    }

    /**
     * Build the controller that owns every DOM node, listener and timer.
     * Constructing it has no side effects; `start()` installs them.
     * @param {Document} doc - the browser document.
     * @param {Window} win - the browser window.
     * @param {any} ctx - plugin context from `apply()`; the locale service is
     *   resolved lazily, so labels follow the service whenever it appears.
     * @returns {{ start: () => (() => void) }} controller facade.
     */
    function createController(doc, win, ctx) {
      let disposed = false;
      let panel = null;
      let originals = null;
      let handles = new Map();
      let observer = null;
      let styleElement = null;
      let ownsStyle = false;
      let saveTimer = 0;
      let pendingSave = null;
      let scanScheduled = false;
      let warned = false;
      let drag = null;
      let current = null;
      let stored = readStored();

      /**
       * Read and validate the persisted size.
       * @returns {{ width: number, height: number } | null} saved size or null.
       */
      function readStored() {
        try {
          const raw = win.localStorage.getItem(STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') return null;
          const width = Number(parsed.width);
          const height = Number(parsed.height);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
          return { width, height };
        } catch {
          return null;
        }
      }

      /**
       * Persist a size under the single storage key.
       * @param {number} width - dialog width in CSS pixels.
       * @param {number} height - dialog height in CSS pixels.
       */
      function writeStored(width, height) {
        const value = { width: Math.round(width), height: Math.round(height) };
        stored = value;
        try {
          win.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        } catch {
          // Storage may be denied; resizing still works for this session.
        }
      }

      /**
       * Resolve the locale service afresh on every call. The service may mount
       * after this controller starts, so neither the service nor its translate
       * function is captured once.
       * @param {string} key - dictionary key.
       * @returns {string | undefined} translated label when the service answers.
       */
      function translateLabel(key) {
        try {
          const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
          if (!locale || typeof locale.bind !== 'function') return undefined;
          const translate = locale.bind(LOCALE_NS);
          const value = typeof translate === 'function' ? translate(key) : undefined;
          if (typeof value === 'string' && value.length > 0 && value !== key) return value;
          return undefined;
        } catch {
          return undefined;
        }
      }

      /**
       * Resolve the accessible name for one handle.
       * @param {string} direction - one of DIRECTIONS.
       * @returns {string} localized label with a built-in fallback.
       */
      function labelFor(direction) {
        const fallback = fallbackLabels();
        const key = direction === 'n' || direction === 's'
          ? 'resizeHandleVertical'
          : direction === 'e' || direction === 'w'
            ? 'resizeHandleHorizontal'
            : 'resizeHandle';
        return translateLabel(key) || fallback[key];
      }

      /**
       * Corners reuse the shared label and add their position, so screen
       * readers can tell the four diagonal handles apart.
       * @param {string} direction - one of DIRECTIONS.
       * @returns {string} accessible name for the handle.
       */
      function handleLabel(direction) {
        const base = labelFor(direction);
        const corner = CORNER_NAMES[direction];
        return corner ? base + ' from the ' + corner + ' corner' : base;
      }

      /** Install the stylesheet once and remember whether this instance owns it. */
      function ensureStyles() {
        const existing = doc.getElementById(STYLE_ID);
        if (existing) {
          if (existing !== styleElement) ownsStyle = false;
          styleElement = existing;
          return;
        }
        styleElement = doc.createElement('style');
        styleElement.id = STYLE_ID;
        styleElement.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(styleElement);
        ownsStyle = true;
      }

      /**
       * Detect the shell's fullscreen layout. The breakpoint alone is not
       * enough: the fullscreen media query is additionally guarded for the
       * Electron titlebar window and macOS, and only that branch drops the
       * panel's max-width. Falling back to the breakpoint keeps the answer
       * usable while the dialog is not mounted.
       * @returns {boolean} true in the full-screen layout.
       */
      function isMobile() {
        if (panel) {
          const styles = win.getComputedStyle(panel);
          return styles.maxWidth === 'none';
        }
        return win.innerWidth <= 767;
      }

      /**
       * Measure the dialog's current used size.
       * @returns {{ width: number, height: number }} size in CSS pixels.
       */
      function currentSize() {
        const styles = win.getComputedStyle(panel);
        const width = parseFloat(styles.width);
        const height = parseFloat(styles.height);
        const rect = panel.getBoundingClientRect();
        return {
          width: Number.isFinite(width) ? width : rect.width,
          height: Number.isFinite(height) ? height : rect.height,
        };
      }

      /**
       * Measure the vertical frame chrome in layout. The overlay offset is a
       * calc() expression in the Electron titlebar window and on macOS, so its
       * computed string is not a plain number and must not be parsed. A zero
       * width probe carries the shell's own height expression; its used height
       * is the total top and bottom inset.
       * @returns {number} total overlay height in CSS pixels.
       */
      function overlayHeight() {
        const probe = doc.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;width:0;height:calc(2 * max(24px, var(--dsh-frame-overlay-top, 24px)));visibility:hidden;pointer-events:none;inset:0 auto auto 0';
        panel.appendChild(probe);
        try {
          const height = probe.getBoundingClientRect().height;
          return Number.isFinite(height) && height > 0 ? height : 2 * DEFAULT_OVERLAY_TOP;
        } finally {
          probe.remove();
        }
      }

      /**
       * Derive the maximum size from the dialog's own computed CSS instead of
       * duplicating the shell formula. The height cap is not expressed as
       * max-height in the shell, so it is measured in layout from the same
       * frame variable that the shell uses.
       * @returns {{ maxWidth: number, maxHeight: number }} available bounds.
       */
      function measureLimits() {
        const styles = win.getComputedStyle(panel);
        const viewportWidth = win.innerWidth;
        const viewportHeight = win.innerHeight;
        const declaredMaxWidth = parseFloat(styles.maxWidth);
        const maxWidth = Math.min(
          Number.isFinite(declaredMaxWidth) && declaredMaxWidth > 0
            ? declaredMaxWidth
            : viewportWidth - VIEWPORT_GUTTER,
          viewportWidth - VIEWPORT_GUTTER,
        );
        let maxHeight = NaN;
        if (styles.maxHeight && styles.maxHeight !== 'none') {
          maxHeight = parseFloat(styles.maxHeight);
        }
        if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
          maxHeight = viewportHeight - overlayHeight();
        }
        return {
          maxWidth: Math.max(0, maxWidth),
          maxHeight: Math.max(0, maxHeight),
        };
      }

      /**
       * Mirror the current size and bounds into the ARIA value triple of the
       * edge handles. Corners are separators without a value.
       * @param {{ maxWidth: number, maxHeight: number }} [limits] - already
       *   measured bounds; measured on demand when omitted.
       */
      function refreshAria(limits) {
        if (!panel || handles.size === 0) return;
        const bounds = limits || measureLimits();
        const size = current || currentSize();
        const maxWidth = String(Math.round(bounds.maxWidth));
        const maxHeight = String(Math.round(bounds.maxHeight));
        const nowWidth = String(Math.round(size.width));
        const nowHeight = String(Math.round(size.height));
        for (const [direction, handle] of handles) {
          if (direction === 'e' || direction === 'w') {
            handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
            handle.setAttribute('aria-valuemax', maxWidth);
            handle.setAttribute('aria-valuenow', nowWidth);
          } else if (direction === 'n' || direction === 's') {
            handle.setAttribute('aria-valuemin', String(MIN_HEIGHT));
            handle.setAttribute('aria-valuemax', maxHeight);
            handle.setAttribute('aria-valuenow', nowHeight);
          }
        }
      }

      /**
       * Apply a size through inline width/height only; layout, centering and
       * grid columns stay owned by the shell stylesheet.
       * @param {number} width - desired width.
       * @param {number} height - desired height.
       * @param {'silent' | 'soon' | 'now'} mode - persistence mode.
       * @param {{ maxWidth: number, maxHeight: number }} [limits] - bounds
       *   measured by the caller; drags and window resizes measure just once.
       */
      function setSize(width, height, mode, limits) {
        if (!panel || !panel.isConnected || isMobile()) return;
        const bounds = limits || measureLimits();
        const nextWidth = Math.round(clamp(width, MIN_WIDTH, bounds.maxWidth));
        const nextHeight = Math.round(clamp(height, MIN_HEIGHT, bounds.maxHeight));
        current = { width: nextWidth, height: nextHeight };
        panel.style.width = nextWidth + 'px';
        panel.style.height = nextHeight + 'px';
        refreshAria(bounds);
        if (mode === 'now') writeStored(nextWidth, nextHeight);
        else if (mode === 'soon') scheduleSave(nextWidth, nextHeight);
      }

      /**
       * Debounced persistence used while dragging.
       * @param {number} width - current width.
       * @param {number} height - current height.
       */
      function scheduleSave(width, height) {
        pendingSave = { width, height };
        if (saveTimer) return;
        saveTimer = win.setTimeout(() => {
          saveTimer = 0;
          const value = pendingSave;
          pendingSave = null;
          if (value) writeStored(value.width, value.height);
        }, SAVE_DELAY_MS);
      }

      /** Persist any pending size immediately. */
      function flushSave() {
        if (saveTimer) {
          win.clearTimeout(saveTimer);
          saveTimer = 0;
        }
        const value = pendingSave;
        pendingSave = null;
        if (value) writeStored(value.width, value.height);
      }

      /**
       * Apply the saved size, clamped to the current viewport and shell limits.
       * @param {{ maxWidth: number, maxHeight: number }} [limits] - bounds
       *   measured by the caller, so a resize measures only once.
       */
      function applyPreferred(limits) {
        if (!panel || isMobile()) return;
        if (stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)) {
          setSize(stored.width, stored.height, 'silent', limits);
          return;
        }
        const size = currentSize();
        setSize(size.width, size.height, 'silent', limits);
      }

      /** Remove every handle this instance knows about plus any orphaned ones. */
      function removeHandles() {
        for (const handle of Array.from(handles.values())) {
          handle.removeEventListener('pointerdown', onPointerDown);
          handle.removeEventListener('keydown', onKeyDown);
          handle.remove();
        }
        handles.clear();
        if (!panel) return;
        for (const orphan of Array.from(panel.querySelectorAll('[' + HANDLE_ATTR + ']'))) {
          orphan.remove();
        }
      }

      /**
       * Add handles for all eight directions. Only the east, south and
       * south-east handles are tab stops; the remaining handles stay reachable
       * by pointer and through assistive technology that moves focus directly.
       * @param {{ maxWidth: number, maxHeight: number }} [limits] - bounds
       *   measured by the caller; measured on demand when omitted.
       */
      function addHandles(limits) {
        if (!panel || isMobile()) return;
        removeHandles();
        const bounds = limits || measureLimits();
        const size = current || currentSize();
        for (const direction of DIRECTIONS) {
          const handle = doc.createElement('div');
          handle.className = 'dsh-sr-handle dsh-sr-' + direction;
          handle.setAttribute(HANDLE_ATTR, direction);
          handle.setAttribute('role', 'separator');
          handle.setAttribute('aria-label', handleLabel(direction));
          handle.setAttribute('tabindex', direction === 'e' || direction === 's' || direction === 'se' ? '0' : '-1');
          if (direction === 'n' || direction === 's') {
            handle.setAttribute('aria-orientation', 'horizontal');
            handle.setAttribute('aria-valuemin', String(MIN_HEIGHT));
            handle.setAttribute('aria-valuemax', String(Math.round(bounds.maxHeight)));
            handle.setAttribute('aria-valuenow', String(Math.round(size.height)));
          } else if (direction === 'e' || direction === 'w') {
            handle.setAttribute('aria-orientation', 'vertical');
            handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
            handle.setAttribute('aria-valuemax', String(Math.round(bounds.maxWidth)));
            handle.setAttribute('aria-valuenow', String(Math.round(size.width)));
          }
          handle.addEventListener('pointerdown', onPointerDown);
          handle.addEventListener('keydown', onKeyDown);
          panel.appendChild(handle);
          handles.set(direction, handle);
        }
      }

      /**
       * Verify that all handles are still attached and labelled. React may
       * drop unknown children while reconciling, so this runs after mutations.
       * @returns {boolean} true when the decoration is intact.
       */
      function handlesReady() {
        if (handles.size !== DIRECTIONS.length) return false;
        for (const [direction, handle] of handles) {
          if (!handle.isConnected || handle.parentNode !== panel) return false;
          const label = handleLabel(direction);
          if (handle.getAttribute('aria-label') !== label) handle.setAttribute('aria-label', label);
        }
        return true;
      }

      /**
       * Start a drag from one handle. Pointer capture is best effort: synthetic
       * input may not allocate a capture target, so window-level listeners are
       * the reliable path and capture only improves tracking outside the window.
       * @param {PointerEvent} event - pointerdown event from a handle.
       */
      function onPointerDown(event) {
        if (!panel || isMobile()) return;
        if (event.button !== 0) return;
        const direction = event.currentTarget.getAttribute(HANDLE_ATTR);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
        const target = event.currentTarget;
        const pointerId = event.pointerId;
        const size = currentSize();
        const limits = measureLimits();
        const startX = event.clientX;
        const startY = event.clientY;
        const controller = new AbortController();
        const finish = (finishEvent) => {
          if (finishEvent && finishEvent.pointerId !== pointerId) return;
          controller.abort();
          if (drag && drag.target === target && drag.pointerId === pointerId) drag = null;
          try {
            target.releasePointerCapture(pointerId);
          } catch {
            // Capture was never established.
          }
          target.removeAttribute(ACTIVE_ATTR);
          flushSave();
        };
        const move = (moveEvent) => {
          // A pointerup outside the window (or an Alt-Tab) may never reach the
          // listener; a move without the primary button ends the drag instead.
          if ((moveEvent.buttons & 1) === 0) {
            finish(moveEvent);
            return;
          }
          if (moveEvent.pointerId !== pointerId) return;
          if (moveEvent.cancelable) moveEvent.preventDefault();
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          let nextWidth = size.width;
          let nextHeight = size.height;
          if (direction.includes('e')) nextWidth = size.width + DRAG_SCALE * deltaX;
          if (direction.includes('w')) nextWidth = size.width - DRAG_SCALE * deltaX;
          if (direction.includes('s')) nextHeight = size.height + DRAG_SCALE * deltaY;
          if (direction.includes('n')) nextHeight = size.height - DRAG_SCALE * deltaY;
          setSize(nextWidth, nextHeight, 'soon', limits);
        };
        win.addEventListener('pointermove', move, { capture: true, signal: controller.signal });
        win.addEventListener('pointerup', finish, { capture: true, signal: controller.signal });
        win.addEventListener('pointercancel', finish, { capture: true, signal: controller.signal });
        try {
          target.setPointerCapture(pointerId);
        } catch {
          // Synthetic events may not own an active pointer; window listeners cover it.
        }
        drag = { controller, target, pointerId };
        target.setAttribute(ACTIVE_ATTR, '');
      }

      /** Stop an in-flight drag and persist its last size. */
      function cancelDrag() {
        if (!drag) return;
        const active = drag;
        drag = null;
        active.controller.abort();
        try {
          active.target.releasePointerCapture(active.pointerId);
        } catch {
          // Capture was never established.
        }
        active.target.removeAttribute(ACTIVE_ATTR);
        flushSave();
      }

      /**
       * Keyboard resizing: arrows move the chosen dimension in 16px steps.
       * @param {KeyboardEvent} event - keydown event from a handle.
       */
      function onKeyDown(event) {
        if (!panel || isMobile()) return;
        const direction = event.currentTarget.getAttribute(HANDLE_ATTR);
        if (!direction) return;
        let deltaWidth = 0;
        let deltaHeight = 0;
        if (event.key === 'ArrowRight') deltaWidth = KEYBOARD_STEP;
        else if (event.key === 'ArrowLeft') deltaWidth = -KEYBOARD_STEP;
        else if (event.key === 'ArrowUp') deltaHeight = KEYBOARD_STEP;
        else if (event.key === 'ArrowDown') deltaHeight = -KEYBOARD_STEP;
        else return;
        const supportsWidth = direction.includes('e') || direction.includes('w');
        const supportsHeight = direction.includes('n') || direction.includes('s');
        if (!supportsWidth) deltaWidth = 0;
        if (!supportsHeight) deltaHeight = 0;
        if (deltaWidth === 0 && deltaHeight === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const base = current || currentSize();
        setSize(base.width + deltaWidth, base.height + deltaHeight, 'now');
      }

      /** Remove the decoration from the current dialog and restore its inline styles. */
      function detach() {
        cancelDrag();
        removeHandles();
        if (panel && originals) {
          panel.style.width = originals.width;
          panel.style.height = originals.height;
        }
        panel = null;
        originals = null;
        current = null;
      }

      /** Capture the dialog's inline state and install the decoration. */
      function attach() {
        if (!panel) return;
        cancelDrag();
        originals = { width: panel.style.width, height: panel.style.height };
        if (isMobile()) return;
        const limits = measureLimits();
        addHandles(limits);
        applyPreferred(limits);
      }

      /**
       * Look for the dialog and keep its decoration in sync. Runs after
       * relevant mutations and once at startup.
       */
      function scan() {
        if (disposed) return;
        // React may drop the injected stylesheet; restore it before labelling.
        if (!doc.getElementById(STYLE_ID)) ensureStyles();
        const found = doc.querySelector(PANEL_SELECTOR);
        if (!found) {
          if (panel) detach();
          if (!warned && doc.querySelector('[role="dialog"][aria-modal="true"]')) {
            warned = true;
            console.warn('[dsh-settings-resizable] Settings dialog anchor is missing; resizing stays inactive.');
          }
          return;
        }
        if (found !== panel) {
          if (panel) detach();
          panel = found;
          attach();
          return;
        }
        if (isMobile()) {
          if (handles.size > 0) {
            cancelDrag();
            removeHandles();
          }
          if (originals) {
            panel.style.width = originals.width;
            panel.style.height = originals.height;
          }
          return;
        }
        if (!handlesReady()) {
          const limits = measureLimits();
          addHandles(limits);
          if (panel.style.width === '' || panel.style.height === '') applyPreferred(limits);
        }
      }

      /** Schedule one scan for the current mutation batch. */
      function scheduleScan() {
        if (scanScheduled || disposed) return;
        scanScheduled = true;
        const run = () => {
          scanScheduled = false;
          scan();
        };
        if (typeof win.queueMicrotask === 'function') win.queueMicrotask(run);
        else win.setTimeout(run, 0);
      }

      /**
       * Filter mutation batches so streaming chat content does not rescan the
       * document on every token.
       * @param {MutationRecord[]} records - records from the observer.
       * @returns {boolean} true when the dialog or its handles may have changed.
       */
      function shouldScan(records) {
        for (const record of records) {
          if (panel && record.target === panel) return true;
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node === panel || node.matches(PANEL_SELECTOR) || node.querySelector(PANEL_SELECTOR)) return true;
            if (panel && node.contains(panel)) return true;
          }
          for (const node of record.removedNodes) {
            if (!panel) continue;
            if (node === panel) return true;
            if (node.nodeType === 1 && node.contains(panel)) return true;
          }
        }
        return false;
      }

      /** React to viewport changes: mobile handoff and re-clamping. */
      function onResize() {
        if (disposed) return;
        if (!panel) {
          scan();
          return;
        }
        if (isMobile()) {
          cancelDrag();
          if (handles.size > 0) removeHandles();
          if (originals) {
            panel.style.width = originals.width;
            panel.style.height = originals.height;
          }
          return;
        }
        const limits = measureLimits();
        if (!handlesReady()) addHandles(limits);
        if (drag) {
          refreshAria(limits);
          return;
        }
        applyPreferred(limits);
      }

      /** Release every node, listener and timer owned by this controller. */
      function dispose() {
        if (disposed) return;
        disposed = true;
        flushSave();
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        win.removeEventListener('resize', onResize);
        cancelDrag();
        if (panel) detach();
        handles.clear();
        // Leave the stylesheet alone while another instance still has handles.
        if (ownsStyle
          && styleElement
          && styleElement.parentNode
          && doc.querySelectorAll('[' + HANDLE_ATTR + ']').length === 0) {
          styleElement.parentNode.removeChild(styleElement);
        }
        styleElement = null;
      }

      /**
       * Begin observing the document and decorate a dialog that is already open.
       * @returns {() => void} idempotent cleanup.
       */
      function start() {
        ensureStyles();
        if (typeof win.MutationObserver === 'function') {
          observer = new win.MutationObserver((records) => {
            if (shouldScan(records)) scheduleScan();
          });
          observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        }
        win.addEventListener('resize', onResize, { passive: true });
        scan();
        return dispose;
      }

      return { start };
    }

    return {
      inject: [],
      apply(ctx) {
        if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
        const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        if (locale && typeof locale.register === 'function' && typeof locale.bind === 'function') {
          ctx.effect(() => {
            const off = locale.register(LOCALE_NS, DICTIONARIES);
            return typeof off === 'function' ? off : undefined;
          }, 'dsh-settings-resizable: dictionaries');
        }
        const controller = createController(document, window, ctx);
        const dispose = controller.start();
        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(() => dispose, 'dsh-settings-resizable: dialog decoration');
        }
        return dispose;
      },
    };
  },
});
