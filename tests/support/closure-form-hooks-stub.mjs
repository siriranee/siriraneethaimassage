const current = () => globalThis[Symbol.for("closure-form-test-harness")];

export function useRef(value) { return { current: value }; }

export function useState(value) {
  const instance = current();
  return [value, (next) => instance.updates.push(next)];
}

export function useEffect(effect) {
  const cleanup = effect();
  if (cleanup) current().cleanups.push(cleanup);
}

export function useRouter() {
  const instance = current();
  return { refresh: () => { instance.refreshes += 1; } };
}

export function useUnsavedChanges() {
  const instance = current();
  return { dirty: false, markDirty() {}, markSaved() { instance.saved += 1; } };
}
