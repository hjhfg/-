import { ALL_CARD_IDS, CARDS, RARITY_META } from './cards';

export interface DeckPreset {
  name: string;
  units: [string, string, string, string]; // 4 offensive unit building cards
  defense: string; // 1 defense tower card
  mine: string; // 'gold_mine'
}

export interface ChestSlot {
  id: string;
  tier: 'bronze' | 'silver' | 'gold';
  title: string;
  durationText: string;
  skipGems: number;
}

export interface PlayerSaveData {
  playerName: string;
  trophies: number;
  diamonds: number;
  gold: number;
  wins: number;
  totalMatches: number;
  battlePassLv: number;
  battlePassXp: number;
  activeDeckIndex: number;
  selectedCommanderId: string;
  decks: DeckPreset[];
  cardLevels: Record<string, number>;
  cardShards: Record<string, number>;
  chests: (ChestSlot | null)[];
  soundEnabled: boolean;
  dailyShopClaimed: boolean;
}

const STORAGE_KEY = 'elite_legion_save_v1';

export function createDefaultSave(): PlayerSaveData {
  const cardLevels: Record<string, number> = {};
  const cardShards: Record<string, number> = {};

  for (const id of ALL_CARD_IDS) {
    cardLevels[id] = 8;
    cardShards[id] = 35;
  }
  // Fine-tune initial collection display to mirror authentic feel
  cardShards['rhino_tank'] = 42;
  cardShards['jet_fighter'] = 20;
  cardShards['apocalypse_tank'] = 18;
  cardShards['missile_car'] = 58;
  cardShards['heavy_gunner'] = 65;
  cardShards['jetpack_trooper'] = 24;
  cardShards['bunker'] = 116;
  cardShards['sam_tower'] = 48;
  cardShards['gold_mine'] = 3;

  return {
    playerName: '玩家7407713',
    trophies: 989,
    diamonds: 514,
    gold: 7770,
    wins: 16,
    totalMatches: 28, // 57% win rate!
    battlePassLv: 25,
    battlePassXp: 40,
    activeDeckIndex: 0,
    selectedCommanderId: 'mac',
    decks: [
      {
        name: '全能克制流',
        units: ['heavy_gunner', 'missile_car', 'jetpack_trooper', 'rhino_tank'],
        defense: 'bunker',
        mine: 'gold_mine',
      },
      {
        name: '王牌重装流',
        units: ['rhino_tank', 'jet_fighter', 'apocalypse_tank', 'missile_car'],
        defense: 'sam_tower',
        mine: 'gold_mine',
      },
      {
        name: '攻城推进流',
        units: ['assault_infantry', 'artillery_car', 'apocalypse_tank', 'missile_car'],
        defense: 'prism_tower',
        mine: 'gold_mine',
      },
      {
        name: '制空闪电战',
        units: ['jetpack_trooper', 'jet_fighter', 'heavy_gunner', 'missile_car'],
        defense: 'bunker',
        mine: 'gold_mine',
      },
      {
        name: '铁桶反击流',
        units: ['heavy_gunner', 'artillery_car', 'rhino_tank', 'jetpack_trooper'],
        defense: 'prism_tower',
        mine: 'gold_mine',
      },
    ],
    cardLevels,
    cardShards,
    chests: [
      { id: 'c1', tier: 'bronze', title: '高级青铜宝箱', durationText: '免费开启', skipGems: 0 },
      { id: 'c2', tier: 'silver', title: '精英白银宝箱', durationText: '免费开启', skipGems: 0 },
      { id: 'c3', tier: 'gold', title: '高级王者宝箱', durationText: '3小时10分', skipGems: 18 },
      null,
    ],
    soundEnabled: true,
    dailyShopClaimed: false,
  };
}

export class GameStore {
  public data: PlayerSaveData;
  private listeners: Array<() => void> = [];

  constructor() {
    this.data = this.load();
  }

  private load(): PlayerSaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw) as Partial<PlayerSaveData>;
      const def = createDefaultSave();
      return {
        ...def,
        ...parsed,
        cardLevels: { ...def.cardLevels, ...(parsed.cardLevels || {}) },
        cardShards: { ...def.cardShards, ...(parsed.cardShards || {}) },
        decks: parsed.decks && parsed.decks.length === 5 ? parsed.decks : def.decks,
        chests: parsed.chests && parsed.chests.length === 4 ? parsed.chests : def.chests,
      };
    } catch {
      return createDefaultSave();
    }
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota errors in private browsing
    }
    for (const fn of this.listeners) fn();
  }

  public onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  public getActiveDeck(): DeckPreset {
    return this.data.decks[this.data.activeDeckIndex] || this.data.decks[0];
  }

  /** Total combat power multiplier % (starts right around 225% like Screenshot 4!) */
  public getCombatPowerPct(): number {
    let totalLevels = 0;
    for (const id of ALL_CARD_IDS) {
      totalLevels += this.data.cardLevels[id] || 1;
    }
    // 12 cards * 8 = 96 -> 129 + 96 = 225%! Every card upgrade raises total power %!
    return 129 + totalLevels;
  }

  public getWinRatePct(): number {
    if (this.data.totalMatches <= 0) return 100;
    return Math.round((this.data.wins / this.data.totalMatches) * 100);
  }

  public getRankTitle(): { name: string; base: number; next: number } {
    const t = this.data.trophies;
    if (t < 400) return { name: '白银2阶', base: 0, next: 400 };
    if (t < 700) return { name: '黄金1阶', base: 400, next: 700 };
    if (t < 1200) return { name: '钻石1阶', base: 700, next: 1200 };
    if (t < 1600) return { name: '星耀统帅', base: 1200, next: 1600 };
    return { name: '传奇元帅', base: 1600, next: 2500 };
  }

  public getShardsNeeded(cardId: string): number {
    const card = CARDS[cardId];
    const lv = this.data.cardLevels[cardId] || 1;
    if (card.rarity === 'legendary') return Math.max(4, (lv - 6) * 2);
    if (card.rarity === 'epic') return Math.max(10, (lv - 5) * 10);
    return Math.max(20, (lv - 4) * 25);
  }

  public getUpgradeGoldCost(cardId: string): number {
    const card = CARDS[cardId];
    const lv = this.data.cardLevels[cardId] || 1;
    return RARITY_META[card.rarity].upgradeBaseCost + (lv - 7) * 250;
  }

  public canUpgradeCard(cardId: string): boolean {
    const shards = this.data.cardShards[cardId] || 0;
    const needed = this.getShardsNeeded(cardId);
    const goldCost = this.getUpgradeGoldCost(cardId);
    return shards >= needed && this.data.gold >= goldCost;
  }

  public upgradeCard(cardId: string): { ok: boolean; msg: string } {
    const needed = this.getShardsNeeded(cardId);
    const goldCost = this.getUpgradeGoldCost(cardId);
    if ((this.data.cardShards[cardId] || 0) < needed) {
      return { ok: false, msg: `卡牌碎片不足（还差 ${needed - (this.data.cardShards[cardId] || 0)} 碎片，可开宝箱获取！）` };
    }
    if (this.data.gold < goldCost) {
      return { ok: false, msg: `金币不足（需要 ${goldCost} 金币）` };
    }
    this.data.cardShards[cardId] -= needed;
    this.data.gold -= goldCost;
    this.data.cardLevels[cardId] = (this.data.cardLevels[cardId] || 1) + 1;
    this.save();
    return {
      ok: true,
      msg: `${CARDS[cardId].name} 升至 ${this.data.cardLevels[cardId]}级！全军战力提升至 ${this.getCombatPowerPct()}%！`,
    };
  }

  public equipCardToSlot(cardId: string, unitSlotIndex?: number): string {
    const card = CARDS[cardId];
    const deck = this.getActiveDeck();
    if (card.slotType === 'mine') {
      return '钻井金矿已固定装备在资源栏！';
    }
    if (card.slotType === 'defense') {
      deck.defense = cardId;
      this.save();
      return `已装备防御建筑【${card.name}】！`;
    }
    const existingIdx = deck.units.indexOf(cardId);
    if (existingIdx !== -1 && unitSlotIndex !== undefined) {
      const temp = deck.units[unitSlotIndex];
      deck.units[unitSlotIndex] = cardId;
      deck.units[existingIdx] = temp;
      this.save();
      return `已调整【${card.name}】槽位！`;
    }
    const targetIdx = unitSlotIndex !== undefined ? unitSlotIndex : 0;
    deck.units[targetIdx] = cardId;
    this.save();
    return `【${card.name}】已上阵至出战卡组！`;
  }

  public openChest(slotIndex: number): {
    ok: boolean;
    msg: string;
    rewards?: { gold: number; diamonds: number; cards: Array<{ id: string; count: number }> };
  } {
    const chest = this.data.chests[slotIndex];
    if (!chest) return { ok: false, msg: '该槽位暂无宝箱，打赢一场对战即可获得！' };
    if (chest.skipGems > 0 && this.data.diamonds < chest.skipGems) {
      return { ok: false, msg: `钻石不足（需要 ${chest.skipGems} 钻石加速开启）` };
    }
    if (chest.skipGems > 0) {
      this.data.diamonds -= chest.skipGems;
    }

    const mult = chest.tier === 'gold' ? 3 : chest.tier === 'silver' ? 1.8 : 1;
    const goldGain = Math.round((320 + Math.random() * 180) * mult);
    const gemGain = Math.round((12 + Math.random() * 14) * mult);
    const drawCount = chest.tier === 'gold' ? 4 : 3;

    const pool = [...ALL_CARD_IDS].sort(() => Math.random() - 0.5).slice(0, drawCount);
    const cards: Array<{ id: string; count: number }> = [];
    for (const cid of pool) {
      const rarity = CARDS[cid].rarity;
      const baseAmt = rarity === 'legendary' ? 2 : rarity === 'epic' ? 6 : 18;
      const count = Math.max(1, Math.round(baseAmt * mult));
      this.data.cardShards[cid] = (this.data.cardShards[cid] || 0) + count;
      cards.push({ id: cid, count });
    }

    this.data.gold += goldGain;
    this.data.diamonds += gemGain;
    this.data.chests[slotIndex] = null;
    this.save();
    return {
      ok: true,
      msg: '宝箱开启成功！',
      rewards: { gold: goldGain, diamonds: gemGain, cards },
    };
  }

  public recordBattleResult(won: boolean, mode: 'pvp' | 'coop'): {
    trophyDelta: number;
    goldEarned: number;
    gemEarned: number;
    addedChestTitle: string | null;
  } {
    this.data.totalMatches += 1;
    let trophyDelta = 0;
    let goldEarned = 120;
    let gemEarned = 5;
    let addedChestTitle: string | null = null;

    if (won) {
      this.data.wins += 1;
      trophyDelta = mode === 'coop' ? 22 : 32;
      goldEarned = mode === 'coop' ? 520 : 380;
      gemEarned = mode === 'coop' ? 25 : 15;
      this.data.battlePassXp += 65;
      while (this.data.battlePassXp >= 200) {
        this.data.battlePassXp -= 200;
        this.data.battlePassLv += 1;
        this.data.diamonds += 30;
      }

      const emptyIdx = this.data.chests.findIndex((c) => c === null);
      if (emptyIdx !== -1) {
        const isGold = Math.random() < 0.35 || mode === 'coop';
        const chest: ChestSlot = isGold
          ? {
              id: 'c_' + Date.now(),
              tier: 'gold',
              title: '高级王者宝箱',
              durationText: '免费开启',
              skipGems: 0,
            }
          : {
              id: 'c_' + Date.now(),
              tier: 'silver',
              title: '高级青铜宝箱',
              durationText: '免费开启',
              skipGems: 0,
            };
        this.data.chests[emptyIdx] = chest;
        addedChestTitle = chest.title;
      }
    } else {
      trophyDelta = mode === 'coop' ? 0 : -14;
      goldEarned = 95;
      gemEarned = 4;
      this.data.battlePassXp += 25;
    }

    this.data.trophies = Math.max(0, this.data.trophies + trophyDelta);
    this.data.gold += goldEarned;
    this.data.diamonds += gemEarned;
    this.save();

    return { trophyDelta, goldEarned, gemEarned, addedChestTitle };
  }
}

export const store = new GameStore();
