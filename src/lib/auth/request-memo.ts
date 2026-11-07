import 'server-only'

/**
 * Ponovljena čitanja u jednom zahtevu (D-164): brend, članstva i lista brendova se čitaju jednom po
 * zahtevu, a ne u svakom servisu ponovo (brend po id-ju je bio najčešći upit u bazi). React cache() ne
 * radi u Route Handlerima, pa se pamti uz objekat korisnika (Viewer). Svaki API zahtev i svaki render
 * strane prave svoj Viewer, a ključ je slab (WeakMap), pa ništa ne prelazi u drugi zahtev ni na drugog
 * korisnika. Uključuje se samo za čitanja (GET i render strane): izmena posle upisa uvek čita iz baze.
 */
const stores = new WeakMap<object, Map<string, Promise<unknown>>>()

export function enableRequestMemo(owner: object): void {
  if (!stores.has(owner)) stores.set(owner, new Map())
}

/** Vrednost već pročitana drugim upitom u istom zahtevu (app-prefetch); postojeći unos se ne menja. */
export function seedRequestMemo<T>(owner: object, key: string, value: T): void {
  const store = stores.get(owner)
  if (!store || store.has(key)) return
  store.set(key, Promise.resolve(value))
}

export function requestMemo<T>(owner: object, key: string, load: () => Promise<T>): Promise<T> {
  const store = stores.get(owner)
  if (!store) return load()
  const hit = store.get(key)
  if (hit) return hit as Promise<T>
  const pending = load()
  store.set(key, pending)
  // greška se ne pamti: sledeći poziv pokušava ponovo
  pending.catch(() => {
    if (store.get(key) === pending) store.delete(key)
  })
  return pending
}
