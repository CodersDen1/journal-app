import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { UndoSnackbar } from '../components/UndoSnackbar';

interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss delay in ms. Default 4000. */
  duration?: number;
}

interface SnackbarContextValue {
  /** Show a snackbar with an optional undo action. */
  show: (options: SnackbarOptions) => void;
  hide: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

/**
 * Hosts a single global UndoSnackbar above all screens (including the tab bar)
 * so archive/delete confirmations never overlap content or the home indicator.
 */
export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<SnackbarOptions>({ message: '' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const show = useCallback(
    (next: SnackbarOptions) => {
      clearTimer();
      setOptions(next);
      setVisible(true);
      timer.current = setTimeout(() => setVisible(false), next.duration ?? 4000);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const handleAction = useCallback(() => {
    options.onAction?.();
    hide();
  }, [options, hide]);

  const value = useMemo<SnackbarContextValue>(() => ({ show, hide }), [show, hide]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <UndoSnackbar
        visible={visible}
        message={options.message}
        actionLabel={options.actionLabel}
        onAction={handleAction}
        onDismiss={hide}
      />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within a SnackbarProvider');
  return ctx;
}
