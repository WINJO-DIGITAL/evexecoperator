"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

const ToastContext = createContext(null);

export function useOperatorToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />,
  error: <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />,
  info: <Info className="h-4 w-4 flex-shrink-0 text-blue-600" />,
};

export function OperatorToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(({ message, type = "info", duration = 3500 }) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/*
        aria-live="polite" announces toasts to screen readers without interrupting.
        bottom-20 on mobile clears the fixed bottom nav bar (h-16 ≈ 64px + 16px gap).
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-20 right-4 z-[200] flex flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:max-w-sm"
          >
            {ICONS[t.type]}
            <span className="flex-1 text-sm text-[#0F1B33]">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="ml-1 flex-shrink-0 text-slate-500 transition hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}