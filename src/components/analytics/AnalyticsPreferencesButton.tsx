"use client";

import { analyticsPreferencesEvent } from "@/lib/analytics";

export function AnalyticsPreferencesButton({ className }: Readonly<{ className?: string }>) {
  return (
    <button
      className={className}
      onClick={() => window.dispatchEvent(new Event(analyticsPreferencesEvent))}
      type="button"
    >
      Analytics preferences
    </button>
  );
}
