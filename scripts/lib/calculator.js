/**
 * Character Calculator - Skill, edge, and advancement math
 *
 * Isolated utilities for stat calculations.
 * No UI dependencies. No compendium coupling.
 * Handles SWADE character creation and advancement mechanics.
 */

/**
 * Die type progression for attributes and skills in SWADE.
 * Maps die value to numeric level for calculations.
 */
const DIE_VALUES = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
};

/**
 * The 5 core skills that every character starts with at d4 for free.
 * These cannot be lowered below d4 and cost 0 until raised above d4.
 */
export const FREE_CORE_SKILLS = [
  'athletics',
  'common-knowledge',
  'notice',
  'persuasion',
  'stealth',
];

/**
 * Check if a skill is one of the 5 free core skills.
 * Accepts either display form ("Common Knowledge") or slug form ("common-knowledge").
 * @param {string} skillName - Skill name
 * @returns {boolean} True if skill is a free core skill
 */
export function isFreeCoreSkill(skillName) {
  if (!skillName) return false;
  const normalized = skillName.toLowerCase().trim().replace(/\s+/g, '-');
  return FREE_CORE_SKILLS.includes(normalized);
}

/** Base Pace for every SWADE character before edge/hindrance modifiers (e.g. Fleet-Footed, Slow). */
const BASE_PACE = 6;

/**
 * Sum any `system.pace` Active Effect changes found across a list of items (ancestry, its
 * granted child items, selected edges, selected hindrances). Same scanning pattern as
 * getAncestryAttributeBonuses, generalized to a flat numeric total rather than a per-attribute
 * map since Pace has no sub-fields to track.
 *
 * @param {Array} items - Full item documents (or plain objects with an `effects` collection)
 * @returns {number} Total Pace modifier (can be negative, e.g. Slow)
 */
export function calculatePaceModifier(items = []) {
  let modifier = 0;

  for (const item of items) {
    if (!item) continue;

    let effectsArray = [];
    if (Array.isArray(item.effects)) {
      effectsArray = item.effects;
    } else if (item.effects && typeof item.effects[Symbol.iterator] === 'function') {
      try {
        effectsArray = Array.from(item.effects);
      } catch (e) {
        // Continue if conversion fails
      }
    }

    for (const effect of effectsArray) {
      if (!Array.isArray(effect.changes)) continue;
      for (const change of effect.changes) {
        if (change.key === 'system.pace' || change.key === 'system.pace.value') {
          const value = Number(change.value);
          if (!Number.isNaN(value)) modifier += value;
        }
      }
    }
  }

  return modifier;
}

/**
 * Calculate derived stats from character attributes and skills.
 * Returns object with Pace, Parry, and Toughness (SWADE current edition).
 *
 * @param {Object} character - Character object with attributes and skills
 * @param {Object} [options]
 * @param {number} [options.armorBonus] - Toughness bonus from selected armor gear
 * @param {number} [options.paceModifier] - Net Pace modifier from ancestry/edges/hindrances
 * @returns {Object} Derived stats {pace, parry, toughness}
 */
export function calculateDerivedStats(character, { armorBonus = 0, paceModifier = 0 } = {}) {
  const stats = {};

  try {
    stats.pace = BASE_PACE + (paceModifier || 0);

    // Parry: Half fighting skill die + 2
    // Look for skill by name (case-insensitive, with or without dashes)
    let fightingSkill = null;
    if (character.skills) {
      for (const [skillName, skillData] of Object.entries(character.skills)) {
        if (skillName.toLowerCase() === 'fighting' || skillName.toLowerCase().includes('fighting')) {
          fightingSkill = skillData;
          break;
        }
      }
    }

    if (fightingSkill) {
      const dieValue = DIE_VALUES[fightingSkill.die] ?? 4;
      stats.parry = Math.floor(dieValue / 2) + 2;
    } else {
      stats.parry = 2; // Default if no fighting skill
    }

    // Toughness: Base 2 + armor bonus + half vigor die
    const vigorDie = character.attributes?.vigor?.die ?? "d4";
    const vigorValue = DIE_VALUES[vigorDie] ?? 4;
    const vigorBonus = Math.floor(vigorValue / 2);
    stats.toughness = 2 + vigorBonus + (armorBonus || 0);

  } catch (error) {
    console.warn("[Character Creation] Failed to calculate derived stats:", error);
  }

  return stats;
}

/**
 * Check if a character meets edge prerequisites.
 * 
 * NOTE: Full prerequisite checking (skill ranks, edge combinations, etc.)
 * is deferred to v0.6.2+ enhancement phase. 
 * This placeholder always returns true for v0.6.2 scope.
 * 
 * @param {Object} edge - Edge item object
 * @param {Object} character - Character object
 * @returns {boolean} True if character can take this edge
 */
export function validateEdgePrerequisites(edge, character) {
  // Placeholder: No prerequisite validation in v0.6.2 (deferred)
  // Future: Check requirements: {minRank, skills, edges, attributes, etc.}
  return true;
}

/**
 * Advancement tab — SWADE's real ADVANCE_TYPE enum values (from systems/swade/swade.js),
 * used when writing character.advances[] back to actor.system.advances.list. Kept as our
 * own string keys internally (easier to bind in templates/handlers) and mapped to/from this
 * enum only at the actor boundary (detection on open, save on write).
 */
export const ADVANCE_TYPE_ENUM = {
  edge: 0,
  singleSkill: 1,
  twoSkills: 2,
  attribute: 3,
  hindrance: 4,
};

export const ADVANCE_TYPE_ENUM_REVERSE = {
  0: 'edge',
  1: 'singleSkill',
  2: 'twoSkills',
  3: 'attribute',
  4: 'hindrance',
};

/** SWADE Rank tiers, in order — index = how many rank-ups have been reached. */
export const RANK_NAMES = ['Novice', 'Seasoned', 'Veteran', 'Heroic', 'Legendary'];

/**
 * Count character.advances[] entries by type. Advances are fungible within a type — there's
 * no per-advance target/ledger, just a count — so this is the sole input to every advancement
 * budget bonus below. Planned advances (SWADE's own "Planned" toggle, mirrored here) are
 * excluded — they're recorded but not yet taken, so they don't unlock budget yet, matching
 * SWADE's own `activeAdvances = list.filter(a => !a.planned)` derivation.
 *
 * @param {Object} character - Character object with an `advances` array
 * @returns {Object} {edge, singleSkill, twoSkills, attribute, hindrance}
 */
export function calculateAdvanceTypeCounts(character) {
  const counts = { edge: 0, singleSkill: 0, twoSkills: 0, attribute: 0, hindrance: 0 };
  for (const advance of character.advances || []) {
    if (advance?.planned) continue;
    if (advance?.type in counts) counts[advance.type] += 1;
  }
  return counts;
}

/** Each Edge-type advance grants 1 bonus edge point, same pool as hindrance/ancestry bonuses. */
export function calculateBonusEdgePointsFromAdvances(character) {
  return calculateAdvanceTypeCounts(character).edge;
}

/**
 * Each Two-Skills or One-Skill advance grants 2 bonus skill points — both types resolve to
 * the same value under this app's existing skill-cost formula (2 steps at/below the linked
 * attribute, or 1 step above it, both cost 2 total) — but are kept as distinct advance types
 * in the UI to mirror the rules as written.
 */
export function calculateBonusSkillPointsFromAdvances(character) {
  const counts = calculateAdvanceTypeCounts(character);
  return (counts.singleSkill + counts.twoSkills) * 2;
}

/** Each Attribute-type advance grants 1 bonus attribute point. */
export function calculateBonusAttributePointsFromAdvances(character) {
  return calculateAdvanceTypeCounts(character).attribute;
}

/**
 * Each Hindrance-buyoff advance grants 1 bonus perk-point slot — compensating for the fact
 * that removing a hindrance elsewhere reduces the Hindrances tab's live-derived perk-point
 * count (which isn't tied to any specific hindrance). Consumers (getAvailablePerkPoints/
 * generatePerkSlots) still cap the combined total at 4, so this only ever restores points
 * lost to a buyoff — it never pushes the character above the normal 4-point perk cap.
 */
export function calculateBonusPerkPointsFromAdvances(character) {
  return calculateAdvanceTypeCounts(character).hindrance;
}

/**
 * Total advances actually taken (all types, excluding planned) — this is what drives Rank in
 * SWADE (`advances.value`), regardless of which advance type each one was.
 */
export function calculateTotalAdvanceCount(character) {
  return (character.advances || []).filter((advance) => !advance?.planned).length;
}

/**
 * Derive a Rank tier index (0-4) from a 1-based advance number, matching SWADE's own
 * `getRankFromAdvance()` banding exactly (confirmed from systems/swade/swade.js): Novice
 * covers advances 1-3 (only 3, not 4 — SWADE's own `sort` field starts at 1, so the Novice
 * band is whatever's ≤3), then Seasoned 4-7, Veteran 8-11, Heroic 12-15, Legendary 16+.
 *
 * @param {number} advanceNumber - 1-based position (1st advance, 2nd advance, ...)
 * @returns {number} Rank tier index (0-4)
 */
export function getRankIndexFromAdvanceNumber(advanceNumber) {
  if (advanceNumber <= 3) return 0;
  if (advanceNumber <= 7) return 1;
  if (advanceNumber <= 11) return 2;
  if (advanceNumber <= 15) return 3;
  return 4;
}

/**
 * Derive the character's current Rank from total advance count, using the same banding as
 * SWADE's own advances.rank derivation (see getRankIndexFromAdvanceNumber).
 *
 * @param {Object} character - Character object with an `advances` array
 * @returns {{index: number, name: string}} Rank tier index (0-4) and display name
 */
export function getCharacterRank(character) {
  const count = calculateTotalAdvanceCount(character);
  const index = getRankIndexFromAdvanceNumber(count);
  return { index, name: RANK_NAMES[index] };
}

/**
 * Group character.advances[] by the Rank tier each was taken at, for the Advancement tab's
 * display — same per-advance-number banding as getRankIndexFromAdvanceNumber (Novice gets
 * only 3, then 4 apiece). Only tiers that actually contain an advance are returned (no empty
 * "Legendary" header on a 2-advance character), in Rank order, each advance keeping its
 * original array index (needed so edit/remove buttons still target the right entry in
 * character.advances). Planned advances are grouped by raw list position same as taken ones
 * (matching SWADE's own per-row Rank label, which uses raw `sort` regardless of `planned`) —
 * only the aggregate Rank/budget functions above exclude them.
 *
 * @param {Object} character - Character object with an `advances` array
 * @returns {Array<{rankIndex: number, rankName: string, advances: Array}>}
 */
export function groupAdvancesByRank(character) {
  const advances = character.advances || [];
  const groups = [];

  advances.forEach((advance, index) => {
    const rankIndex = getRankIndexFromAdvanceNumber(index + 1);
    let group = groups[groups.length - 1];
    if (!group || group.rankIndex !== rankIndex) {
      group = { rankIndex, rankName: RANK_NAMES[rankIndex], advances: [] };
      groups.push(group);
    }
    group.advances.push({ ...advance, index });
  });

  return groups;
}

/**
 * Informational-only check for the real "Attributes can only be raised once per Rank" rule.
 * Allowed count is approximated as (rank tier index + 1) — one Attribute advance per Rank
 * tier reached so far, including Novice. Never blocks Save; just returns a message to display,
 * or null if within the expected count.
 *
 * @param {Object} character - Character object with an `advances` array
 * @returns {string|null} Warning message, or null if not over the once-per-Rank guideline
 */
export function getAttributeAdvanceWarning(character) {
  const counts = calculateAdvanceTypeCounts(character);
  const rank = getCharacterRank(character);
  const allowed = rank.index + 1;
  if (counts.attribute <= allowed) return null;

  return `You've taken ${counts.attribute} Attribute advance${counts.attribute === 1 ? '' : 's'}, but Attributes can only be raised once per Rank.`;
}

/**
 * Get available skills filtered by linked attribute.
 * Used by character creation form to display appropriate skill options.
 * 
 * @param {Array} allSkills - Array of skill items from compendium
 * @param {string} [linkedAttribute] - Optional filter by linked attribute
 * @returns {Array} Filtered skills array
 */
export function filterSkillsByAttribute(allSkills, linkedAttribute = null) {
  if (!Array.isArray(allSkills)) return [];
  
  if (!linkedAttribute) return allSkills;
  
  // Placeholder: Filter by linked attribute if skill item stores this data
  // For now, return all (filtering via compendium metadata deferred)
  return allSkills;
}

/**
 * Calculate the point cost to increase a skill to a given die value.
 *
 * SWADE Creation Rules:
 * - Core skills (Athletics, Common Knowledge, Notice, Persuasion, Stealth) start free at d4
 * - Non-core skills cost 1 point to add at d4
 * - Cost to increase a skill: 1pt per die step up to linked attribute, 2pts per step above
 *
 * @param {string} skillName - Skill name (for checking if core skill)
 * @param {string} targetDie - Target die value (d4, d6, etc.)
 * @param {string} linkedAttributeDie - Linked attribute die value
 * @param {string} [currentSkillDie] - Current skill die (defaults to d4)
 * @returns {number} Total points needed to reach targetDie
 */
export function calculateSkillCost(skillName, targetDie, linkedAttributeDie, currentSkillDie = "d4") {
  const targetValue = DIE_VALUES[targetDie] ?? 4;
  const currentValue = DIE_VALUES[currentSkillDie] ?? 4;
  const attributeValue = DIE_VALUES[linkedAttributeDie] ?? 4;
  const isCore = isFreeCoreSkill(skillName);

  // Core skills free at d4 - only cost if raised above d4
  if (isCore && targetValue === 4) {
    return 0; // Free at d4
  }

  // Non-core skills cost 1 point to add at d4
  if (!isCore && targetValue === 4) {
    return 1; // Cost to add the skill
  }

  // If already at target value, no cost
  if (currentValue === targetValue) {
    return 0;
  }

  let totalCost = 0;

  // Non-core skills cost 1 point to add (when raising above d4)
  if (!isCore && currentValue === 4 && targetValue > 4) {
    totalCost += 1;
  }

  // Sum cost for each step from current to target
  let stepValue = currentValue;
  while (stepValue < targetValue) {
    const nextValue = stepValue + 2; // Each step is +2 on die values (d4→d6→d8, etc.)

    // Cost per step: 1pt if next die ≤ attribute, 2pts if next die > attribute
    const stepCost = nextValue <= attributeValue ? 1 : 2;
    totalCost += stepCost;

    stepValue = nextValue;
  }

  return totalCost;
}

/**
 * Build a per-skill breakdown of skill point cost, for both totaling and debugging.
 * Single source of truth for calculateTotalSkillPoints() below.
 *
 * @param {Object} character - Character object with skills
 * @param {Object} skillCompendiumData - Compendium data with skill metadata (for linked attributes)
 * @returns {Array} Array of {uuid, name, die, linkedAttrDie, isCore, fromAncestry, grantedDie, cost}
 */
export function getSkillPointBreakdown(character, skillCompendiumData = {}) {
  const breakdown = [];

  if (!character.skills || typeof character.skills !== 'object') {
    return breakdown;
  }

  for (const [skillUuid, skillData] of Object.entries(character.skills)) {
    if (!skillData.die) continue;

    // Find skill metadata to get linked attribute and name (character.skills entries
    // don't reliably carry their own name, so fall back to the compendium map, then to
    // whatever the skill's own item data recorded when it isn't in the compendium at all)
    const skillMeta = skillCompendiumData[skillUuid];
    const linkedAttribute = skillMeta?.linkedAttribute || skillData.attribute;
    const linkedAttrDie = linkedAttribute
      ? character.attributes?.[linkedAttribute]?.die
      : "d4";
    const skillName = skillData.name || skillMeta?.name || "";

    // Unskilled Attempt is a catch-all every actor has; it's never player-selected
    // or changed, so it never contributes to the skill point budget.
    if (skillName.toLowerCase() === 'unskilled attempt') continue;

    const isCore = isFreeCoreSkill(skillName);

    let cost;
    if (skillData.fromAncestry) {
      // Skills granted by ancestry are free up to their granted die tier only;
      // increases above that tier still cost points normally.
      const grantedDie = skillData.grantedDie || skillData.die;
      const costToGranted = calculateSkillCost(skillName, grantedDie, linkedAttrDie, "d4");
      const costToTarget = calculateSkillCost(skillName, skillData.die, linkedAttrDie, "d4");
      cost = Math.max(0, costToTarget - costToGranted);
    } else {
      cost = calculateSkillCost(skillName, skillData.die, linkedAttrDie, "d4");
    }

    breakdown.push({
      uuid: skillUuid,
      name: skillName || '(unknown skill name)',
      die: skillData.die,
      linkedAttrDie,
      isCore,
      fromAncestry: !!skillData.fromAncestry,
      grantedDie: skillData.grantedDie || null,
      cost,
    });
  }

  return breakdown;
}

/**
 * Calculate total skill points spent in character creation.
 *
 * @param {Object} character - Character object with skills
 * @param {Object} skillCompendiumData - Compendium data with skill metadata (for linked attributes)
 * @returns {number} Total points spent on skills
 */
export function calculateTotalSkillPoints(character, skillCompendiumData = {}) {
  return getSkillPointBreakdown(character, skillCompendiumData).reduce((sum, s) => sum + s.cost, 0);
}

/**
 * Calculate total attribute points spent.
 *
 * @param {Object} character - Character object with attributes
 * @param {Object} [ancestryBonuses] - Map of attrName to {die} from getAncestryAttributeBonuses.
 *   An ancestry-granted die is a free floor, not a purchase — steps up to that floor don't
 *   count against the player's budget, only steps raised beyond it.
 * @returns {number} Total points spent on attributes (each step above d4 = 1pt)
 */
export function calculateTotalAttributePoints(character, ancestryBonuses = {}) {
  let totalSpent = 0;

  if (!character.attributes || typeof character.attributes !== 'object') {
    return 0;
  }

  for (const [attrName, attrData] of Object.entries(character.attributes)) {
    const attrValue = DIE_VALUES[attrData.die] ?? 4;
    const floorValue = DIE_VALUES[ancestryBonuses?.[attrName]?.die] ?? 4;
    // Each step above the free floor costs 1 point (d6=1, d8=2, d10=3, d12=4 above d4).
    // Dice values increase by 2: d4(4), d6(6), d8(8), d10(10), d12(12)
    if (attrValue > floorValue) {
      const steps = (attrValue - floorValue) / 2;
      totalSpent += steps;
    }
  }

  return totalSpent;
}

const SIDES_TO_DIE = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' };

/**
 * Reconstruct each attribute's effective die from its ancestry-granted bonus (see
 * getAncestryAttributeBonuses), for an attribute value that was read from the actor's *source*
 * data (i.e. excludes every Active Effect, including the ancestry's own transfer effect and any
 * unrelated temporary condition like an injury) — see CharacterManager's initial character-state
 * load. Mutates and returns character.attributes in place.
 *
 * An ADD-mode bonus (e.g. an ancestry's own transfer effect adding +2 sides) is never present in
 * source at all — CharacterManager._attributesToUpdateData deliberately subtracts it back out
 * before saving, so the actor's own effect is the sole thing granting it and it doesn't get
 * double-applied. So for ADD-mode bonuses this *adds* the bonus back to reconstruct the effective
 * die the player actually sees in-game, rather than treating it as a floor.
 *
 * Called on every render, but adding the same bonus again on every call would ratchet the die up
 * indefinitely (die is the effective, already-bonused value from the render that follows) — this
 * is not idempotent the way a floor/minimum is, so each attribute's own `attrData` object tracks
 * how many sides it was last given credit for adding (`_ancestryAddSides`), and only adjusts when
 * that amount actually changes (first load, or the ancestry itself changed/was removed this
 * session), leaving an unrelated later render or the player's own die-button click untouched.
 *
 * OVERRIDE-mode (or any other/unrecognized-mode) bonuses aren't subtracted at save, so source
 * already reflects them if the player raised the attribute — for those this keeps the previous
 * floor/minimum behavior: raise up to the bonus only if the current value is below it, and never
 * lower a value the player explicitly picked above it.
 *
 * @param {Object} character - Character object with attributes
 * @param {Object} [ancestryBonuses] - Map of attrName to {die, mode} from getAncestryAttributeBonuses
 * @returns {Object} character.attributes, for convenience
 */
export function applyAncestryAttributeFloors(character, ancestryBonuses = {}) {
  if (!character.attributes || typeof character.attributes !== 'object') {
    return character.attributes;
  }

  for (const [attrName, attrData] of Object.entries(character.attributes)) {
    const bonus = ancestryBonuses?.[attrName];
    const prevAddedSides = attrData._ancestryAddSides || 0;
    const isAddMode = bonus?.die && bonus.mode === CONST.ACTIVE_EFFECT_MODES.ADD;
    const newAddedSides = isAddMode ? (DIE_VALUES[bonus.die] ?? 4) - 4 : 0;

    if (newAddedSides !== prevAddedSides) {
      // The ADD bonus just appeared, changed, or was removed (ancestry picked/swapped/cleared
      // this session) — strip whatever was previously credited before adding the new amount, so
      // this always starts from the true underlying (raw + manual) value.
      const rawSides = (DIE_VALUES[attrData.die] ?? 4) - prevAddedSides;
      const effectiveSides = Math.min(12, Math.max(4, rawSides + newAddedSides));
      attrData.die = SIDES_TO_DIE[effectiveSides] ?? attrData.die;
      attrData._ancestryAddSides = newAddedSides;
    }

    if (!isAddMode && bonus?.die && (DIE_VALUES[bonus.die] ?? 0) > (DIE_VALUES[attrData.die] ?? 4)) {
      attrData.die = bonus.die;
    }
  }

  return character.attributes;
}

/**
 * Get remaining attribute points for character creation.
 *
 * @param {Object} character - Character object
 * @param {Object} [ancestryBonuses] - See calculateTotalAttributePoints
 * @returns {number} Remaining points (0-5)
 */
export function getRemainingAttributePoints(character, ancestryBonuses = {}) {
  const spent = calculateTotalAttributePoints(character, ancestryBonuses);
  return Math.max(0, 5 - spent);
}

/**
 * Get remaining skill points for character creation.
 *
 * @param {Object} character - Character object
 * @param {Object} skillCompendiumData - Compendium data with skill metadata
 * @returns {number} Remaining points (0-12)
 */
export function getRemainingSkillPoints(character, skillCompendiumData = {}) {
  const spent = calculateTotalSkillPoints(character, skillCompendiumData);
  return Math.max(0, 12 - spent);
}

/**
 * Calculate total hindrance points spent.
 * Sums points from all selected hindrances (Major = 2pts, Minor = 1pt).
 *
 * @param {Object} character - Character object with hindrances
 * @returns {number} Total points spent on hindrances
 */
export function calculateTotalHindrancePoints(character) {
  let totalSpent = 0;

  if (!character.hindrances || typeof character.hindrances !== 'object') {
    return 0;
  }

  for (const [uuid, hindranceData] of Object.entries(character.hindrances)) {
    totalSpent += hindranceData.points ?? 0;
  }

  return totalSpent;
}

/**
 * Get remaining hindrance points for character creation.
 *
 * @param {Object} character - Character object
 * @returns {number} Remaining points (0-4)
 */
export function getRemainingHindrancePoints(character) {
  const spent = calculateTotalHindrancePoints(character);
  return Math.max(0, 4 - spent);
}

/**
 * Validate that total hindrance points do not exceed budget.
 *
 * @param {Object} character - Character object
 * @returns {boolean} True if valid (≤4 points)
 */
export function validateHindranceTotalPoints(character) {
  const spent = calculateTotalHindrancePoints(character);
  return spent <= 4;
}

/**
 * Get available perk points from hindrances, plus any bonus perk-point slots granted by
 * Hindrance-buyoff advances (see calculateBonusPerkPointsFromAdvances) — the bonus can bring
 * the total back up to the 4-point cap (compensating for a buyoff reducing hindrance points
 * below what a perk was already chosen against), but the combined total is still capped at 4
 * overall, same as hindrance points alone always were.
 *
 * @param {Object} character - Character object
 * @param {number} [bonusPerkPoints] - Extra perk-point slots from Hindrance-buyoff advances
 * @returns {number} Available perk points (0-4)
 */
export function getAvailablePerkPoints(character, bonusPerkPoints = 0) {
  const hindrancePoints = calculateTotalHindrancePoints(character);
  return Math.min(hindrancePoints + bonusPerkPoints, 4);
}

/**
 * Generate perk point allocation slots based on total hindrance points plus any bonus slots
 * from Hindrance-buyoff advances, capped at 4 overall (see getAvailablePerkPoints).
 *
 * @param {Object} character - Character object with hindrances and perkPointAllocations
 * @param {number} [bonusPerkPoints] - Extra perk-point slots from Hindrance-buyoff advances
 * @returns {Array} Array of slot objects: { pointValue, selected }
 */
export function generatePerkSlots(character, bonusPerkPoints = 0) {
  const hindrancePoints = calculateTotalHindrancePoints(character);
  const availablePerkPoints = Math.min(hindrancePoints + bonusPerkPoints, 4);
  const existingSlots = character.perkPointAllocations || [];
  const twoPointOptions = ['attribute-boost', 'edge'];

  const slots = [];
  let pointsRemaining = availablePerkPoints;

  while (pointsRemaining > 0) {
    const slotIndex = slots.length;
    const existingSlot = existingSlots[slotIndex];
    const selected = existingSlot?.selected || null;

    // Capacity offered to this slot's dropdown (up to 2) — not the same as how many points
    // its actual selection ends up costing, which is what determines how much is left over
    // for the next slot.
    const pointValue = Math.min(2, pointsRemaining);
    slots.push({ pointValue, selected, index: slotIndex });

    // An unselected slot's eventual cost is unknown, so provisionally assume it'll use its
    // full capacity (matches the initial "no selections yet" slot count) — this gets
    // recomputed correctly as soon as a choice is actually made, since `selected` then drives
    // the real consumption instead.
    const consumed = selected
      ? (twoPointOptions.includes(selected) ? 2 : 1)
      : pointValue;
    pointsRemaining -= consumed;
  }

  return slots;
}

/**
 * Get available edge points granted by hindrance perk allocations.
 * Each perk slot with "edge" selected grants 1 edge point.
 *
 * @param {Object} character - Character object with perkPointAllocations
 * @returns {number} Available edge points
 */
export function calculateAvailableEdgePoints(character) {
  const allocations = character.perkPointAllocations || [];
  return allocations.filter((a) => a?.selected === 'edge').length;
}

/**
 * Get bonus attribute points granted by hindrance perk allocations.
 * Each perk slot with "attribute-boost" selected grants 1 extra attribute point.
 *
 * @param {Object} character - Character object with perkPointAllocations
 * @returns {number} Bonus attribute points
 */
export function calculateBonusAttributePoints(character) {
  const allocations = character.perkPointAllocations || [];
  return allocations.filter((a) => a?.selected === 'attribute-boost').length;
}

/**
 * Get bonus skill points granted by hindrance perk allocations.
 * Each perk slot with "skill-point" selected grants 1 extra skill point.
 *
 * @param {Object} character - Character object with perkPointAllocations
 * @returns {number} Bonus skill points
 */
export function calculateBonusSkillPoints(character) {
  const allocations = character.perkPointAllocations || [];
  return allocations.filter((a) => a?.selected === 'skill-point').length;
}

/**
 * Bonus points from a manual choice the player made on an ancestral ability's card — for
 * abilities whose compendium entry carries no mechanical grants/effects of its own (e.g.
 * Half-Elf's Heritage: pick either a free Edge or a free Attribute point), so nothing else
 * in the app would otherwise apply either benefit. Uses the same option vocabulary as
 * hindrance perk-point allocations ('edge' / 'attribute-boost' / 'skill-point') for consistency,
 * keyed by the granting ability's own uuid so each ability contributes at most once.
 *
 * @param {Object} character - Character object with ancestryAbilityChoices
 * @returns {{edgePoints: number, attributePoints: number, skillPoints: number}}
 */
export function calculateAncestryChoiceBonuses(character) {
  const choices = Object.values(character.ancestryAbilityChoices || {});
  return {
    edgePoints: choices.filter((c) => c === 'edge').length,
    attributePoints: choices.filter((c) => c === 'attribute-boost').length,
    skillPoints: choices.filter((c) => c === 'skill-point').length,
  };
}

/**
 * Manual GM/player-entered budget adjustment for a single pool — an escape hatch for setting
 * rules or ancestral quirks this app has no built-in support for (see character.ancestry's
 * "Manual Adjustments" section). Purely additive on top of every other bonus source, and can
 * be negative. Stored per pool alongside a freeform note explaining why it's there.
 *
 * @param {Object} character - Character object with manualBudgetOverrides
 * @param {'attribute'|'skill'|'edge'|'perk'} pool
 * @returns {number}
 */
export function getManualBudgetOverrideAmount(character, pool) {
  const amount = Number(character.manualBudgetOverrides?.[pool]?.amount);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Count ancestral abilities that grant a free Edge at character creation (e.g. Humans'
 * "Adaptable"), matched by name rather than compendium-specific data. This is setting/
 * compendium-agnostic on purpose — the same ability name is reused across virtually every
 * SWADE setting book, and the configurable name list (world setting) covers the rest.
 *
 * @param {Array} ancestralAbilities - Granted child items from the selected ancestry
 * @param {Array<string>} bonusAbilityNames - Ability names (from settings) that grant a free Edge
 * @returns {number} Bonus edge points granted by ancestry
 */
export function calculateAncestryBonusEdgePoints(ancestralAbilities = [], bonusAbilityNames = []) {
  const normalizedNames = bonusAbilityNames
    .map((n) => n.toLowerCase().trim())
    .filter(Boolean);

  if (!normalizedNames.length || !Array.isArray(ancestralAbilities)) {
    return 0;
  }

  // Match as a whole word/segment rather than exact equality — ability items are commonly
  // named "<Ancestry>-<Ability>" (e.g. "Humans-Adaptable") to disambiguate in a flat
  // compendium list, so the configured name won't equal the full item name.
  return ancestralAbilities.filter((item) => {
    const itemName = (item?.name || '').toLowerCase().trim();
    if (!itemName) return false;
    return normalizedNames.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(itemName));
  }).length;
}

/**
 * Calculate how many edges the character has selected.
 *
 * @param {Object} character - Character object with edges
 * @returns {number} Number of selected edges
 */
export function calculateUsedEdgePoints(character) {
  if (!character.edges || typeof character.edges !== 'object') return 0;
  return Object.keys(character.edges).length;
}

/**
 * Check whether the character's current Strength is below an item's minimum Strength
 * requirement (weapons/armor). SWADE's actual penalty for being under minStr is a -1 die
 * step on the relevant roll, not "can't use it" — so this is informational only, matching
 * how edge prerequisites are shown (non-blocking hint), not a hard block on adding the item.
 *
 * @param {Object} character - Character object with attributes
 * @param {string|null} minStrDie - Item's minimum Strength die (e.g. "d8"), or null/falsy if none
 * @returns {boolean} True if the character's Strength die is below minStrDie
 */
export function isUnderMinStrength(character, minStrDie) {
  if (!minStrDie) return false;
  const strengthDie = character?.attributes?.strength?.die ?? 'd4';
  return (DIE_VALUES[strengthDie] ?? 4) < (DIE_VALUES[minStrDie] ?? 4);
}

/**
 * Calculate total gear cost (price × quantity, summed across all selected gear).
 *
 * @param {Object} character - Character object with gear
 * @returns {number} Total silver spent on gear
 */
export function calculateGearCost(character) {
  if (!character.gear || typeof character.gear !== 'object') return 0;

  return Object.values(character.gear).reduce((sum, item) => {
    const price = item.price ?? 0;
    const quantity = item.quantity ?? 1;
    return sum + price * quantity;
  }, 0);
}

/**
 * Resolve a gear item's price/minStr/armor/weight fields from two possible sources, one
 * shared fallback chain used everywhere a `character.gear[uuid]` entry gets built: a
 * "preferred" source (a compendium-list entry, already shaped with these fields) checked
 * first, falling back to a real Item document's raw `system` fields, then a hardcoded
 * default. Centralizing this avoids the fields drifting out of sync across the several call
 * sites that build gear entries (adding via dropdown, drag-drop, and detecting from an
 * existing actor).
 *
 * Known trade-off: when detecting from an existing actor, `preferred` (the compendium match)
 * wins over the actor's own stored value whenever a name match exists — so a GM-customized
 * price on an item that still name-matches a compendium entry (a discounted or marked-up
 * homebrew variant) gets silently overridden by the compendium's price here. This used to only
 * skew a display number; it now also feeds `character.gearCostAtOpen`, the baseline Gear
 * Management mode's currency debit/credit is computed against, so a customized price can throw
 * off that calculation too. Accepted for now, consistent with this tab's other "compendium is
 * a suggestion, not tracked per-instance" simplifications — flagging here since the stakes
 * changed once currency math started depending on it.
 *
 * @param {Object} [preferred] - A compendium-list-shaped object with price/minStr/armor/weight, or null
 * @param {Object} [itemData] - A real Item document (or preview) with a `system` object
 * @returns {{price: number, minStr: (string|null), armor: number, weight: number}}
 */
export function resolveGearFields(preferred, itemData) {
  return {
    price: preferred?.price ?? itemData?.system?.price ?? 0,
    minStr: preferred?.minStr ?? itemData?.system?.minStr ?? null,
    armor: preferred?.armor ?? itemData?.system?.armor ?? 0,
    weight: preferred?.weight ?? itemData?.system?.weight ?? 0,
  };
}

/**
 * Get the count of hindrance perk-allocation slots that chose "Extra Funds".
 * Each allocated point grants a bonus equal to twice the setting's starting currency.
 *
 * @param {Object} character - Character object with perkPointAllocations
 * @returns {number} Count of "Extra Funds" perk allocations
 */
export function calculateExtraFundsBonusCount(character) {
  const allocations = character.perkPointAllocations || [];
  return allocations.filter((a) => a?.selected === 'extra-funds').length;
}

/**
 * Parse the `richFundsMultipliers` world setting ("Rich:3,Filthy Rich:5") into a lookup array.
 *
 * @param {string} settingValue - Comma-separated "Name:multiplier" pairs
 * @returns {Array<{name: string, multiplier: number}>}
 */
export function parseRichFundsMultipliers(settingValue) {
  if (!settingValue) return [];
  return settingValue
    .split(',')
    .map((pair) => {
      const [name, multiplier] = pair.split(':').map((s) => s?.trim());
      return { name, multiplier: Number(multiplier) || 1 };
    })
    .filter((entry) => entry.name);
}

/**
 * Determine the starting-funds multiplier granted by a Rich/Filthy Rich-type edge, matched
 * by name against the `richFundsMultipliers` setting (same name-matching pattern as
 * `calculateAncestryBonusEdgePoints`). Highest matching multiplier wins if more than one matches.
 *
 * @param {Object} character - Character object with edges
 * @param {Array<{name: string, multiplier: number}>} richFundsMultipliers - Parsed setting entries
 * @returns {number} Multiplier (1 if no matching edge selected)
 */
export function calculateRichFundsMultiplier(character, richFundsMultipliers = []) {
  if (!character.edges || typeof character.edges !== 'object' || !richFundsMultipliers.length) {
    return 1;
  }

  const edgeNames = Object.values(character.edges).map((e) => (e?.name || '').toLowerCase().trim());

  let multiplier = 1;
  for (const entry of richFundsMultipliers) {
    const normalized = entry.name.toLowerCase().trim();
    if (edgeNames.some((n) => n === normalized)) {
      multiplier = Math.max(multiplier, entry.multiplier);
    }
  }
  return multiplier;
}

/**
 * Calculate the Gear tab's starting-funds budget: `(pcStartingCurrency × richMultiplier) +
 * extraFundsBonus`, or the GM's manual override when set. There is no general "everyone gets
 * doubled starting funds" rule — the only multipliers are a matched Rich/Filthy Rich-type edge
 * and the Hindrances tab's Extra Funds perk allocation (each worth `pcStartingCurrency × 2`).
 *
 * @param {Object} character - Character object with edges, perkPointAllocations, gearFundsOverride
 * @param {Object} options
 * @param {number} options.pcStartingCurrency - SWADE's `pcStartingCurrency` world setting
 * @param {Array<{name: string, multiplier: number}>} [options.richFundsMultipliers] - Parsed setting entries
 * @returns {number} Starting funds budget
 */
export function calculateStartingFunds(character, { pcStartingCurrency = 0, richFundsMultipliers = [] } = {}) {
  const override = character.gearFundsOverride;
  if (override !== null && override !== undefined && override !== '') {
    const overrideValue = Number(override);
    if (!Number.isNaN(overrideValue)) return overrideValue;
  }

  const richMultiplier = calculateRichFundsMultiplier(character, richFundsMultipliers);
  const extraFundsBonus = calculateExtraFundsBonusCount(character) * (pcStartingCurrency * 2);
  return (pcStartingCurrency * richMultiplier) + extraFundsBonus;
}

/**
 * Total weight currently carried on the Gear tab (selected gear, weapons, armor & shields).
 *
 * Known approximation vs. SWADE's own `Actor.calcInventoryWeight()`: that method also counts
 * Consumable-type items and excludes anything with `equipStatus === STORED` (backpacked, not
 * carried). This tool has no Consumable support (no compendium pack, drag-drop rejects the
 * type) and no equip-status concept, so this total can both under-count (missing consumables)
 * and over-count (counting stored gear) relative to what the actor's real sheet would show.
 * Acceptable for an informational-only tool, but worth knowing if the two numbers disagree.
 *
 * @param {Object} character - Character object with gear
 * @returns {number} Total weight
 */
export function calculateCarriedWeight(character) {
  if (!character.gear || typeof character.gear !== 'object') return 0;

  const total = Object.values(character.gear).reduce((sum, item) => {
    const weight = Number(item.weight) || 0;
    const quantity = Number(item.quantity) || 1;
    return sum + weight * quantity;
  }, 0);

  // Round to one decimal to avoid floating-point noise (e.g. 0.1 + 0.2 items) in the display.
  return Math.round(total * 10) / 10;
}

/**
 * Maximum carry capacity, mirroring SWADE's own `Actor.calcMaxCarryCapacity()`:
 * `(strength die sides / 2 - 1) × 20` (imperial, lbs) or `× 10` (metric, kg), stepped up by
 * any `encumbranceSteps` the actor already has from Active Effects (e.g. Packrat, racial
 * size). Does not model SWADE's above-d12 modifier-instead-of-a-bigger-die rule — this tool
 * never tracks a die modifier for attributes, only the die itself, so a character advanced
 * past d12 Strength is simply treated as capped at d12 here (an accepted approximation, same
 * spirit as other informational-only derived stats in this tool).
 *
 * @param {Object} character - Character object with attributes.strength.die
 * @param {Object} options
 * @param {string} [options.weightUnit] - SWADE's `weightUnit` world setting ('imperial' or 'metric')
 * @param {number} [options.encumbranceSteps] - The actor's current Strength encumbranceSteps
 * @returns {number} Max carry capacity
 */
export function calculateMaxCarryCapacity(character, { weightUnit = 'imperial', encumbranceSteps = 0 } = {}) {
  const dieSides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
  const baseSides = dieSides[character?.attributes?.strength?.die] || 4;
  const steppedSides = Math.min(baseSides + Math.max(encumbranceSteps, 0) * 2, 12);
  const multiplier = weightUnit === 'metric' ? 10 : 20;
  return Math.max((steppedSides / 2 - 1) * multiplier, 0);
}

/**
 * Convert a value to a die notation string.
 * Handles string format ("d6"), numeric absolute sides (4, 6, 8, etc.),
 * and numeric relative modifiers (+2 sides to add to base d4).
 *
 * @param {string|number} value - Value to convert
 * @returns {string|null} Die notation like "d4", "d6", etc., or null if invalid
 */
export function convertValueToDie(value) {
  const sidesToDie = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' };

  if (typeof value === 'string' && value.match(/^d\d+$/)) {
    return value;
  }

  if (typeof value === 'number') {
    // Check if this looks like an absolute value (4, 6, 8, 10, 12)
    if ([4, 6, 8, 10, 12].includes(value)) {
      return sidesToDie[value];
    }
    // Relative modifier - add to base d4 (4 sides)
    if (value > 0 && value < 12) {
      const resultSides = 4 + value;
      return sidesToDie[resultSides] || null;
    }
  }

  return null;
}

/**
 * Extract attribute bonuses from an ancestry item and its child items.
 * Looks for bonuses in effects on both the ancestry and granted items.
 *
 * @param {Object} ancestryItem - Ancestry item object
 * @param {Array} [childItems] - Optional array of child items (ancestral abilities) with effects
 * @returns {Object} Map of attribute names to bonus information {vigor: {die: 'd6', source, mode}, etc.}
 *   `mode` is the source Active Effect's change mode (CONST.ACTIVE_EFFECT_MODES) when the bonus
 *   came from an 'effect'/'child-item' source — needed at save time to avoid double-applying an
 *   ADD-mode effect (see CharacterManager._attributesToUpdateData).
 */
export function getAncestryAttributeBonuses(ancestryItem, childItems = []) {
  const bonuses = {};

  if (!ancestryItem) {
    return bonuses;
  }

  try {
    // Check for bonuses in effects on the ancestry item itself
    if (ancestryItem.effects && Array.isArray(ancestryItem.effects)) {
      for (const effect of ancestryItem.effects) {
        if (effect.changes && Array.isArray(effect.changes)) {
          for (const change of effect.changes) {
            const match = change.key?.match(/system\.attributes\.(\w+)\.die(?:\.sides)?/);
            if (match) {
              const attrName = match[1].toLowerCase();
              const bonusDie = convertValueToDie(change.value);
              if (bonusDie) {
                bonuses[attrName] = { die: bonusDie, source: 'effect', mode: change.mode };
              }
            }
          }
        }
      }
    }

    // Check for bonuses in child items (ancestral abilities, etc.)
    if (childItems && Array.isArray(childItems)) {
      for (const item of childItems) {
        // Handle both Array and EmbeddedCollection
        let effectsArray = [];
        if (item.effects) {
          if (Array.isArray(item.effects)) {
            effectsArray = item.effects;
          } else if (item.effects instanceof Map || item.effects[Symbol.iterator]) {
            try {
              effectsArray = Array.from(item.effects);
            } catch (e) {
              // Continue if conversion fails
            }
          }
        }

        for (const effect of effectsArray) {
          if (effect.changes && Array.isArray(effect.changes)) {
            for (const change of effect.changes) {
              const match = change.key?.match(/system\.attributes\.(\w+)\.die(?:\.sides)?/);
              if (match) {
                const attrName = match[1].toLowerCase();
                const bonusDie = convertValueToDie(change.value);

                // Only set bonus if not already set by ancestry effect
                if (bonusDie && !bonuses[attrName]) {
                  bonuses[attrName] = { die: bonusDie, source: 'child-item', mode: change.mode };
                }
              }
            }
          }
        }
      }
    }

    // Check for bonuses in child items embedded on ancestry item
    if (ancestryItem.items && Array.isArray(ancestryItem.items)) {
      for (const item of ancestryItem.items) {
        if (item.type === 'modification' || item.system?.category === 'attribute-bonus') {
          const attrName = item.system?.linkedAttribute?.toLowerCase() || item.name?.toLowerCase();
          const dieBonusValue = item.system?.dieBonusValue;
          if (attrName && dieBonusValue && !bonuses[attrName]) {
            bonuses[attrName] = { die: dieBonusValue, source: 'embedded-item' };
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Calculator] Failed to extract ancestry bonuses:', error);
  }

  return bonuses;
}

