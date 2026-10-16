export async function getCurrentCmsUser() {
  return Reflect.get(globalThis, "__closureDeletionUser") ?? null;
}
