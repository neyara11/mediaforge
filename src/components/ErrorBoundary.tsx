import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center p-8">
            <div className="rounded-lg border border-red-800 bg-red-950/50 p-6">
              <p className="text-sm font-medium text-red-400">Component Error</p>
              <pre className="mt-2 max-w-md whitespace-pre-wrap text-xs text-red-300/70">
                {this.state.error}
              </pre>
              <button
                onClick={this.handleReset}
                className="mt-4 rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-900/50"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
