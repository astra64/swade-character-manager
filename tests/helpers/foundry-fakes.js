/**
 * Minimal fakes of the Foundry VTT globals compendium-utils.js touches.
 * Not a full Foundry mock — just enough surface area to exercise real logic.
 */

/** Foundry's own Collection class is a Map whose iterator yields values, not [k,v] entries. */
export class FakeCollection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
}

/**
 * Build a fake CompendiumCollection. `entries` are index-shaped ({name, uuid, type, img, system}),
 * used by both getIndex() (trimmed to requested fields) and getDocuments() (full entries, since
 * nothing here distinguishes an index entry from a full Document).
 */
export function makeFakePack(collectionId, entries, { documentName = 'Item', throwOnIndex = false, throwOnDocuments = false } = {}) {
  return {
    collection: collectionId,
    documentName,
    metadata: { label: collectionId },
    async getIndex({ fields = [] } = {}) {
      if (throwOnIndex) throw new Error(`simulated getIndex failure for ${collectionId}`);
      return entries.map((entry) => {
        const trimmed = { name: entry.name, uuid: entry.uuid, type: entry.type, img: entry.img };
        for (const field of fields) {
          setProperty(trimmed, field, getProperty(entry, field));
        }
        return trimmed;
      });
    },
    async getDocuments({ type } = {}) {
      if (throwOnDocuments) throw new Error(`simulated getDocuments failure for ${collectionId}`);
      return type ? entries.filter((e) => e.type === type) : entries.slice();
    },
  };
}

function getProperty(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setProperty(obj, path, value) {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
    target = target[key];
  }
  target[parts[parts.length - 1]] = value;
}

/** Installs globalThis.game/foundry fakes. Call in beforeEach; returns the fake `game` for setup. */
export function installFoundryFakes({ packs = [], settings = {}, modules = {} } = {}) {
  const packCollection = new FakeCollection(packs.map((pack) => [pack.collection, pack]));
  const settingsStore = new Map(Object.entries(settings));
  const moduleCollection = new FakeCollection(Object.entries(modules));

  globalThis.game = {
    packs: packCollection,
    settings: {
      get: (moduleId, key) => settingsStore.get(key),
      set: (moduleId, key, value) => {
        settingsStore.set(key, value);
      },
    },
    modules: moduleCollection,
  };

  globalThis.foundry = {
    utils: { getProperty, setProperty },
  };

  // Tests that need fromUuid() set globalThis.__fakeUuidMap themselves (a Map<uuid, item>).
  globalThis.fromUuid = async (uuid) => globalThis.__fakeUuidMap?.get(uuid) ?? null;

  return { game: globalThis.game, settingsStore };
}
