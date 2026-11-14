import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Catches a crash in one screen so the rest of the app (header, tabs) keeps working,
 * and offers a way out instead of a blank page.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Screen crashed:', error, info.componentStack); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash card">
        <h3>Something went wrong on this screen</h3>
        <p className="muted small">Your saved work is safe. Try another tab, or reload the app.</p>
        <p className="muted small crash-detail">{this.state.error.message}</p>
        <button className="primary" onClick={() => window.location.reload()}>Reload GlowLab</button>
      </div>
    );
  }
}
