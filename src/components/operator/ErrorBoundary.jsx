"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logError } from "../../lib/errorLog";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
    logError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/[0.06]">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0F1B33]">Something went wrong</p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              {this.state.error?.message ?? "An unexpected error occurred on this page."}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm text-slate-600 transition hover:border-amber-400/20 hover:text-amber-600"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}