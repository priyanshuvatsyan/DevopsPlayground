import React from "react";
import "./Header.css";

/**
 * Top navigation bar for the DevOps Playground dashboard.
 * Shows the app title, active namespace, and a live/refresh indicator.
 */
export default function Header({ namespace = "devopsplayground", connected = true, onRefresh }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <span className="header-logo-mark">⌘</span>
        </div>
        <div className="header-title-block">
          <h1 className="header-title">DevOps Playground</h1>
          <span className="header-subtitle">namespace: {namespace}</span>
        </div>
      </div>

      <div className="header-right">
        <div className={`header-status ${connected ? "is-live" : "is-down"}`}>
          <span className="header-status-dot" />
          {connected ? "Live" : "Disconnected"}
        </div>
        <button className="header-refresh-btn" onClick={onRefresh} title="Refresh now">
          Refresh
        </button>
      </div>
    </header>
  );
}