import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 13, color: '#e0ddd5', background: '#0a0a0b', minHeight: '100vh' }}>
          <h2 style={{ color: '#b8334a' }}>WorldMap crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#888' }}>{this.state.error?.stack?.slice(0, 1500)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
