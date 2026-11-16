"use client";

import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import type { ToastItem } from "@/hooks/useToast";

const STYLES = {
  success: { icon: CheckCircle2, classes: "border-emerald-500/30 bg-emerald-100 text-emerald-700" },
  error:   { icon: XCircle,      classes: "border-red-500/30 bg-red-100 text-red-700" },
  warning: { icon: AlertTriangle,classes: "border-amber-500/30 bg-amber-100 text-amber-700" },
  info:    { icon: Info,         classes: "border-gold/25 bg-white/95 text-slate-700" },
} as const;

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast) => {
        const { icon: Icon, classes } = STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 w-full max-w-md px-4 py-3 rounded-xl border shadow-card backdrop-blur fade-in ${classes}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-xs font-medium flex-1 leading-snug">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}