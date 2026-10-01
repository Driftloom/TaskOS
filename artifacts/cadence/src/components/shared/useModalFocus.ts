import { useEffect, useRef, type RefObject } from 'react';

/**
 * useModalFocus -- the keyboard contract for a hand-rolled modal.
 *
 * WHY THIS EXISTS
 * ---------------
 * `QuickCaptureSheet` and the sign-out confirmation both declare
 * `role="dialog" aria-modal="true"` and neither of them behaved like one:
 * Tab walked straight out of the overlay and into the page behind it, focus was
 * never moved in on open, and it never came back to the control that opened it.
 * A modal that does not hold focus is not a modal -- a keyboard user who opens
 * "Sign out of Cadence?" and presses Tab is editing a task instead.
 *
 * axe cannot see any of that. There is no WCAG rule for "Tab stays inside the
 * dialog"; it is the WAI-ARIA dialog pattern, and the criteria it serves are
 * SC 2.4.3 (Focus Order) and SC 2.1.1/2.1.2 (Keyboard / No Keyboard Trap --
 * note the tension: a modal MUST contain Tab, or it is a trap; what it must
 * never do is contain it with no way out, which is what Escape and the visible
 * dismiss control are for). So it has to be tested, and then it has to be fixed
 * here, because a test that fails forever is not a gate.
 *
 * Radix-backed dialogs (`components/ui/alert-dialog.tsx`, `dialog.tsx`) already
 * do all of this, which is why this hook is only for the hand-rolled overlays.
 *
 * THE THREE THINGS IT GUARANTEES
 * ------------------------------
 *   1. On open, focus is INSIDE the dialog. If something inside already has
 *      focus -- an `autoFocus` input, say -- it is left alone; otherwise the
 *      first focusable descendant is focused, or the container itself (which the
 *      caller gives `tabIndex={-1}` so it can hold focus with no focusables).
 *   2. Tab and Shift+Tab cycle inside the dialog and never leave it.
 *   3. On close, focus returns to whatever had it before the dialog opened.
 *
 * `onEscape` is handled here rather than in each caller so "Escape closes this
 * modal" is one implementation, not five.
 *
 * LISTENER PHASE
 * --------------
 * `capture: true` on `document`. A dialog that opens while another one is open,
 * or a consumer that stops propagation on keydown, must not be able to swallow
 * the Tab that keeps focus contained.
 */

/**
 * Elements a keyboard can reach. `contenteditable` is included because it is
 * focusable and scriptable without being one of these tags.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A control is reachable if it is not disabled, not hidden from assistive tech,
 * and actually laid out. Note that this deliberately does NOT test opacity: a
 * control at `opacity-0` is still hit-testable and still focusable, so treating
 * it as absent would let focus escape a dialog onto something the user cannot
 * see. (The same rule is why the tap-target probe asserts visibility.)
 */
function isReachable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[inert]')) return false;
  return el.getClientRects().length > 0;
}

/** Every keyboard-reachable control inside `root`, in DOM order. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable);
}

export interface ModalFocusOptions {
  /**
   * Called on Escape while the dialog is open. Omit it and Escape does nothing,
   * which is only correct for a dialog that genuinely cannot be dismissed.
   */
  onEscape?: () => void;
}

export function useModalFocus(
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
  options: ModalFocusOptions = {},
): void {
  const { onEscape } = options;

  /* WHERE THE OPENER IS CAPTURED, AND WHY IT CANNOT BE CAPTURED IN THE EFFECT
     ------------------------------------------------------------------------
     The obvious implementation reads `document.activeElement` inside the
     effect. That is wrong whenever the dialog's own content autofocuses: React
     applies `autoFocus` during the commit, so by the time an effect runs the
     sheet's text field is already the active element and "restore focus on
     close" dutifully focuses a node that is being unmounted. The result is
     focus landing on <body> -- which is exactly the bug this hook was written
     to remove, and which the first version of it reproduced.

     During RENDER is the only moment `document.activeElement` still names the
     control that opened the dialog: the DOM has not been mutated yet, so no
     autofocus has run. Writing a ref during render is normally discouraged, but
     this is idempotent (the same element is re-read on a re-render), it does not
     affect the output tree, and there is no concurrent-render hazard because the
     value it captures is external to React. */
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  if (open !== wasOpenRef.current) {
    if (open) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
    }
    wasOpenRef.current = open;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;

    const opener = openerRef.current;

    const items = () => focusableWithin(container);

    if (!container.contains(document.activeElement)) {
      const preferred =
        container.querySelector<HTMLElement>('[data-modal-autofocus]') ?? items()[0] ?? container;
      preferred.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onEscape) {
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      const reachable = items();
      if (reachable.length === 0) {
        // Nothing to move to: keep focus on the container rather than let it
        // fall out of the dialog onto the page behind.
        event.preventDefault();
        container.focus();
        return;
      }

      const first = reachable[0];
      const last = reachable[reachable.length - 1];
      const active = document.activeElement;

      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // The opener may itself have been unmounted (a sign-out navigates away).
      // `focus()` on a detached element is a no-op, so this is safe either way.
      if (opener && opener.isConnected) opener.focus();
    };
  }, [containerRef, open, onEscape]);
}
