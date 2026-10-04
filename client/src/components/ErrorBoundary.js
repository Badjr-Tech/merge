import React from 'react';
import api from '../api';

// Without this, any error thrown while rendering unmounts the whole React tree and the page goes
// blank — which is why a refresh "fixes" it. This catches the error, shows something readable, and
// reports it once per signature so the crash lands in the staff inbox instead of being invisible.
const reported = new Set();

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, shown: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const where = `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line no-console
    console.error('Merge crashed while rendering', where, error, info);
    const signature = `${where}|${error && error.message}`;
    if (reported.has(signature) || !localStorage.getItem('token')) return;
    reported.add(signature);
    const stack = String((info && info.componentStack) || '').split('\n').slice(0, 12).join('\n');
    api.post('/api/feedback', {
      type: 'bug',
      page: where,
      message: `Automatic crash report\n\n${error && error.message}\n\n${(error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : '')}\n\nComponent stack:${stack}`,
    }).catch(() => {});
  }

  componentDidUpdate(prevProps) {
    // Navigating away should clear the error so the app recovers without a refresh.
    if (this.state.error && prevProps.routeKey !== this.props.routeKey) this.setState({ error: null, shown: false });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = String(this.state.error.message || this.state.error);
    return (
      <div className="crash">
        <div className="crash-card">
          <h2>This page didn't load</h2>
          <p className="muted">Something went wrong while drawing this page. Nothing you saved is affected. Reloading usually fixes it, and we've been told about it automatically.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload the page</button>
            <a className="btn btn-secondary" href="/app">Go to Home</a>
          </div>
          <details className="mt-3">
            <summary className="small" style={{ cursor: 'pointer', color: 'var(--indigo)' }}>Technical details</summary>
            <pre className="crash-detail">{message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
