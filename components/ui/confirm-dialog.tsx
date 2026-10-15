'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FOCUSABLE_SELECTOR,
  getNextFocusIndex,
  isBackdropDismissal,
  isEscapeKey,
  isTabKey,
  selectFocusReturnTarget,
  type ConfirmDismissReason,
} from '@/lib/ui/confirm-dialog-logic';

export interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Label shown on the confirm button while the operation is in progress. */
  pendingLabel?: string;
  /** True while the confirmed operation is running. Blocks every dismissal path. */
  isPending?: boolean;
  /** Customer-safe error to display inside the dialog. */
  error?: string | null;
  /** Visual tone of the confirm action. */
  tone?: 'destructive' | 'default';
  onConfirm: () => void;
  onDismiss: (reason: ConfirmDismissReason) => void;
  /** Control that opened the dialog; focus returns here on close when still present. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Focus target used when the triggering control no longer exists after closing. */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Reusable, accessible confirmation dialog for the Splender Jewel storefront.
 *
 * Accessibility:
 * - `role="alertdialog"` with `aria-modal`, labelled and described by its content.
 * - Focus moves to the safe (cancel) action on open and is trapped within the dialog.
 * - Escape and backdrop clicks dismiss the dialog unless an operation is pending.
 * - Focus returns to the triggering control (or a fallback target) on close.
 * - While pending, buttons use `aria-disabled` rather than `disabled` so keyboard
 *   focus is never dropped to the document body mid-operation.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel = 'Please wait...',
  isPending = false,
  error = null,
  tone = 'destructive',
  onConfirm,
  onDismiss,
  returnFocusRef,
  fallbackFocusRef,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const pointerDownOnBackdropRef = useRef(false);

  // Latest props for document-level listeners registered once per open cycle.
  const latestRef = useRef({ isPending, onDismiss, returnFocusRef, fallbackFocusRef });
  useEffect(() => {
    latestRef.current = { isPending, onDismiss, returnFocusRef, fallbackFocusRef };
  });

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Lock background scrolling while the dialog is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog, defaulting to the non-destructive action.
    (cancelButtonRef.current ?? panelRef.current)?.focus();

    function getFocusable(panel: HTMLElement): HTMLElement[] {
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;

      if (isEscapeKey(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        if (!latestRef.current.isPending) latestRef.current.onDismiss('escape');
        return;
      }

      if (isTabKey(event.key)) {
        const focusable = getFocusable(panel);
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex = getNextFocusIndex(currentIndex, focusable.length, event.shiftKey);
        event.preventDefault();
        (nextIndex === -1 ? panel : focusable[nextIndex]).focus();
      }
    }

    // Pull focus back if it ever escapes the dialog (e.g. via pointer interaction).
    function handleFocusIn(event: FocusEvent) {
      const panel = panelRef.current;
      if (!panel || panel.contains(event.target as Node)) return;
      const focusable = getFocusable(panel);
      (focusable[0] ?? panel).focus();
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.body.style.overflow = previousOverflow;

      const { returnFocusRef: triggerRef, fallbackFocusRef: fallbackRef } = latestRef.current;
      const target = selectFocusReturnTarget<HTMLElement>(
        triggerRef?.current ?? previouslyFocused,
        fallbackRef?.current ?? null
      );
      target?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    pointerDownOnBackdropRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const shouldDismiss = isBackdropDismissal(
      pointerDownOnBackdropRef.current,
      event.target,
      event.currentTarget
    );
    pointerDownOnBackdropRef.current = false;
    if (shouldDismiss && !isPending) onDismiss('backdrop');
  };

  const handleCancel = () => {
    if (isPending) return;
    onDismiss('cancel');
  };

  const handleConfirm = () => {
    if (isPending) return;
    onConfirm();
  };

  const content = (
    <div
      data-testid="confirm-dialog-backdrop"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isPending}
        tabIndex={-1}
        className="relative w-full max-w-md overflow-hidden rounded-sm border border-luxury-gold/30 bg-luxury-charcoal shadow-2xl shadow-black/70 outline-none"
      >
        {/* Gold accent line */}
        <div
          aria-hidden="true"
          className="h-px w-full bg-gradient-to-r from-transparent via-luxury-gold/70 to-transparent"
        />

        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className={
                tone === 'destructive'
                  ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-800/60 bg-rose-950/50 text-rose-400'
                  : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-luxury-gold/40 bg-luxury-gold/10 text-luxury-gold'
              }
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <h2
                id={titleId}
                className="font-serif text-lg font-bold tracking-wide text-white sm:text-xl"
              >
                {title}
              </h2>
              <p id={descriptionId} className="text-sm leading-relaxed text-neutral-400">
                {description}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-sm border border-rose-800/70 bg-rose-950/40 p-3 text-sm text-rose-300"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              ref={cancelButtonRef}
              type="button"
              variant="outline"
              onClick={handleCancel}
              aria-disabled={isPending || undefined}
              className="h-11 w-full border-neutral-700 bg-transparent text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-10 sm:w-auto sm:min-w-[8.5rem]"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={tone === 'destructive' ? 'destructive' : 'gold'}
              onClick={handleConfirm}
              aria-disabled={isPending || undefined}
              className="h-11 w-full gap-2 text-sm font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-80 sm:h-10 sm:w-auto sm:min-w-[9.5rem]"
            >
              {isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  <span>{pendingLabel}</span>
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
