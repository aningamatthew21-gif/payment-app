import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // You can also log error info to an error reporting service here
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: '#b91c1c', background: '#fef2f2', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 28, fontWeight: 'bold' }}>Something went wrong.</h1>
          <p style={{ marginTop: 16 }}>An unexpected error occurred in the application. Please try refreshing the page or contact support if the problem persists.</p>
          <details style={{ marginTop: 24, whiteSpace: 'pre-wrap', color: '#991b1b' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
