// Shared config used by the browser app and the playbook script.

export const GAMES = {
  poe1: {
    label: 'Path of Exile 1',
    // poe.ninja exchange categories. Empty ones are hidden automatically.
    exchangeTypes: [
      'Currency', 'Fragment', 'Scarab', 'Essence', 'Fossil', 'Resonator', 'Oil',
      'DeliriumOrb', 'Omen', 'Tattoo', 'DivinationCard', 'Runegraft', 'Artifact',
      'AllflameEmber', 'Incubator', 'KalguuranRune', 'Thread', 'Viscera', 'SoulCore',
      'Astrolabe', 'Ducat', 'EnshroudingCrystal', 'Memory', 'DjinnCoin',
    ],
    // poe.ninja item (stash) categories, PoE1 only.
    itemTypes: [
      'SkillGem', 'ClusterJewel', 'BaseType', 'Beast', 'UniqueWeapon', 'UniqueArmour',
      'UniqueAccessory', 'UniqueJewel', 'UniqueFlask', 'Invitation', 'Wombgift',
      'ForbiddenJewel', 'UniqueTincture', 'UniqueRelic', 'ImbuedGem', 'ShrineBell', 'Coffin',
      'Map', 'BlightedMap', 'BlightRavagedMap', 'UniqueMap', 'ValdoMap', 'ScryingOrb', 'Temple', 'Vial',
    ],
    // Sidebar groups, laid out like poe.ninja. Types with no data in the league are hidden.
    groups: [
      ['General', ['Currency', 'Fragment', 'Thread', 'Viscera', 'Wombgift', 'Runegraft', 'AllflameEmber', 'Coffin', 'Tattoo', 'Omen', 'DjinnCoin', 'Ducat', 'EnshroudingCrystal', 'DivinationCard', 'Artifact', 'Oil', 'Incubator', 'KalguuranRune', 'SoulCore']],
      ['Equipment & Gems', ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'ForbiddenJewel', 'ShrineBell', 'UniqueTincture', 'UniqueRelic', 'SkillGem', 'ImbuedGem', 'ClusterJewel']],
      ['Atlas', ['Map', 'BlightedMap', 'BlightRavagedMap', 'UniqueMap', 'ValdoMap', 'DeliriumOrb', 'Invitation', 'Scarab', 'Astrolabe', 'Memory', 'Temple', 'ScryingOrb']],
      ['Crafting', ['BaseType', 'Fossil', 'Resonator', 'Beast', 'Essence', 'Vial']],
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
    groups: [
      ['General', ['Currency', 'Fragments', 'Runes', 'Essences', 'SoulCores', 'Idols']],
      ['League mechanics', ['Ritual', 'Breach', 'Delirium', 'Abyss', 'Expedition', 'Verisium']],
      ['Gems', ['UncutGems', 'LineageSupportGems']],
    ],
    units: ['exalted', 'chaos', 'divine'],
  },
};

export const TYPE_LABELS = {
  DeliriumOrb: 'Delirium Orbs', DivinationCard: 'Div Cards', AllflameEmber: 'Allflame Embers',
  KalguuranRune: 'Kalguuran Runes', SkillGem: 'Gems', ClusterJewel: 'Cluster Jewels',
  BaseType: 'Bases', UniqueWeapon: 'Unique Weapons', UniqueArmour: 'Unique Armour',
  UniqueAccessory: 'Unique Accessories', UniqueJewel: 'Unique Jewels', UniqueFlask: 'Unique Flasks',
  SoulCores: 'Soul Cores', SoulCore: 'Soul Cores', Fragment: 'Fragments', Scarab: 'Scarabs', Essence: 'Essences',
  Fossil: 'Fossils', Resonator: 'Resonators', Oil: 'Oils', Omen: 'Omens', Tattoo: 'Tattoos', Runegraft: 'Runegrafts',
  Artifact: 'Artifacts', Incubator: 'Incubators', Invitation: 'Invitations', Wombgift: 'Wombgifts', Beast: 'Beasts',
  Map: 'Maps', BlightedMap: 'Blighted Maps', BlightRavagedMap: 'Blight-ravaged Maps', UniqueMap: 'Unique Maps',
  ValdoMap: "Valdo's Maps", ScryingOrb: 'Scrying Orbs', Temple: 'Temples', Vial: 'Vials', Memory: 'Memories',
  Astrolabe: 'Astrolabes', Ducat: 'Ducats', EnshroudingCrystal: 'Enshrouding Crystals', DjinnCoin: 'Djinn Coins',
  ForbiddenJewel: 'Forbidden Jewels', UniqueTincture: 'Unique Tinctures', UniqueRelic: 'Unique Relics',
  ImbuedGem: 'Imbued Gems', ShrineBell: 'Shrine Bells', Coffin: 'Corpses', Viscera: 'Viscera', Thread: 'Threads', UncutGems: 'Uncut Gems', LineageSupportGems: 'Lineage Supports',
};

export const label = (t) => TYPE_LABELS[t] || t.replace(/([a-z])([A-Z])/g, '$1 $2');
