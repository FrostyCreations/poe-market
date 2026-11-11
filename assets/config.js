// Shared config used by the browser app and the playbook script.

export const GAMES = {
  poe1: {
    label: 'Path of Exile 1',
    // poe.ninja exchange categories. Empty ones are hidden automatically.
    exchangeTypes: [
      'Currency', 'Fragment', 'Scarab', 'Essence', 'Fossil', 'Resonator', 'Oil',
      'DeliriumOrb', 'Omen', 'Tattoo', 'DivinationCard', 'Runegraft', 'Artifact',
      'AllflameEmber', 'Incubator', 'KalguuranRune', 'Thread', 'Viscera', 'SoulCore',
    ],
    // poe.ninja item (stash) categories, PoE1 only.
    itemTypes: [
      'SkillGem', 'ClusterJewel', 'BaseType', 'Beast', 'UniqueWeapon', 'UniqueArmour',
      'UniqueAccessory', 'UniqueJewel', 'UniqueFlask', 'Invitation', 'Wombgift',
    ],
    units: ['chaos', 'divine'],
  },
  poe2: {
    label: 'Path of Exile 2',
    exchangeTypes: [
      'Currency', 'Fragments', 'Runes', 'Essences', 'Ritual', 'Breach', 'Delirium', 'Abyss',
      'SoulCores', 'Expedition', 'UncutGems', 'Idols', 'LineageSupportGems', 'Verisium',
    ],
    itemTypes: [],
    units: ['exalted', 'chaos', 'divine'],
  },
};

export const TYPE_LABELS = {
  DeliriumOrb: 'Delirium Orbs', DivinationCard: 'Div Cards', AllflameEmber: 'Allflame Embers',
  KalguuranRune: 'Kalguuran Runes', SkillGem: 'Gems', ClusterJewel: 'Cluster Jewels',
  BaseType: 'Bases', UniqueWeapon: 'Unique Weapons', UniqueArmour: 'Unique Armour',
  UniqueAccessory: 'Unique Accessories', UniqueJewel: 'Unique Jewels', UniqueFlask: 'Unique Flasks',
  SoulCores: 'Soul Cores', SoulCore: 'Soul Cores', Thread: 'Threads', UncutGems: 'Uncut Gems', LineageSupportGems: 'Lineage Supports',
};

export const label = (t) => TYPE_LABELS[t] || t.replace(/([a-z])([A-Z])/g, '$1 $2');
