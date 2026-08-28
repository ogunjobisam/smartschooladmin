import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Rendered instead of the default screen. Receives a reset callback. */
  fallback?: (reset: () => void) => ReactNode;
  /** Changing this value clears a caught error — pass the route path to reset on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a single broken page shows a recoverable
 * message instead of an empty white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            This page failed to load. Try again, and if it keeps happening let us know
            what you were doing when it broke.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={this.reset} variant="default" size="sm" className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          <Button onClick={() => window.location.assign("/dashboard")} variant="outline" size="sm">
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }
}
