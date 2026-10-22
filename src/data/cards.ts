export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardSlotType = 'unit' | 'defense' | 'mine';
export type UnitCategory = 'infantry' | 'vehicle' | 'tank' | 'air' | 'bunker_def' | 'aa_def' | 'laser_def' | 'base' | 'mine';

export interface CardDef {
  id: string;
  name: string;
  shortName: string;
  buildingName: string;
  slotType: CardSlotType;
  category: UnitCategory;
  rarity: Rarity;
  cost: number; // Gold needed to unlock hex on battlefield
  spawnInterval: number; // Seconds per production cycle (or gold tick for mine)
  spawnCount: number; // Units spawned per cycle
  hp: number; // Base HP of spawned unit (at Lv.1; scaled by card level & power %)
  buildingHp: number; // Base HP of hex building
  atk: number; // Base damage per hit
  attackInterval: number; // Seconds between attacks
  range: number; // World pixel attack range (hex size ~42px)
  moveSpeed: number; // Pixels per second (0 for static buildings)
  splashRadius: number; // 0 if single-target
  isFlying: boolean;
  canHitAir: boolean;
  canHitGround: boolean;
  projectileType: 'bullet' | 'heavy_mg' | 'cannon' | 'artillery' | 'missile' | 'prism' | 'bomb' | 'none';
  countersText: string;
  counteredByText: string;
  description: string;
  counterCategories: UnitCategory[]; // Deals ~2.2x damage against these!
  softCounterCategories?: UnitCategory[]; // Deals ~1.65x damage against these
}

export const RARITY_META: Record<
  Rarity,
  { label: string; bgGrad: string; border: string; badgeBg: string; upgradeBaseCost: number }
> = {
  common: {
    label: '普通',
    bgGrad: 'linear-gradient(180deg, #32946f 0%, #1c5f46 100%)',
    border: '#5de2a5',
    badgeBg: '#27ae60',
    upgradeBaseCost: 400,
  },
  rare: {
    label: '稀有',
    bgGrad: 'linear-gradient(180deg, #3484e8 0%, #1b4c94 100%)',
    border: '#6ec1ff',
    badgeBg: '#2980b9',
    upgradeBaseCost: 600,
  },
  epic: {
    label: '史诗',
    bgGrad: 'linear-gradient(180deg, #9c52e8 0%, #582396 100%)',
    border: '#d38cff',
    badgeBg: '#8e44ad',
    upgradeBaseCost: 900,
  },
  legendary: {
    label: '传说',
    bgGrad: 'linear-gradient(180deg, #f0a92c 0%, #9e5c0c 100%)',
    border: '#ffe073',
    badgeBg: '#e67e22',
    upgradeBaseCost: 1200,
  },
};

export const CATEGORY_ICON: Record<UnitCategory, string> = {
  infantry: '🪖',
  vehicle: '🚙',
  tank: '🛡️',
  air: '✈️',
  bunker_def: '🏰',
  aa_def: '🚀',
  laser_def: '⚡',
  base: '🏛️',
  mine: '💎',
};

export const CARDS: Record<string, CardDef> = {
  // === RESOURCE CARD ===
  gold_mine: {
    id: 'gold_mine',
    name: '钻井金矿',
    shortName: '钻井金矿',
    buildingName: '矿石精炼井',
    slotType: 'mine',
    category: 'mine',
    rarity: 'legendary',
    cost: 50,
    spawnInterval: 2.4, // Produces gold every 2.4s
    spawnCount: 0,
    hp: 0,
    buildingHp: 460,
    atk: 4.3, // Base gold per tick (scales with level!)
    attackInterval: 2.4,
    range: 0,
    moveSpeed: 0,
    splashRadius: 0,
    isFlying: false,
    canHitAir: false,
    canHitGround: false,
    projectileType: 'none',
    countersText: '经济核心：持续高速产出局内金币',
    counteredByText: '无防卫能力，需防敌方空降伞兵偷矿！',
    description: '在钻石矿脉或资源点建造红警采矿钻井，每隔2.4秒自动产出大量金币。前期抢开双矿是暴兵制胜的关键！',
    counterCategories: [],
  },

  // === DEFENSE BUILDING CARDS ===
  bunker: {
    id: 'bunker',
    name: '机枪碉堡',
    shortName: '机枪碉堡',
    buildingName: '钢筋机枪碉堡',
    slotType: 'defense',
    category: 'bunker_def',
    rarity: 'common',
    cost: 50,
    spawnInterval: 0,
    spawnCount: 0,
    hp: 0,
    buildingHp: 780,
    atk: 19,
    attackInterval: 0.42,
    range: 145,
    moveSpeed: 0,
    splashRadius: 22,
    isFlying: false,
    canHitAir: false,
    canHitGround: true,
    projectileType: 'heavy_mg',
    countersText: '【强力克制】步兵系（重机枪兵/大兵/伞兵）225%伤害！',
    counteredByText: '被V3火炮车超远白嫖、被坦克强拆、无法对空',
    description: '经典红警混凝土地堡！密集交叉机枪火网令一切敌方步兵寸步难行，防伞兵偷家与人海冲锋的绝对铁壁。',
    counterCategories: ['infantry'],
  },

  sam_tower: {
    id: 'sam_tower',
    name: '防空导弹塔',
    shortName: '导弹塔',
    buildingName: '爱国者导弹井',
    slotType: 'defense',
    category: 'aa_def',
    rarity: 'rare',
    cost: 50,
    spawnInterval: 0,
    spawnCount: 0,
    hp: 0,
    buildingHp: 680,
    atk: 38,
    attackInterval: 0.95,
    range: 185,
    moveSpeed: 0,
    splashRadius: 20,
    isFlying: false,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'missile',
    countersText: '【强力克制】空军系（火箭飞行兵/黑鹰战机）225%伤害！',
    counteredByText: '攻速中等，害怕成群重机枪兵与坦克推进',
    description: '8联装防空导弹防御阵，超远射程锁定敌方飞行兵与轰炸战机，亦可发射制导导弹打击地面目标。',
    counterCategories: ['air'],
  },

  prism_tower: {
    id: 'prism_tower',
    name: '光棱防御塔',
    shortName: '光棱塔',
    buildingName: '盟军光棱塔',
    slotType: 'defense',
    category: 'laser_def',
    rarity: 'legendary',
    cost: 70,
    spawnInterval: 0,
    spawnCount: 0,
    hp: 0,
    buildingHp: 640,
    atk: 68,
    attackInterval: 1.45,
    range: 175,
    moveSpeed: 0,
    splashRadius: 0, // Chains via prism beam!
    isFlying: false,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'prism',
    countersText: '【强力克制】重装坦克与装甲车 190% 折射激光伤害！',
    counteredByText: '充能较慢，被突击步兵海与V3远程炮车克制',
    description: '盟军高科技光棱武器，发射高热折射光束贯穿重型坦克装甲，并自动弹射周围最多2名敌军！',
    counterCategories: ['tank', 'vehicle'],
  },

  // === COMBAT UNIT BUILDING CARDS ===
  heavy_gunner: {
    id: 'heavy_gunner',
    name: '重机枪兵',
    shortName: '重机枪兵',
    buildingName: '重装兵营',
    slotType: 'unit',
    category: 'infantry',
    rarity: 'rare',
    cost: 60,
    spawnInterval: 5.2,
    spawnCount: 2,
    hp: 135,
    buildingHp: 540,
    atk: 15,
    attackInterval: 0.45,
    range: 112,
    moveSpeed: 46,
    splashRadius: 0,
    isFlying: false,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'heavy_mg',
    countersText: '【核心克制】装甲车系（导弹车/火炮车）225%穿甲伤害！',
    counteredByText: '被【机枪碉堡】225%压制秒杀，惧怕主战坦克碾压',
    description: '身披防化铁甲的红警重机枪铁卫，手持穿甲加特林机枪，专克敌方导弹车与火炮车，亦可对空扫射！',
    counterCategories: ['vehicle'],
  },

  missile_car: {
    id: 'missile_car',
    name: '导弹车',
    shortName: '导弹车',
    buildingName: '装甲车工厂',
    slotType: 'unit',
    category: 'vehicle',
    rarity: 'rare',
    cost: 80,
    spawnInterval: 5.8,
    spawnCount: 1,
    hp: 250,
    buildingHp: 580,
    atk: 34,
    attackInterval: 0.95,
    range: 150,
    moveSpeed: 56,
    splashRadius: 18,
    isFlying: false,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'missile',
    countersText: '【核心克制】空军系（飞行兵/战机）225%防空伤害 + 拆建筑加成！',
    counteredByText: '被【重机枪兵】穿甲火力 225% 强力克制！',
    description: '高机动双联装多功能导弹战车，防空反制飞行兵与战机的王牌杀手，同时对敌方城墙建筑有良好输出。',
    counterCategories: ['air'],
    softCounterCategories: ['bunker_def', 'aa_def', 'laser_def'],
  },

  jetpack_trooper: {
    id: 'jetpack_trooper',
    name: '火箭飞行兵',
    shortName: '飞行兵',
    buildingName: '空降飞行营',
    slotType: 'unit',
    category: 'air',
    rarity: 'epic',
    cost: 80,
    spawnInterval: 5.8,
    spawnCount: 2,
    hp: 145,
    buildingHp: 540,
    atk: 26,
    attackInterval: 0.85,
    range: 120,
    moveSpeed: 64,
    splashRadius: 14,
    isFlying: true,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'missile',
    countersText: '【核心克制】坦克系（主战坦克/天启重坦）225%顶甲贯穿伤害！',
    counteredByText: '被【导弹车】与【防空导弹塔】225%集火击落！',
    description: '盟军王牌火箭飞行兵！直接飞越地形与前排阻挡，高空白嫖敌方主战坦克（陆战坦克无法对空反击）！',
    counterCategories: ['tank'],
  },

  rhino_tank: {
    id: 'rhino_tank',
    name: '主战坦克',
    shortName: '主战坦克',
    buildingName: '重型战车厂',
    slotType: 'unit',
    category: 'tank',
    rarity: 'rare',
    cost: 100,
    spawnInterval: 6.4,
    spawnCount: 1,
    hp: 460,
    buildingHp: 640,
    atk: 52,
    attackInterval: 1.25,
    range: 118,
    moveSpeed: 42,
    splashRadius: 20,
    isFlying: false,
    canHitAir: false,
    canHitGround: true,
    projectileType: 'cannon',
    countersText: '【核心克制】地面步兵 & 机枪碉堡 190% 炮击碾压伤害！',
    counteredByText: '无法对空！被【火箭飞行兵】与【黑鹰战机】空中白嫖克制！',
    description: '钢铁洪流中坚犀牛主战坦克！厚重前甲正面推进推平碉堡与步兵防线，但切记搭配导弹车防空护航！',
    counterCategories: ['bunker_def'],
    softCounterCategories: ['infantry', 'vehicle'],
  },

  assault_infantry: {
    id: 'assault_infantry',
    name: '突击大兵',
    shortName: '突击大兵',
    buildingName: '前线步兵营',
    slotType: 'unit',
    category: 'infantry',
    rarity: 'common',
    cost: 50,
    spawnInterval: 4.5,
    spawnCount: 3,
    hp: 95,
    buildingHp: 500,
    atk: 12,
    attackInterval: 0.55,
    range: 98,
    moveSpeed: 54,
    splashRadius: 0,
    isFlying: false,
    canHitAir: false,
    canHitGround: true,
    projectileType: 'bullet',
    countersText: '低费爆兵极快！克制充能光棱塔与攻城炮车，抢占格子神速！',
    counteredByText: '极其惧怕【机枪碉堡】扫射（受到225%克制伤害）！',
    description: '一次训练3名精英突击步兵，铺场涂色抢占地块速度第一，围剿敌方单点防御塔与脆皮炮车极具性价比。',
    counterCategories: ['laser_def'],
    softCounterCategories: ['vehicle'],
  },

  artillery_car: {
    id: 'artillery_car',
    name: '火炮战车',
    shortName: '火炮战车',
    buildingName: '攻城火炮厂',
    slotType: 'unit',
    category: 'vehicle',
    rarity: 'common',
    cost: 70,
    spawnInterval: 6.8,
    spawnCount: 1,
    hp: 195,
    buildingHp: 540,
    atk: 58,
    attackInterval: 1.75,
    range: 198, // Outranges bunkers & prism towers!
    moveSpeed: 38,
    splashRadius: 34,
    isFlying: false,
    canHitAir: false,
    canHitGround: true,
    projectileType: 'artillery',
    countersText: '【攻城利器】超远射程白嫖拆毁【机枪碉堡/光棱塔/基地】225%伤害！',
    counteredByText: '脆皮装甲车！被【重机枪兵】、空军、伞兵贴脸秒杀！',
    description: '超远程榴弹攻城战车，射程远超敌方碉堡与防御塔，专门轰碎敌方乌龟铁桶阵，需前排坦克保护。',
    counterCategories: ['bunker_def', 'aa_def', 'laser_def', 'base'],
  },

  apocalypse_tank: {
    id: 'apocalypse_tank',
    name: '天启重坦',
    shortName: '天启重坦',
    buildingName: '最高机密重工',
    slotType: 'unit',
    category: 'tank',
    rarity: 'epic',
    cost: 120,
    spawnInterval: 8.6,
    spawnCount: 1,
    hp: 760,
    buildingHp: 720,
    atk: 78,
    attackInterval: 1.45,
    range: 126,
    moveSpeed: 33,
    splashRadius: 26,
    isFlying: false,
    canHitAir: true, // Mammoth Tusk auxiliary AA missiles (reduced vs pure AA)
    canHitGround: true,
    projectileType: 'cannon',
    countersText: '【陆战霸主】双管重炮碾压一切地面坦克与防线（180%伤害）！',
    counteredByText: '造价高移速慢，仍惧怕成群【火箭飞行兵】与【黑鹰战机】集火！',
    description: '红警传奇双管天启重型坦克！拥有恐怖血量与双联重炮，兼备副武器防空飞弹，一旦成型平推敌军大本营！',
    counterCategories: ['bunker_def', 'vehicle'],
    softCounterCategories: ['tank', 'infantry'],
  },

  jet_fighter: {
    id: 'jet_fighter',
    name: '黑鹰战机',
    shortName: '黑鹰战机',
    buildingName: '空军指挥部',
    slotType: 'unit',
    category: 'air',
    rarity: 'epic',
    cost: 150,
    spawnInterval: 9.0,
    spawnCount: 1,
    hp: 340,
    buildingHp: 640,
    atk: 84,
    attackInterval: 1.55,
    range: 148,
    moveSpeed: 76,
    splashRadius: 34,
    isFlying: true,
    canHitAir: true,
    canHitGround: true,
    projectileType: 'bomb',
    countersText: '【制空霸主】精确航弹轰炸【坦克集群 & 基地建筑】215%伤害！',
    counteredByText: '被【导弹车】集群与【防空导弹塔】225%防空克制！',
    description: '超音速黑鹰轰炸战机，高速掠袭投掷重型航弹造成大范围爆炸伤害，是撕裂重坦阵线的终极空中王牌！',
    counterCategories: ['tank'],
    softCounterCategories: ['base', 'bunker_def'],
  },
};

export const ALL_CARD_IDS = Object.keys(CARDS);

export interface DamageCalcResult {
  multiplier: number;
  isHardCounter: boolean;
  isSoftCounter: boolean;
}

/**
 * Core Red Alert Counter System (兵种克制伤害计算)
 * Guarantees crystal-clear, impactful tactical rock-paper-scissors:
 * - 重机枪兵 -> 装甲车 (2.25x)
 * - 机枪碉堡 -> 步兵 (2.25x)
 * - 火箭飞行兵 / 黑鹰战机 -> 坦克 (2.25x / 2.15x)
 * - 导弹车 / 防空导弹塔 -> 空军 (2.25x)
 * - 火炮战车 / 主战坦克 -> 碉堡与防御塔 (2.25x / 1.9x)
 */
export function calculateCounterMultiplier(
  attackerCard: CardDef | null,
  targetCategory: UnitCategory
): DamageCalcResult {
  if (!attackerCard) {
    return { multiplier: 1.0, isHardCounter: false, isSoftCounter: false };
  }
  if (attackerCard.counterCategories.includes(targetCategory)) {
    return { multiplier: 2.25, isHardCounter: true, isSoftCounter: false };
  }
  if (attackerCard.softCounterCategories?.includes(targetCategory)) {
    return { multiplier: 1.65, isHardCounter: false, isSoftCounter: true };
  }
  // Apocalypse AA secondary weapon only deals 55% to air so dedicated AA still matters!
  if (attackerCard.id === 'apocalypse_tank' && targetCategory === 'air') {
    return { multiplier: 0.55, isHardCounter: false, isSoftCounter: false };
  }
  return { multiplier: 1.0, isHardCounter: false, isSoftCounter: false };
}

export interface CommanderDef {
  id: string;
  name: string;
  title: string;
  stars: number;
  cooldown: number;
  skillName: string;
  skillDesc: string;
  passiveDesc: string;
  themeColor: string;
}

export const COMMANDERS: CommanderDef[] = [
  {
    id: 'mac',
    name: '麦克将军',
    title: '盟军五星统帅',
    stars: 3,
    cooldown: 34,
    skillName: '狂暴集结',
    skillDesc: '全军进入红警狂暴状态8秒：攻速+42%、移速+35%，瞬间撕裂防线！',
    passiveDesc: '全军攻击力 +12%，伞兵冷却缩短 3 秒',
    themeColor: '#3498db',
  },
  {
    id: 'boris',
    name: '鲍里斯元帅',
    title: '苏军钢铁统帅',
    stars: 4,
    cooldown: 38,
    skillName: '基洛夫空袭',
    skillDesc: '呼叫米格/基洛夫编队对敌军最密集区域投下5枚重型高爆航弹！',
    passiveDesc: '基地与围墙生命值 +20%，坦克攻击 +10%',
    themeColor: '#e74c3c',
  },
  {
    id: 'natasha',
    name: '铁壁·娜塔莎',
    title: '超时空特战官',
    stars: 3,
    cooldown: 36,
    skillName: '铁幕护盾',
    skillDesc: '为前线全体友军单位与建筑披上红警铁幕护盾6.5秒，免伤70%并缓慢回血！',
    passiveDesc: '钻井金矿产金效率 +12%，步兵生命 +15%',
    themeColor: '#9b59b6',
  },
];

export interface OpponentProfile {
  name: string;
  avatarType: 'sam' | 'chopper' | 'tank' | 'commando' | 'tesla';
  trophiesOffset: number;
  powerPct: number;
  unitDeck: [string, string, string, string];
  defenseCard: string;
  style: 'balanced' | 'air_rush' | 'tank_push' | 'siege_turtle';
}

export const OPPONENT_PROFILES: OpponentProfile[] = [
  {
    name: '冰冻直升机',
    avatarType: 'sam',
    trophiesOffset: -180,
    powerPct: 162,
    unitDeck: ['missile_car', 'rhino_tank', 'heavy_gunner', 'jetpack_trooper'],
    defenseCard: 'sam_tower',
    style: 'balanced',
  },
  {
    name: '钢铁天启王',
    avatarType: 'tank',
    trophiesOffset: -45,
    powerPct: 188,
    unitDeck: ['rhino_tank', 'apocalypse_tank', 'artillery_car', 'heavy_gunner'],
    defenseCard: 'bunker',
    style: 'tank_push',
  },
  {
    name: '苍穹飞行团',
    avatarType: 'chopper',
    trophiesOffset: 25,
    powerPct: 198,
    unitDeck: ['jetpack_trooper', 'jet_fighter', 'missile_car', 'assault_infantry'],
    defenseCard: 'sam_tower',
    style: 'air_rush',
  },
  {
    name: '光棱守卫者',
    avatarType: 'tesla',
    trophiesOffset: 60,
    powerPct: 215,
    unitDeck: ['artillery_car', 'missile_car', 'apocalypse_tank', 'jetpack_trooper'],
    defenseCard: 'prism_tower',
    style: 'siege_turtle',
  },
];

export const MATCH_TIPS = [
  '升级金矿可以增加战斗中金币的产出！开局优先抢占钻石矿脉！',
  '兵种克制核心：重机枪兵克装甲车、机枪碉堡克步兵、火箭飞行兵克坦克！',
  '观察上方敌军解锁了什么兵营！针对性翻开克制兵种可轻松以少胜多！',
  '敌方后排金矿缺乏保护时，使用【召唤伞兵】空投奇袭可直接断敌经济！',
  '陆战犀牛坦克无法对空！遭遇敌方火箭飞行兵请立即建造导弹车或防空塔！',
  '【科技强化】可永久提升本局所有友军部队的攻击力与攻速，中后期收益极高！',
];
