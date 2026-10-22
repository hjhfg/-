import type Phaser from 'phaser';
import type { UnitCategory } from '../data/cards';

export type Team = 'player' | 'enemy';

export interface HexCell {
  q: number;
  r: number;
  x: number;
  y: number;
  isWater: boolean;
  owner: Team; // Controls grass (player) vs sand (enemy) territory coloring & score!
  hasGemDeposit: boolean;
  isRichDeposit: boolean; // Center contested mines yield +35% bonus gold!
  buildingId: string | null;
  rubbleUntil: number; // Timestamp until smoking rubble remains visible
  tileSprite?: Phaser.GameObjects.Image;
  gemSprite?: Phaser.GameObjects.Image;
  rubbleSprite?: Phaser.GameObjects.Image;
}

export interface BuildPin {
  key: string;
  q: number;
  r: number;
  x: number;
  y: number;
  cardId: string;
  cost: number;
  container?: Phaser.GameObjects.Container;
  pinBg?: Phaser.GameObjects.Image;
  costText?: Phaser.GameObjects.Text;
}

export interface BuildingEntity {
  id: string;
  team: Team;
  isCommandCenter: boolean;
  cardId: string;
  category: UnitCategory;
  q: number;
  r: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  attackInterval: number;
  attackTimer: number;
  spawnInterval: number;
  spawnTimer: number; // 0 .. spawnInterval
  goldPerCycle: number;
  isAllySubBase?: boolean; // Used in Co-op mode!
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  turretSprite?: Phaser.GameObjects.Image;
  progressArc: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
}

export interface UnitEntity {
  id: string;
  team: Team;
  cardId: string;
  category: UnitCategory;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  attackInterval: number;
  attackTimer: number;
  moveSpeed: number;
  splashRadius: number;
  isFlying: boolean;
  canHitAir: boolean;
  canHitGround: boolean;
  projectileType: string;
  dropProgress: number; // < 1.0 when parachuting down from transport plane!
  buffFrenzyUntil: number;
  buffShieldUntil: number;
  lastTrackDist: number;
  container: Phaser.GameObjects.Container;
  shadow?: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Image;
  turretSprite?: Phaser.GameObjects.Image;
  parachute?: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  auraRing?: Phaser.GameObjects.Graphics;
}

export interface ProjectileEntity {
  id: string;
  team: Team;
  attackerCardId: string;
  type: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetUnitId: string | null;
  targetBuildingId: string | null;
  speed: number;
  damage: number;
  splashRadius: number;
  sprite: Phaser.GameObjects.Image;
}

export interface LiveBattleHUDState {
  mode: 'pvp' | 'coop';
  timeRemainingSec: number;
  playerTiles: number;
  enemyTiles: number;
  playerPop: number;
  playerMaxPop: number;
  enemyPop: number;
  enemyMaxPop: number;
  playerGold: number;
  playerGoldPerSec: number;
  techLevel: number;
  techCost: number;
  paratrooperCd: number;
  paratrooperMaxCd: number;
  paratrooperTargeting: boolean;
  enemyParatrooperCd: number;
  commanderCd: number;
  commanderMaxCd: number;
  gameSpeed: 1 | 2;
  coopWave: number;
  coopMaxWave: number;
  playerUnitsSpawned: number;
  enemyUnitsKilled: number;
  buildingsBuilt: number;
  totalGoldMined: number;
}

export interface BattleEndSummary {
  won: boolean;
  reason: string;
  durationSec: number;
  playerTiles: number;
  enemyTiles: number;
  kills: number;
  buildingsBuilt: number;
  goldMined: number;
  mode: 'pvp' | 'coop';
}
