import { Component } from 'react';
import Button from '../ui/Button.jsx';
import Alert from '../ui/Alert.jsx';

/**
 * Catches render-time crashes so a single broken component cannot blank the
 * whole portal.
 *
 * The key is intentionally logged rather than rendered: a stack trace in the
 * UI leaks implementation detail, but losing it entirely makes the failure
 * undiagnosable.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert tone="danger" title="Something went wrong">
          <p>
            An unexpected error interrupted this page. Reloading usually clears it. If it keeps
            happening, the details are in the browser console.
          </p>
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
