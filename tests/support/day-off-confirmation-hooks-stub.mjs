const current = () => globalThis[Symbol.for("day-off-confirmation-test-harness")];

function hook(initial) {
  const instance = current();
  const index = instance.cursor++;
  if (!(index in instance.slots)) instance.slots[index] = initial();
  return [instance, index, instance.slots[index]];
}

export function useState(initial) {
  const [instance, index, value] = hook(() => typeof initial === "function" ? initial() : initial);
  return [value, (next) => {
    const value = typeof next === "function" ? next(instance.slots[index]) : next;
    instance.slots[index] = value;
    instance.updates.push(value);
  }];
}

export function useRef(initial) {
  return hook(() => ({ current: initial }))[2];
}

export function useId() {
  const [instance, index] = hook(() => null);
  return `day-off-${instance.id}-${index}`;
}

export function useEffect(effect, dependencies) {
  const [instance, , slot] = hook(() => ({ dependencies: undefined, cleanup: undefined }));
  const changed = !dependencies || !slot.dependencies ||
    dependencies.some((value, index) => !Object.is(value, slot.dependencies[index]));
  if (!changed) return;
  slot.dependencies = dependencies;
  instance.effects.push(() => {
    slot.cleanup?.();
    slot.cleanup = effect();
  });
}

export function useRouter() {
  const instance = current();
  return { refresh: () => { instance.refreshes += 1; } };
}
