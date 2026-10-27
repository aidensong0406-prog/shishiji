import React from "react";
import { ErrorState } from "./States.jsx";

/** Catches render errors and failed lazy-chunk loads so one page can't blank the museum. */
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.warn("[museum] page error", error, info && info.componentStack); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(this.state.error.message));
    return (
      <ErrorState
        title={chunk ? "This room could not be loaded" : "Something went wrong in this room"}
        detail={chunk ? "The connection may have dropped, or the museum was updated. Reloading usually fixes it." : String(this.state.error.message || this.state.error)}
        action={<p><button className="btn primary" onClick={() => location.reload()}>Reload</button> <a className="btn" href="#/archive">Go to the archive</a></p>}
      />
    );
  }
}
