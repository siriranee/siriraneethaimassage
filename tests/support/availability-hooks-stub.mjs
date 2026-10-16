const current = () => globalThis[Symbol.for("availability-test-harness")];

export function useRef(value) { return { current: value }; }
export function useId() { return "availability-test"; }
export function useMemo(calculate) { return calculate(); }

export function useState(value) {
  const instance = current();
  return [typeof value === "function" ? value() : value, (next) => instance.updates.push(next)];
}

export function useEffect(effect) { current().effects.push(effect); }
