/**
 * Compendium Utilities - Read-only access to GM-approved (or auto-detected) compendiums
 *
 * Used by character creation and advancement tools. No write operations. No side effects.
 * The GM approves a flat list of compendium packs (via CompendiumPackSelector); which
 * category each pack feeds is found automatically from its own item types, never assigned
 * by the GM. No *setting-specific* default (e.g. Fantasy) is ever baked in — only the
 * official SWADE Core Rules module's own packs, which every SWADE table is expected to
 * have, as the approved list's starting default. See getPackIdsForCategory.
 *
 * Intentionally has no dependency on any other module's player-facing "curated compendium
 * visibility" settings — those control what players can browse in the sidebar, a separate
 * concern from what the GM has explicitly approved here as Character Manager's own data source.
 */

const MODULE_ID = "swade-character-manager";
const CORE_RULES_MODULE_ID = "swade-core-rules";

// The single world setting holding the GM's approved list of compendium packs for
// Character Manager to read from (a JSON array of pack IDs, picked via
// CompendiumPackSelector — see index.js). A pack isn't assigned to a category by the GM;
// each category's data is found by scanning the approved packs' own item types, so a pack
// with mixed content (however unlikely) can feed more than one category automatically.
const APPROVED_PACKS_SETTING_KEY = "compendiumPacks";

// This category's packs in the official SWADE Core Rules module. Exported so index.js can
// use it as the approved-list setting's default and for the picker's "Reset to Core Rules
// Defaults" action — Core Rules ships with (almost) every SWADE table, so it's a far more
// reliable default than leaving the approved list empty from the start.
export const CATEGORY_CORE_RULES_PACKS = {
  ancestries: [`${CORE_RULES_MODULE_ID}.swade-races`],
  skills: [`${CORE_RULES_MODULE_ID}.swade-skills`],
  edges: [`${CORE_RULES_MODULE_ID}.swade-edges`],
  hindrances: [`${CORE_RULES_MODULE_ID}.swade-hindrances`],
  gear: [
    `${CORE_RULES_MODULE_ID}.swade-equipment`,
    `${CORE_RULES_MODULE_ID}.swade-armor`,
    `${CORE_RULES_MODULE_ID}.swade-personal-weapons`,
    `${CORE_RULES_MODULE_ID}.swade-modern-firearms`,
    `${CORE_RULES_MODULE_ID}.swade-special-weapons`,
  ],
};

// Flattened, de-duplicated form of the above — the approved-list setting's default value.
export const CORE_RULES_DEFAULT_PACK_IDS = [...new Set(Object.values(CATEGORY_CORE_RULES_PACKS).flat())];

// Category -> SWADE item type(s), used to find which of the approved (or, if the GM has
// approved nothing, *every installed*) packs actually have that category's content.
// Exported so CompendiumPackSelector can show each pack's "Used For" categories.
export const CATEGORY_ITEM_TYPES = {
  ancestries: ["ancestry"],
  skills: ["skill"],
  edges: ["edge"],
  hindrances: ["hindrance"],
  gear: ["gear", "weapon", "armor", "shield"],
};

// Caches the type-detection result per category for the session; cleared whenever the
// approved-packs setting changes (see invalidatePackSourceCache, wired to onChange in index.js).
let detectCache = null;

export function invalidatePackSourceCache() {
  detectCache = null;
}

/**
 * Read the GM's approved pack ID list, filtered down to packs that actually exist.
 * @returns {Array<string>} Pack IDs
 */
function getApprovedPackIds() {
  try {
    const raw = game.settings?.get?.(MODULE_ID, APPROVED_PACKS_SETTING_KEY) ?? "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => game.packs?.has?.(id)) : [];
  } catch (error) {
    return [];
  }
}

/**
 * Scan a set of packs for at least one entry matching the category's item type(s).
 * @param {string} category
 * @param {Array<CompendiumCollection>} packs - Packs to scan
 * @returns {Promise<Array<string>>} Pack IDs (collection names) that have matching content
 */
async function detectPacksForCategory(category, packs) {
  const types = new Set(CATEGORY_ITEM_TYPES[category] ?? []);
  if (types.size === 0) return [];

  const results = await Promise.all(packs.map(async (pack) => {
    try {
      const index = await pack.getIndex();
      return index.some((entry) => types.has(entry.type)) ? pack.collection : null;
    } catch (error) {
      console.debug(`[Character Creation] Skipping pack while detecting ${category}: ${pack.collection}`, error);
      return null;
    }
  }));

  return results.filter(Boolean);
}

/**
 * Resolve the pack IDs feeding a category: scans the GM's approved pack list for ones
 * containing that category's item type(s), or — if the GM hasn't approved any packs —
 * every installed Item compendium instead, so the tool still isn't blank on first open.
 *
 * @param {string} category - 'ancestries' | 'skills' | 'edges' | 'hindrances' | 'gear'
 * @returns {Promise<Array<string>>} Pack IDs
 */
export async function getPackIdsForCategory(category) {
  const approvedIds = getApprovedPackIds();
  const candidatePacks = (approvedIds.length > 0
    ? approvedIds.map((id) => game.packs.get(id)).filter(Boolean)
    : [...game.packs].filter((pack) => pack.documentName === "Item"));

  if (!detectCache) detectCache = new Map();
  if (!detectCache.has(category)) {
    detectCache.set(category, await detectPacksForCategory(category, candidatePacks));
  }
  return detectCache.get(category);
}

/**
 * Fetch items from a compendium pack, with optional filtering.
 * Read-only; returns plain objects with name, uuid, and any requested `fields`.
 * Results are sorted alphabetically by name.
 *
 * Requests extra fields (e.g. 'system.description') directly from the pack index
 * instead of loading each item's full Document — a single indexed query per pack
 * instead of one document fetch per item, which is what made compendium loading
 * take ~2 seconds for a few dozen items.
 *
 * @param {string} packId - Pack collection ID
 * @param {string|Array<string>} [itemType] - Filter by item type(s) (e.g., 'ancestry', ['gear', 'weapon']). If provided, only returns items matching one of these types.
 * @param {Array<string>} [fields] - Additional index fields to request (dot-path, e.g. 'system.attribute')
 * @returns {Promise<Array>} Array of {name, uuid, ...fields} objects sorted alphabetically by name
 */
async function fetchPackItems(packId, itemType = null, fields = []) {
  try {
    const pack = game.packs.get(packId);
    if (!pack) return [];

    const index = await pack.getIndex({ fields });
    if (!index) return [];

    let items = Array.from(index).map((entry) => {
      const item = { name: entry.name, uuid: entry.uuid, type: entry.type, img: entry.img || '' };
      for (const field of fields) {
        foundry.utils.setProperty(item, field, foundry.utils.getProperty(entry, field));
      }
      return item;
    });

    // Filter by type if specified (accepts a single type or an array of types)
    if (itemType) {
      const allowedTypes = Array.isArray(itemType) ? new Set(itemType) : new Set([itemType]);
      items = items.filter((item) => allowedTypes.has(item.type));
    }

    // Sort alphabetically by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    return items;
  } catch (error) {
    console.warn(`[Character Creation] Failed to fetch pack ${packId}:`, error);
    return [];
  }
}

/**
 * Fetch items of a given type from several packs at once and merge into one sorted list —
 * used to combine every pack configured/detected for a category.
 *
 * @param {Array<string>} packIds - Pack collection IDs
 * @param {string|Array<string>} [itemType] - Filter by item type(s)
 * @param {Array<string>} [fields] - Additional index fields to request (dot-path)
 * @returns {Promise<Array>} Array of {name, uuid, ...fields} objects sorted alphabetically by name
 */
async function fetchPackItemsMulti(packIds, itemType = null, fields = []) {
  const lists = await Promise.all(packIds.map((packId) => fetchPackItems(packId, itemType, fields)));
  const items = lists.flat();
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/**
 * Get all ancestries from the configured ancestry compendium(s).
 * Filters to type='ancestry' to exclude child abilities.
 * Read-only; returns plain objects.
 *
 * @returns {Promise<Array>} Array of {name, uuid} objects
 */
export async function getAncestries() {
  return fetchPackItemsMulti(await getPackIdsForCategory('ancestries'), 'ancestry');
}

/**
 * Get all skills from the configured skill compendium(s).
 * Filters to type='skill'.
 * Fetches full item data to include linked attribute (system.attribute) and description.
 * Read-only; returns plain objects with metadata.
 *
 * @returns {Promise<Array>} Array of {name, uuid, attribute, description} objects sorted alphabetically
 */
export async function getSkills() {
  const items = await fetchPackItemsMulti(
    await getPackIdsForCategory('skills'),
    'skill',
    ['system.attribute', 'system.description']
  );

  return items.map((item) => ({
    name: item.name,
    uuid: item.uuid,
    img: item.img || '',
    attribute: item.system?.attribute ?? 'smarts',
    description: item.system?.description ?? '',
  }));
}

/**
 * Get all edges from the configured edge compendium(s).
 * Filters to type='edge'.
 * Fetches full item data to include description, image, and requirements.
 * Read-only; returns plain objects with metadata.
 *
 * @returns {Promise<Array>} Array of {name, uuid, description, img, requirements} objects sorted alphabetically
 */
export async function getEdges() {
  // Requirements are stored as a system DataModel (RequirementsField) with a custom
  // toString() that formats them for display — the compendium index only holds plain
  // serialized data, not model instances, so full Documents are still needed to render
  // requirements correctly. Fetching them one at a time via fromUuid() took ~7ms/item
  // (1.6s+ for ~230 edges); pack.getDocuments() fetches every document in a pack as a
  // single batch operation instead, which is dramatically faster for the same data.
  const packIds = await getPackIdsForCategory('edges');

  const packResults = await Promise.all(packIds.map(async (packId) => {
    const pack = game.packs.get(packId);
    if (!pack) return [];
    try {
      return await pack.getDocuments({ type: 'edge' });
    } catch (error) {
      console.warn(`[Character Creation] Failed to batch-fetch edges from ${packId}:`, error);
      return [];
    }
  }));

  const enriched = packResults.flat().map((edgeItem) => ({
    name: edgeItem.name,
    uuid: edgeItem.uuid,
    description: edgeItem.system?.description ?? '',
    img: edgeItem.img || '',
    requirements: Array.isArray(edgeItem.system?.requirements)
      ? edgeItem.system.requirements.map((r) => (typeof r?.toString === 'function' ? r.toString() : '')).filter(Boolean)
      : [],
  }));

  enriched.sort((a, b) => a.name.localeCompare(b.name));
  return enriched;
}

/**
 * Get all hindrances from the configured hindrance compendium(s).
 * Filters to type='hindrance'.
 * Fetches full item data to include Major/Minor flag (system.major).
 * Read-only; returns plain objects with metadata.
 *
 * @returns {Promise<Array>} Array of {name, uuid, major, description} objects sorted alphabetically
 */
export async function getHindrances() {
  const items = await fetchPackItemsMulti(
    await getPackIdsForCategory('hindrances'),
    'hindrance',
    ['system.major', 'system.severity', 'system.description']
  );

  return items.map((item) => ({
    name: item.name,
    uuid: item.uuid,
    major: item.system?.major ?? false,
    severity: item.system?.severity ?? 'either',
    description: item.system?.description ?? '',
    img: item.img || '',
  }));
}

/**
 * Get all starting-equipment items (gear, weapons, armor & shields) from the configured
 * gear compendium(s). Fetches full item data to include price, weight, image, and description.
 * Read-only; returns plain objects with metadata.
 *
 * @returns {Promise<Array>} Array of {name, uuid, price, weight, description, img, type, minStr} objects sorted alphabetically
 */
export async function getGearItems() {
  const packIds = await getPackIdsForCategory('gear');
  const items = await fetchPackItemsMulti(packIds, CATEGORY_ITEM_TYPES.gear, [
    'system.price',
    'system.weight',
    'system.description',
    'system.minStr',
    'system.armor',
  ]);

  const enriched = items.map((item) => ({
    name: item.name,
    uuid: item.uuid,
    price: item.system?.price ?? 0,
    weight: item.system?.weight ?? 0,
    description: item.system?.description ?? '',
    // Toughness bonus while worn (armor items only; 0/undefined for everything else).
    armor: item.system?.armor ?? 0,
    img: item.img || '',
    type: item.type,
    // Minimum Strength die needed to use this item without penalty (weapons/armor).
    // Not every gear item has one — items without it never trigger the Gear tab's warning.
    minStr: item.system?.minStr || null,
  }));

  enriched.sort((a, b) => a.name.localeCompare(b.name));
  return enriched;
}

/**
 * Get single item by UUID (read-only preview, not for import).
 * Safe for pulling full item details for display purposes.
 * 
 * @param {string} uuid - Item UUID
 * @returns {Promise<Object|null>} Item object or null if not found
 */
export async function getItemPreview(uuid) {
  try {
    const item = await fromUuid(uuid);
    return item ?? null;
  } catch (error) {
    console.warn(`[Character Creation] Failed to fetch item preview for ${uuid}:`, error);
    return null;
  }
}

/**
 * Get metadata (name, uuid) for multiple items by UUID.
 * Used for bulk operations like ancestry/skill/edge/hindrance selection.
 * 
 * @param {Array<string>} uuids - Array of item UUIDs
 * @returns {Promise<Array>} Array of {name, uuid} objects (skips invalid UUIDs)
 */
export async function getItemsByUuids(uuids) {
  if (!Array.isArray(uuids) || uuids.length === 0) return [];

  const results = [];
  for (const uuid of uuids) {
    try {
      const item = await fromUuid(uuid);
      if (item) {
        results.push({
          name: item.name,
          uuid: uuid,
        });
      }
    } catch (error) {
      console.debug(`[Character Creation] Skipping invalid UUID: ${uuid}`);
    }
  }
  return results;
}
