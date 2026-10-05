import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFoundryFakes, makeFakePack } from './helpers/foundry-fakes.js';
import {
  CATEGORY_CORE_RULES_PACKS,
  CORE_RULES_DEFAULT_PACK_IDS,
  CATEGORY_ITEM_TYPES,
  invalidatePackSourceCache,
  getPackIdsForCategory,
  getAncestries,
  getSkills,
  getEdges,
  getHindrances,
  getGearItems,
  getItemPreview,
  getItemsByUuids,
} from '../scripts/lib/compendium-utils.js';

const APPROVED_PACKS_SETTING_KEY = 'compendiumPacks';

beforeEach(() => {
  invalidatePackSourceCache();
  delete globalThis.__fakeUuidMap;
});

describe('CATEGORY_CORE_RULES_PACKS / CORE_RULES_DEFAULT_PACK_IDS', () => {
  it('flattens and dedupes the per-category Core Rules pack map', () => {
    const allListed = Object.values(CATEGORY_CORE_RULES_PACKS).flat();
    expect(new Set(CORE_RULES_DEFAULT_PACK_IDS)).toEqual(new Set(allListed));
    expect(CORE_RULES_DEFAULT_PACK_IDS.length).toBe(new Set(allListed).size);
  });
});

describe('getPackIdsForCategory', () => {
  it('scans only the GM-approved packs when the approved list is non-empty', () => {
    const racesPack = makeFakePack('swade-core-rules.swade-races', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);
    const otherAncestryPack = makeFakePack('other-module.ancestries', [{ name: 'Dwarf', uuid: 'u2', type: 'ancestry' }]);

    installFoundryFakes({
      packs: [racesPack, otherAncestryPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify(['swade-core-rules.swade-races']) },
    });

    return getPackIdsForCategory('ancestries').then((ids) => {
      expect(ids).toEqual(['swade-core-rules.swade-races']);
    });
  });

  it('auto-detects across every installed Item pack when the approved list is empty', async () => {
    const racesPack = makeFakePack('swade-core-rules.swade-races', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);
    const otherAncestryPack = makeFakePack('other-module.ancestries', [{ name: 'Dwarf', uuid: 'u2', type: 'ancestry' }]);
    // Entry deliberately shaped to match the 'ancestries' category (type: 'ancestry') despite
    // living in a non-Item compendium — this only stays excluded if the documentName filter is
    // actually applied; an empty-entries journal pack wouldn't catch that filter being dropped.
    const journalPack = makeFakePack(
      'other-module.journals',
      [{ name: 'Not Really An Ancestry', uuid: 'u3', type: 'ancestry' }],
      { documentName: 'JournalEntry' }
    );

    installFoundryFakes({
      packs: [racesPack, otherAncestryPack, journalPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: '[]' },
    });

    const ids = await getPackIdsForCategory('ancestries');
    expect(new Set(ids)).toEqual(new Set(['swade-core-rules.swade-races', 'other-module.ancestries']));
  });

  it('ignores approved pack IDs that no longer correspond to an installed pack', async () => {
    const racesPack = makeFakePack('swade-core-rules.swade-races', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);

    installFoundryFakes({
      packs: [racesPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify(['swade-core-rules.swade-races', 'uninstalled.module']) },
    });

    const ids = await getPackIdsForCategory('ancestries');
    expect(ids).toEqual(['swade-core-rules.swade-races']);
  });

  it('excludes an approved pack that has no matching item type', async () => {
    const racesPack = makeFakePack('swade-core-rules.swade-races', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);
    const skillsPack = makeFakePack('swade-core-rules.swade-skills', [{ name: 'Fighting', uuid: 'u2', type: 'skill' }]);

    installFoundryFakes({
      packs: [racesPack, skillsPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([racesPack.collection, skillsPack.collection]) },
    });

    const ids = await getPackIdsForCategory('ancestries');
    expect(ids).toEqual(['swade-core-rules.swade-races']);
  });

  it('skips a pack whose getIndex() throws, instead of failing the whole scan', async () => {
    const goodPack = makeFakePack('good.pack', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);
    const badPack = makeFakePack('bad.pack', [{ name: 'Elf', uuid: 'u2', type: 'ancestry' }], { throwOnIndex: true });

    installFoundryFakes({
      packs: [goodPack, badPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([goodPack.collection, badPack.collection]) },
    });

    const ids = await getPackIdsForCategory('ancestries');
    expect(ids).toEqual(['good.pack']);
  });

  it('caches the detection result per category until invalidatePackSourceCache() is called', async () => {
    const racesPack = makeFakePack('swade-core-rules.swade-races', [{ name: 'Human', uuid: 'u1', type: 'ancestry' }]);
    const getIndexSpy = vi.spyOn(racesPack, 'getIndex');

    installFoundryFakes({
      packs: [racesPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([racesPack.collection]) },
    });

    await getPackIdsForCategory('ancestries');
    await getPackIdsForCategory('ancestries');
    expect(getIndexSpy).toHaveBeenCalledTimes(1);

    invalidatePackSourceCache();
    await getPackIdsForCategory('ancestries');
    expect(getIndexSpy).toHaveBeenCalledTimes(2);
  });
});

describe('getAncestries / getSkills / getHindrances (fetchPackItems-based)', () => {
  it('getAncestries filters to type=ancestry and sorts alphabetically, merging multiple packs', async () => {
    const packA = makeFakePack('a.pack', [
      { name: 'Zorn', uuid: 'u1', type: 'ancestry' },
      { name: 'Ability-Child', uuid: 'u2', type: 'ancestry-ability' },
    ]);
    const packB = makeFakePack('b.pack', [{ name: 'Alvin', uuid: 'u3', type: 'ancestry' }]);

    installFoundryFakes({
      packs: [packA, packB],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([packA.collection, packB.collection]) },
    });

    const ancestries = await getAncestries();
    expect(ancestries.map((a) => a.name)).toEqual(['Alvin', 'Zorn']);
  });

  it('getSkills maps linked attribute/description with defaults when missing', async () => {
    const pack = makeFakePack('skills.pack', [
      { name: 'Fighting', uuid: 'u1', type: 'skill', system: { attribute: 'agility', description: 'Melee combat' } },
      { name: 'No Attr Skill', uuid: 'u2', type: 'skill' },
    ]);

    installFoundryFakes({
      packs: [pack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([pack.collection]) },
    });

    const skills = await getSkills();
    const fighting = skills.find((s) => s.name === 'Fighting');
    const noAttr = skills.find((s) => s.name === 'No Attr Skill');
    expect(fighting).toMatchObject({ attribute: 'agility', description: 'Melee combat' });
    expect(noAttr).toMatchObject({ attribute: 'smarts', description: '' });
  });

  it('getHindrances defaults severity to "either" and maps major flag', async () => {
    const pack = makeFakePack('hindrances.pack', [
      { name: 'Greedy', uuid: 'u1', type: 'hindrance', system: { major: true, severity: 'major' } },
      { name: 'Clueless', uuid: 'u2', type: 'hindrance', system: { major: false } },
    ]);

    installFoundryFakes({
      packs: [pack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([pack.collection]) },
    });

    const hindrances = await getHindrances();
    expect(hindrances.find((h) => h.name === 'Greedy')).toMatchObject({ major: true, severity: 'major' });
    expect(hindrances.find((h) => h.name === 'Clueless')).toMatchObject({ major: false, severity: 'either' });
  });

  it('getGearItems filters to gear/weapon/armor/shield and maps price/weight/minStr', async () => {
    const pack = makeFakePack('gear.pack', [
      { name: 'Longsword', uuid: 'u1', type: 'weapon', system: { price: 50, weight: 4, minStr: 'd6' } },
      { name: 'Potion', uuid: 'u2', type: 'consumable', system: { price: 5, weight: 0.5 } },
    ]);

    installFoundryFakes({
      packs: [pack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([pack.collection]) },
    });

    const gear = await getGearItems();
    expect(gear.map((g) => g.name)).toEqual(['Longsword']);
    expect(gear[0]).toMatchObject({ price: 50, weight: 4, minStr: 'd6', armor: 0 });
  });
});

describe('getEdges (getDocuments-based)', () => {
  it('maps requirements via toString() and sorts alphabetically across packs', async () => {
    const packA = makeFakePack('edges-a.pack', [
      {
        name: 'Zeal',
        uuid: 'u1',
        type: 'edge',
        system: { description: 'Zealous', requirements: [{ toString: () => 'Spirit d8+' }] },
      },
    ]);
    const packB = makeFakePack('edges-b.pack', [
      { name: 'Alertness', uuid: 'u2', type: 'edge', system: { description: 'Always alert' } },
    ]);

    installFoundryFakes({
      packs: [packA, packB],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([packA.collection, packB.collection]) },
    });

    const edges = await getEdges();
    expect(edges.map((e) => e.name)).toEqual(['Alertness', 'Zeal']);
    expect(edges.find((e) => e.name === 'Zeal').requirements).toEqual(['Spirit d8+']);
    expect(edges.find((e) => e.name === 'Alertness').requirements).toEqual([]);
  });

  it('skips a pack whose getDocuments() throws, instead of failing the whole fetch', async () => {
    const goodPack = makeFakePack('good-edges.pack', [{ name: 'Alertness', uuid: 'u1', type: 'edge' }]);
    const badPack = makeFakePack('bad-edges.pack', [{ name: 'Brave', uuid: 'u2', type: 'edge' }], { throwOnDocuments: true });

    installFoundryFakes({
      packs: [goodPack, badPack],
      settings: { [APPROVED_PACKS_SETTING_KEY]: JSON.stringify([goodPack.collection, badPack.collection]) },
    });

    const edges = await getEdges();
    expect(edges.map((e) => e.name)).toEqual(['Alertness']);
  });
});

describe('getItemPreview / getItemsByUuids', () => {
  it('resolves items via fromUuid, skipping invalid UUIDs', async () => {
    installFoundryFakes({ packs: [] });
    globalThis.__fakeUuidMap = new Map([
      ['uuid-1', { name: 'Found Item' }],
    ]);

    expect(await getItemPreview('uuid-1')).toEqual({ name: 'Found Item' });
    expect(await getItemPreview('missing-uuid')).toBeNull();

    const results = await getItemsByUuids(['uuid-1', 'missing-uuid']);
    expect(results).toEqual([{ name: 'Found Item', uuid: 'uuid-1' }]);
  });

  it('returns an empty array for non-array input', async () => {
    installFoundryFakes({ packs: [] });
    expect(await getItemsByUuids(null)).toEqual([]);
    expect(await getItemsByUuids([])).toEqual([]);
  });
});

describe('CATEGORY_ITEM_TYPES', () => {
  it('maps gear to all four physical item types', () => {
    expect(CATEGORY_ITEM_TYPES.gear).toEqual(['gear', 'weapon', 'armor', 'shield']);
  });
});
