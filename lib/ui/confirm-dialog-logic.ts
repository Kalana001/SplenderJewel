/**
 * Pure state machine and focus-management helpers for confirmation dialogs.
 *
 * Kept free of React and the DOM so that the exact logic used by
 * `components/ui/confirm-dialog.tsx` and its callers can be executed
 * directly by the Node.js test runner.
 *
 * Lifecycle:
 *   closed --OPEN--> open --CONFIRM_START--> pending --CONFIRM_SUCCESS--> closed
 *                     ^                         |
 *                     +----CONFIRM_FAILURE------+   (error shown, data untouched)
 *   open --DISMISS--> closed        (DISMISS is ignored while pending)
 */

export type ConfirmDialogPhase = 'closed' | 'open' | 'pending';

export type ConfirmDismissReason = 'cancel' | 'escape' | 'backdrop';

export interface ConfirmDialogState {
  phase: ConfirmDialogPhase;
  error: string | null;
}

export type ConfirmDialogEvent =
  | { type: 'OPEN' }
  | { type: 'DISMISS'; reason: ConfirmDismissReason }
  | { type: 'CONFIRM_START' }
  | { type: 'CONFIRM_SUCCESS' }
  | { type: 'CONFIRM_FAILURE'; error: string };

export const INITIAL_CONFIRM_DIALOG_STATE: ConfirmDialogState = Object.freeze({
  phase: 'closed',
  error: null,
}) as ConfirmDialogState;

export function confirmDialogReducer(
  state: ConfirmDialogState,
  event: ConfirmDialogEvent
): ConfirmDialogState {
  switch (event.type) {
    case 'OPEN':
      return state.phase === 'closed' ? { phase: 'open', error: null } : state;
    case 'DISMISS':
      // A destructive operation in progress can never be dismissed.
      return state.phase === 'open' ? INITIAL_CONFIRM_DIALOG_STATE : state;
    case 'CONFIRM_START':
      return state.phase === 'open' ? { phase: 'pending', error: null } : state;
    case 'CONFIRM_SUCCESS':
      return state.phase === 'pending' ? INITIAL_CONFIRM_DIALOG_STATE : state;
    case 'CONFIRM_FAILURE':
      return state.phase === 'pending' ? { phase: 'open', error: event.error } : state;
    default:
      return state;
  }
}

export function isDialogOpen(state: ConfirmDialogState): boolean {
  return state.phase !== 'closed';
}

export function canDismissDialog(state: ConfirmDialogState): boolean {
  return state.phase === 'open';
}

// -----------------------------------------------------------------------------
// Guarded confirmation execution
// -----------------------------------------------------------------------------

/** Synchronous in-flight flag (e.g. a React ref) that blocks duplicate submissions. */
export interface ConfirmInFlightGuard {
  current: boolean;
}

export type ConfirmExecutionResult = 'success' | 'failure' | 'ignored';

export interface ExecuteConfirmOptions {
  /** Maps raw server/runtime errors to a customer-safe message. */
  toErrorMessage: (raw: unknown) => string;
  /** Runs only after the server has confirmed success. */
  onSuccess?: () => void;
}

/**
 * Runs a confirmation action exactly once at a time.
 *
 * - A second call while the first is in flight is ignored (duplicate-click prevention).
 * - Success is only reported after the action resolves with `{ success: true }`.
 * - Failures (resolved `{ success: false }` or thrown errors) return the dialog to
 *   the open state with a safe error message and never invoke `onSuccess`.
 */
export async function executeGuardedConfirm(
  guard: ConfirmInFlightGuard,
  action: () => Promise<{ success: boolean; error?: string } | null | undefined>,
  dispatch: (event: ConfirmDialogEvent) => void,
  options: ExecuteConfirmOptions
): Promise<ConfirmExecutionResult> {
  if (guard.current) return 'ignored';
  guard.current = true;
  dispatch({ type: 'CONFIRM_START' });

  try {
    const result = await action();
    if (result && result.success === true) {
      options.onSuccess?.();
      dispatch({ type: 'CONFIRM_SUCCESS' });
      return 'success';
    }
    dispatch({ type: 'CONFIRM_FAILURE', error: options.toErrorMessage(result?.error) });
    return 'failure';
  } catch (err) {
    dispatch({ type: 'CONFIRM_FAILURE', error: options.toErrorMessage(err) });
    return 'failure';
  } finally {
    guard.current = false;
  }
}

// -----------------------------------------------------------------------------
// Keyboard and pointer helpers
// -----------------------------------------------------------------------------

export function isEscapeKey(key: string | undefined | null): boolean {
  return key === 'Escape' || key === 'Esc';
}

export function isTabKey(key: string | undefined | null): boolean {
  return key === 'Tab';
}

/**
 * A backdrop dismissal only counts when both the press and the release happened
 * on the backdrop itself, so a text selection dragged out of the panel never
 * closes the dialog accidentally.
 */
export function isBackdropDismissal(
  pointerDownOnBackdrop: boolean,
  clickTarget: unknown,
  backdropElement: unknown
): boolean {
  return pointerDownOnBackdrop && clickTarget != null && clickTarget === backdropElement;
}

/**
 * Computes the next focus index for a cyclic focus trap.
 *
 * @param currentIndex Index of the focused element within the trap, or -1 when
 *                     focus is on the dialog container or outside the trap.
 * @param total        Number of focusable elements inside the dialog.
 * @param backwards    True for Shift+Tab.
 * @returns The index to focus, or -1 when there is nothing focusable (keep
 *          focus on the dialog container).
 */
export function getNextFocusIndex(currentIndex: number, total: number, backwards: boolean): number {
  if (!Number.isInteger(total) || total <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= total) {
    return backwards ? total - 1 : 0;
  }
  const step = backwards ? -1 : 1;
  return (currentIndex + step + total) % total;
}

export interface FocusableLike {
  isConnected?: boolean;
  focus?: unknown;
  hasAttribute?: (name: string) => boolean;
}

/** True when an element can safely receive restored focus. */
export function canRestoreFocusTo(element: FocusableLike | null | undefined): boolean {
  if (!element) return false;
  if (element.isConnected !== true) return false;
  if (typeof element.focus !== 'function') return false;
  if (typeof element.hasAttribute === 'function' && element.hasAttribute('disabled')) return false;
  return true;
}

/**
 * Chooses where focus should return after the dialog closes:
 * the triggering control if it is still present, otherwise the fallback target.
 */
export function selectFocusReturnTarget<T extends FocusableLike>(
  trigger: T | null | undefined,
  fallback: T | null | undefined
): T | null {
  if (canRestoreFocusTo(trigger)) return trigger as T;
  if (canRestoreFocusTo(fallback)) return fallback as T;
  return null;
}

/** Selector for elements that participate in the dialog focus trap. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
