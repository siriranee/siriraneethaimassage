"use client";

import { useCallback, useEffect, useState } from "react";

export function useUnsavedChanges() {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    dirty,
    markDirty: useCallback(() => setDirty(true), []),
    markSaved: useCallback(() => setDirty(false), []),
  };
}
