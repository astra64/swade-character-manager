import { describe, it, expect } from 'vitest';
import {
  isFreeCoreSkill,
  calculatePaceModifier,
  calculateDerivedStats,
  calculateSkillCost,
  getSkillPointBreakdown,
  calculateTotalAttributePoints,
  getRemainingAttributePoints,
  calculateTotalHindrancePoints,
  getAvailablePerkPoints,
  generatePerkSlots,
  calculateAdvanceTypeCounts,
  calculateBonusEdgePointsFromAdvances,
  calculateBonusSkillPointsFromAdvances,
  getRankIndexFromAdvanceNumber,
  getCharacterRank,
  groupAdvancesByRank,
  getAttributeAdvanceWarning,
  calculateAncestryBonusEdgePoints,
  calculateGearCost,
  resolveGearFields,
  parseRichFundsMultipliers,
  calculateRichFundsMultiplier,
  calculateStartingFunds,
  calculateCarriedWeight,
  calculateMaxCarryCapacity,
  convertValueToDie,
  getAncestryAttributeBonuses,
  applyAncestryAttributeFloors,
  isUnderMinStrength,
} from '../scripts/lib/calculator.js';

describe('isFreeCoreSkill', () => {
  it('matches the 5 free core skills regardless of casing/spacing', () => {
    expect(isFreeCoreSkill('Common Knowledge')).toBe(true);
    expect(isFreeCoreSkill('common-knowledge')).toBe(true);
    expect(isFreeCoreSkill('Fighting')).toBe(false);
    expect(isFreeCoreSkill('')).toBe(false);
  });
});

describe('calculatePaceModifier', () => {
  it('sums system.pace changes across items, ignoring unrelated effects', () => {
    const items = [
      { effects: [{ changes: [{ key: 'system.pace', value: '1' }] }] },
      { effects: [{ changes: [{ key: 'system.pace.value', value: '-1' }, { key: 'system.toughness', value: '5' }] }] },
      { effects: [] },
      null,
    ];
    expect(calculatePaceModifier(items)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(calculatePaceModifier([])).toBe(0);
  });
});

describe('calculateDerivedStats', () => {
  it('derives Pace/Parry/Toughness from attributes and fighting skill', () => {
    const character = {
      attributes: { vigor: { die: 'd8' } },
      skills: { 'fighting-uuid': { die: 'd8', name: 'Fighting' } },
    };
    const stats = calculateDerivedStats(character, { armorBonus: 2, paceModifier: -1 });
    expect(stats.pace).toBe(5);
    expect(stats.parry).toBe(6); // floor(8/2) + 2
    expect(stats.toughness).toBe(8); // 2 + floor(8/2) + 2
  });

  it('defaults Parry to 2 when no fighting skill present', () => {
    const stats = calculateDerivedStats({ attributes: {}, skills: {} });
    expect(stats.parry).toBe(2);
    expect(stats.toughness).toBe(4); // 2 + floor(4/2)
  });
});

describe('calculateSkillCost', () => {
  it('is free for a core skill at d4', () => {
    expect(calculateSkillCost('Athletics', 'd4', 'd6')).toBe(0);
  });

  it('costs 1 to add a non-core skill at d4', () => {
    expect(calculateSkillCost('Boating', 'd4', 'd6')).toBe(1);
  });

  it('costs 1pt/step up to the linked attribute, 2pts/step above it', () => {
    // d4 -> d6 -> d8 (both <= attribute d8): 1 + 1, plus the 1pt to add a non-core skill
    expect(calculateSkillCost('Boating', 'd8', 'd8')).toBe(3);
    // d4 -> d6 (<=attribute) -> d8 (>attribute d6): 1 + 2, plus 1pt to add
    expect(calculateSkillCost('Boating', 'd8', 'd6')).toBe(4);
  });

  it('returns 0 when already at target die', () => {
    expect(calculateSkillCost('Boating', 'd6', 'd8', 'd6')).toBe(0);
  });
});

describe('getSkillPointBreakdown / calculateTotalSkillPoints', () => {
  it('excludes Unskilled Attempt and discounts ancestry-granted dice', () => {
    const character = {
      skills: {
        'unskilled-uuid': { die: 'd4', name: 'Unskilled Attempt' },
        'fighting-uuid': { die: 'd8', name: 'Fighting', fromAncestry: true, grantedDie: 'd6', attribute: 'strength' },
      },
      attributes: { strength: { die: 'd8' } },
    };
    const breakdown = getSkillPointBreakdown(character);
    expect(breakdown).toHaveLength(1);
    // Full d4->d8 cost (attribute d8) = 1+1+1pt-to-add = 3; granted-to-d6 cost = 1+1pt-to-add = 2; net = 1
    expect(breakdown[0].cost).toBe(1);
  });
});

describe('calculateTotalAttributePoints / getRemainingAttributePoints', () => {
  it('only charges for steps above the ancestry-granted floor', () => {
    const character = { attributes: { vigor: { die: 'd8' }, strength: { die: 'd6' } } };
    const bonuses = { vigor: { die: 'd6' } };
    // vigor: floor d6, value d8 -> 1 step = 1pt; strength: floor d4, value d6 -> 1 step = 1pt
    expect(calculateTotalAttributePoints(character, bonuses)).toBe(2);
    expect(getRemainingAttributePoints(character, bonuses)).toBe(3);
  });
});

describe('hindrance/perk budget', () => {
  it('caps available perk points at 4 even with bonus advances', () => {
    const character = { hindrances: { a: { points: 2 }, b: { points: 2 } } };
    expect(calculateTotalHindrancePoints(character)).toBe(4);
    expect(getAvailablePerkPoints(character, 3)).toBe(4);
  });

  it('generates perk slots sized to remaining points, 2pt options costing more when selected', () => {
    const character = {
      hindrances: { a: { points: 2 } },
      perkPointAllocations: [{ selected: 'edge' }],
    };
    const slots = generatePerkSlots(character);
    expect(slots).toHaveLength(1); // 1 slot consumes both points (edge = 2pt cost)
    expect(slots[0].selected).toBe('edge');
  });
});

describe('advancement counting and rank', () => {
  const character = {
    advances: [
      { type: 'edge' }, { type: 'edge' },
      { type: 'singleSkill' },
      { type: 'twoSkills' },
      { type: 'attribute', planned: true }, // excluded from counts
      { type: 'hindrance' },
    ],
  };

  it('counts advances by type, excluding planned ones', () => {
    expect(calculateAdvanceTypeCounts(character)).toEqual({
      edge: 2, singleSkill: 1, twoSkills: 1, attribute: 0, hindrance: 1,
    });
  });

  it('derives bonus points from advance counts', () => {
    expect(calculateBonusEdgePointsFromAdvances(character)).toBe(2);
    expect(calculateBonusSkillPointsFromAdvances(character)).toBe(4); // (1+1) * 2
  });

  it('bands advance number into rank tiers (Novice 1-3, Seasoned 4-7, ...)', () => {
    expect(getRankIndexFromAdvanceNumber(1)).toBe(0);
    expect(getRankIndexFromAdvanceNumber(3)).toBe(0);
    expect(getRankIndexFromAdvanceNumber(4)).toBe(1);
    expect(getRankIndexFromAdvanceNumber(7)).toBe(1);
    expect(getRankIndexFromAdvanceNumber(8)).toBe(2);
    expect(getRankIndexFromAdvanceNumber(16)).toBe(4);
  });

  it('derives current rank from total (non-planned) advance count', () => {
    // 5 non-planned advances -> Seasoned (band 4-7)
    expect(getCharacterRank(character)).toEqual({ index: 1, name: 'Seasoned' });
  });

  it('groups advances by rank tier, keeping original indices', () => {
    const groups = groupAdvancesByRank(character);
    expect(groups.map((g) => g.rankName)).toEqual(['Novice', 'Seasoned']);
    expect(groups[0].advances.map((a) => a.index)).toEqual([0, 1, 2]);
    expect(groups[1].advances.map((a) => a.index)).toEqual([3, 4, 5]);
  });

  it('warns only once Attribute advances exceed one per rank reached', () => {
    const overLeveled = { advances: [{ type: 'attribute' }, { type: 'attribute' }] };
    expect(getAttributeAdvanceWarning(overLeveled)).toMatch(/2 Attribute advances/);
    expect(getAttributeAdvanceWarning({ advances: [{ type: 'attribute' }] })).toBeNull();
  });
});

describe('calculateAncestryBonusEdgePoints', () => {
  it('matches configured ability names as whole words within prefixed item names', () => {
    const abilities = [{ name: 'Humans-Adaptable' }, { name: 'Humans-Unskilled' }];
    expect(calculateAncestryBonusEdgePoints(abilities, ['Adaptable'])).toBe(1);
    expect(calculateAncestryBonusEdgePoints(abilities, [])).toBe(0);
  });
});

describe('gear cost/weight', () => {
  it('sums price*quantity across gear entries', () => {
    const character = { gear: { a: { price: 10, quantity: 2 }, b: { price: 5 } } };
    expect(calculateGearCost(character)).toBe(25);
  });

  it('resolveGearFields prefers the compendium-shaped source over raw item data', () => {
    const resolved = resolveGearFields({ price: 50 }, { system: { price: 10, weight: 3 } });
    expect(resolved.price).toBe(50);
    expect(resolved.weight).toBe(3);
  });

  it('calculateCarriedWeight sums weight*quantity, rounded to 1 decimal', () => {
    const character = { gear: { a: { weight: 0.1, quantity: 3 } } };
    expect(calculateCarriedWeight(character)).toBe(0.3);
  });

  it('calculateMaxCarryCapacity matches SWADE formula and steps with encumbranceSteps', () => {
    const character = { attributes: { strength: { die: 'd6' } } };
    expect(calculateMaxCarryCapacity(character)).toBe(40); // (6/2-1)*20
    expect(calculateMaxCarryCapacity(character, { encumbranceSteps: 1 })).toBe(60); // d8 -> (8/2-1)*20
    expect(calculateMaxCarryCapacity(character, { weightUnit: 'metric' })).toBe(20); // (6/2-1)*10
  });

  it('isUnderMinStrength compares the character strength die to the item minimum', () => {
    expect(isUnderMinStrength({ attributes: { strength: { die: 'd4' } } }, 'd8')).toBe(true);
    expect(isUnderMinStrength({ attributes: { strength: { die: 'd8' } } }, 'd8')).toBe(false);
    expect(isUnderMinStrength({}, null)).toBe(false);
  });
});

describe('starting funds', () => {
  it('parses "Name:multiplier" pairs, defaulting bad multipliers to 1', () => {
    expect(parseRichFundsMultipliers('Rich:3,Filthy Rich:5')).toEqual([
      { name: 'Rich', multiplier: 3 },
      { name: 'Filthy Rich', multiplier: 5 },
    ]);
    expect(parseRichFundsMultipliers('')).toEqual([]);
  });

  it('applies the highest matching edge multiplier by name', () => {
    const character = { edges: { a: { name: 'Rich' } } };
    const multipliers = [{ name: 'Rich', multiplier: 3 }, { name: 'Filthy Rich', multiplier: 5 }];
    expect(calculateRichFundsMultiplier(character, multipliers)).toBe(3);
    expect(calculateRichFundsMultiplier({}, multipliers)).toBe(1);
  });

  it('combines rich multiplier with extra-funds perk bonus, unless manually overridden', () => {
    const character = {
      edges: { a: { name: 'Rich' } },
      perkPointAllocations: [{ selected: 'extra-funds' }],
    };
    const multipliers = [{ name: 'Rich', multiplier: 3 }];
    expect(calculateStartingFunds(character, { pcStartingCurrency: 500, richFundsMultipliers: multipliers }))
      .toBe(500 * 3 + 500 * 2);

    expect(calculateStartingFunds({ gearFundsOverride: '1000' }, { pcStartingCurrency: 500 })).toBe(1000);
  });
});

describe('convertValueToDie', () => {
  it('passes through valid die strings', () => {
    expect(convertValueToDie('d8')).toBe('d8');
  });

  it('treats a recognized absolute sides count as the matching die', () => {
    expect(convertValueToDie(8)).toBe('d8');
  });

  it('treats other positive numbers as a relative bonus added to d4', () => {
    expect(convertValueToDie(2)).toBe('d6');
  });

  it('returns null for unrecognized input', () => {
    expect(convertValueToDie('nonsense')).toBeNull();
    expect(convertValueToDie(-1)).toBeNull();
  });
});

describe('getAncestryAttributeBonuses', () => {
  it('reads ADD-mode die bonuses from the ancestry item and child items', () => {
    const ancestry = {
      effects: [{ changes: [{ key: 'system.attributes.vigor.die', value: 'd6', mode: 2 }] }],
    };
    const children = [
      { effects: [{ changes: [{ key: 'system.attributes.strength.die.sides', value: 8, mode: 5 }] }] },
    ];
    const bonuses = getAncestryAttributeBonuses(ancestry, children);
    expect(bonuses.vigor).toEqual({ die: 'd6', source: 'effect', mode: 2 });
    expect(bonuses.strength).toEqual({ die: 'd8', source: 'child-item', mode: 5 });
  });

  it('returns an empty map for no ancestry item', () => {
    expect(getAncestryAttributeBonuses(null)).toEqual({});
  });
});

describe('applyAncestryAttributeFloors', () => {
  it('adds an ADD-mode bonus on top of the raw die, tracked via _ancestryAddSides', () => {
    const character = { attributes: { vigor: { die: 'd4' } } };
    const bonuses = { vigor: { die: 'd6', mode: CONST.ACTIVE_EFFECT_MODES.ADD } };
    applyAncestryAttributeFloors(character, bonuses);
    expect(character.attributes.vigor.die).toBe('d6');
    expect(character.attributes.vigor._ancestryAddSides).toBe(2);
  });

  it('does not ratchet the die up on repeated renders with the same unchanged bonus', () => {
    // Note: this checks the observable result stays correct, not that the internal
    // `_ancestryAddSides`-tracked skip-guard is what's responsible — the subtract-then-add
    // math it guards is self-correcting either way, so this alone wouldn't catch that guard
    // being removed (confirmed via mutation testing). The guard exists to skip redundant
    // recomputation on a render where nothing changed, not for this result's correctness.
    const character = { attributes: { vigor: { die: 'd4' } } };
    const bonuses = { vigor: { die: 'd6', mode: CONST.ACTIVE_EFFECT_MODES.ADD } };
    applyAncestryAttributeFloors(character, bonuses);
    applyAncestryAttributeFloors(character, bonuses);
    applyAncestryAttributeFloors(character, bonuses);
    expect(character.attributes.vigor.die).toBe('d6');
  });

  it('treats a non-ADD-mode bonus as a floor, never lowering a player-raised value', () => {
    const character = { attributes: { vigor: { die: 'd10' } } };
    const bonuses = { vigor: { die: 'd6', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE } };
    applyAncestryAttributeFloors(character, bonuses);
    expect(character.attributes.vigor.die).toBe('d10');
  });
});
