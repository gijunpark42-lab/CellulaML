"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** short name of the feature, shown in the fallback */
  name: string;
  children: ReactNode;
  className?: string;
}

interface State {
  error: Error | null;
}

/** Keeps one broken feature from taking the whole app down. Offers a retry that remounts the subtree. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[cellulaML] ${this.props.name} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300 ${this.props.className ?? ""}`}>
        <p className="font-medium">{this.props.name} failed</p>
        <p className="mt-1 break-words text-red-300/80">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 underline underline-offset-2"
        >
          retry
        </button>
      </div>
    );
  }
}
