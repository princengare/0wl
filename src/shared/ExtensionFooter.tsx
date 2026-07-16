import React from "react";
import { browser } from "./browser";

interface ExtensionFooterProps {
  onTodayClick?: () => void;
}

export function dashboardTodayUrl(): string {
  return browser.runtime.getURL("/options.html?tab=today");
}

export function ExtensionFooter({ onTodayClick }: ExtensionFooterProps): React.JSX.Element {
  function openToday(): void {
    if (onTodayClick) {
      onTodayClick();
      return;
    }

    window.location.assign(dashboardTodayUrl());
  }

  return (
    <footer className="terminal-footer terminal-brand-footer">
      <span>0wl</span>
      <span aria-hidden="true">·</span>
      <button
        className="terminal-icon-button"
        type="button"
        aria-label="Open today"
        title="Open today"
        onClick={openToday}
      >
        <img src={browser.runtime.getURL("/icons/w0wltb-32.png")} alt="" />
      </button>
    </footer>
  );
}
