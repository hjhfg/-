import Phaser from 'phaser';
import {
  CARDS,
  COMMANDERS,
  OPPONENT_PROFILES,
  calculateCounterMultiplier,
  type CardDef,
  type OpponentProfile,
  type UnitCategory,
} from '../../data/cards';
import { TEX_SCALE } from '../../art/RedAlertArt';
import { store } from '../../data/storage';
import { sound } from '../../audio/SoundManager';
import { AIController } from '../AIController';
import type {
  BattleEndSummary,
  BuildingEntity,
  BuildPin,
  HexCell,
  LiveBattleHUDState,
  ProjectileEntity,
  Team,
  UnitEntity,
} from '../BattleTypes';
import {
  GRID_COLS,
  GRID_ROWS,
  HEX_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getHexNeighbors,
  getHexVertices,
  hexDistance,
  hexKey,
  hexToWorld,
  isValidGridHex,
  worldToHex,
} from '../HexMath';

export interface StartMatchConfig {
  mode: 'pvp' | 'coop';
  opponent: OpponentProfile;
  onHudUpdate: (hud: LiveBattleHUDState) => void;
  onPinInspect: (cardId: string, cost: number, level: number, screenX: number, screenY: number) => void;
  onToast: (msg: string, tone?: 'info' | 'warn' | 'good') => void;
  onBattleEnd: (summary: BattleEndSummary) => void;
}

const MATCH_DURATION_SEC = 240; // 04:00 exact match clock like Screenshot 6!
const MAX_POPULATION = 50;

export class BattleScene extends Phaser.Scene {
  private isIdleBackdrop = true;
  private isPaused = false;
  private matchEnded = false;
  private gameSpeed: 1 | 2 = 1;
  private configData: StartMatchConfig | null = null;

  // Containers & Layers (Strict bottom-to-top z-order!)
  private oceanBg!: Phaser.GameObjects.Graphics;
  private terrainLayer!: Phaser.GameObjects.Container;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private pinLayer!: Phaser.GameObjects.Container;
  private buildingLayer!: Phaser.GameObjects.Container;
  private groundUnitLayer!: Phaser.GameObjects.Container;
  private effectGraphics!: Phaser.GameObjects.Graphics;
  private projectileLayer!: Phaser.GameObjects.Container;
  private airUnitLayer!: Phaser.GameObjects.Container;
  private floatTextLayer!: Phaser.GameObjects.Container;
  private targetOverlayGraphics!: Phaser.GameObjects.Graphics;

  // Minimap (Screen-space fixed container on right edge)
  private minimapGraphics!: Phaser.GameObjects.Graphics;

  // State collections
  private cells = new Map<string, HexCell>();
  private buildings = new Map<string, BuildingEntity>();
  private units = new Map<string, UnitEntity>();
  private projectiles: ProjectileEntity[] = [];
  private playerPins = new Map<string, BuildPin>();
  private enemyPins = new Map<string, BuildPin>();
  private prismBeams: Array<{ x1: number; y1: number; x2: number; y2: number; alpha: number; color: number }> = [];
  private treadMarks: Array<{ x: number; y: number; angle: number; alpha: number }> = [];

  // Economy, Timers & Progression
  private matchSeed = 1001;
  private elapsedSec = 0;
  private timeRemainingSec = MATCH_DURATION_SEC;
  private playerGold = 55;
  private enemyGold = 55;
  private baseGoldAccum = 0;
  private playerTechLevel = 1;
  private enemyTechLevel = 1;
  private paratrooperCd = 18; // Ready quickly so player enjoys airdrops early!
  private paratrooperMaxCd = 30;
  private paratrooperTargeting = false;
  private enemyParatrooperCd = 31; // Exact 31s top-right badge like Screenshot 6!
  private commanderCd = 10;
  private commanderMaxCd = 34;

  // Co-op wave tracking
  private coopWave = 1;
  private readonly coopMaxWave = 6;
  private nextCoopWaveSec = 18;
  private nextAllyBuildSec = 4;

  // Match stats
  private idCounter = 1;
  private playerUnitsSpawned = 0;
  private enemyUnitsKilled = 0;
  private buildingsBuilt = 0;
  private totalGoldMined = 0;
  private hudSyncAccum = 0;

  // Camera drag & pinch state
  private isDragging = false;
  private dragMovedDist = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartScrollX = 0;
  private camStartScrollY = 0;
  private initialPinchDist = 0;
  private initialPinchZoom = 1;

  private aiController = new AIController();

  constructor() {
    super({ key: 'BattleScene' });
  }

  public init(data?: { idleBackdrop?: boolean; matchConfig?: StartMatchConfig }): void {
    this.isIdleBackdrop = Boolean(data?.idleBackdrop);
    if (data?.matchConfig) {
      this.configData = data.matchConfig;
      this.isIdleBackdrop = false;
    }
  }

  public create(): void {
    this.input.addPointer(2); // Enable multi-touch pinch zoom on mobile!

    this.oceanBg = this.add.graphics().setDepth(0);
    this.terrainLayer = this.add.container(0, 0).setDepth(2);
    this.trackGraphics = this.add.graphics().setDepth(4);
    this.wallGraphics = this.add.graphics().setDepth(6);
    this.pinLayer = this.add.container(0, 0).setDepth(8);
    this.buildingLayer = this.add.container(0, 0).setDepth(10);
    this.groundUnitLayer = this.add.container(0, 0).setDepth(14);
    this.effectGraphics = this.add.graphics().setDepth(18);
    this.projectileLayer = this.add.container(0, 0).setDepth(20);
    this.airUnitLayer = this.add.container(0, 0).setDepth(24);
    this.targetOverlayGraphics = this.add.graphics().setDepth(27);
    this.floatTextLayer = this.add.container(0, 0).setDepth(30);

    // Screen-fixed minimap strip on right edge during active battle
    this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(50);

    this.setupCameraAndInput();
    this.resetAndBuildBattlefield();

    this.scale.on('resize', this.handleResize, this);
  }

  private handleResize(): void {
    if (!this.cameras || !this.cameras.main) return;
    this.fitCameraBounds(false);
  }

  public startNewMatch(cfg: StartMatchConfig): void {
    this.configData = cfg;
    this.isIdleBackdrop = false;
    this.isPaused = false;
    this.gameSpeed = 1;
    this.resetAndBuildBattlefield();
    sound.startBattleBGM();
  }

  public stopToBackdrop(): void {
    this.isIdleBackdrop = true;
    this.configData = null;
    this.paratrooperTargeting = false;
    sound.stopBGM();
  }

  public setPausedState(paused: boolean): void {
    this.isPaused = paused;
  }

  public toggleSpeed(): 1 | 2 {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    return this.gameSpeed;
  }

  public focusCameraPreset(target: 'home' | 'front' | 'enemy' | 'overview'): void {
    const cam = this.cameras.main;
    const baseFitZoom = this.getDefaultZoom();
    if (target === 'overview') {
      const overviewZoom = Math.max(0.42, baseFitZoom * 0.68);
      cam.pan(WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5, 360, 'Sine.easeInOut', true);
      cam.zoomTo(overviewZoom, 360, 'Sine.easeInOut', true);
      return;
    }
    cam.zoomTo(baseFitZoom, 320, 'Sine.easeOut', true);
    const targetY =
      target === 'home'
        ? hexToWorld(4, 15).y
        : target === 'front'
          ? hexToWorld(4, 10).y
          : hexToWorld(4, 4).y;
    cam.pan(WORLD_WIDTH * 0.5, targetY, 340, 'Sine.easeInOut', true);
  }

  private getDpr(): number {
    return Math.min(window.devicePixelRatio || 2, 2);
  }

  private getDefaultZoom(): number {
    const vw = this.scale.width || 412;
    const dpr = this.getDpr();
    // Fits all 9 flat-top hex columns crisply at native Retina pixel resolution!
    return Math.min(1.15 * dpr, Math.max(0.62 * dpr, vw / (WORLD_WIDTH - 24)));
  }

  private fitCameraBounds(snapToPlayerBase: boolean): void {
    const cam = this.cameras.main;
    cam.setBounds(-40, -60, WORLD_WIDTH + 80, WORLD_HEIGHT + 160);
    if (snapToPlayerBase) {
      const z = this.getDefaultZoom();
      cam.setZoom(z);
      const homePos = hexToWorld(4, 14);
      cam.centerOn(WORLD_WIDTH * 0.5, homePos.y);
    }
  }

  private setupCameraAndInput(): void {
    const cam = this.cameras.main;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      sound.unlock();
      if (this.isIdleBackdrop || this.matchEnded) return;

      // Check right-edge Minimap quick click first!
      if (this.tryHandleMinimapTap(pointer.x, pointer.y)) {
        return;
      }

      this.isDragging = true;
      this.dragMovedDist = 0;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.camStartScrollX = cam.scrollX;
      this.camStartScrollY = cam.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isIdleBackdrop) return;

      // Two-finger pinch-to-zoom on mobile!
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.initialPinchDist <= 0) {
          this.initialPinchDist = dist;
          this.initialPinchZoom = cam.zoom;
        } else {
          const factor = dist / this.initialPinchDist;
          const dpr = this.getDpr();
          const nextZoom = Phaser.Math.Clamp(this.initialPinchZoom * factor, 0.44 * dpr, 1.45 * dpr);
          cam.setZoom(nextZoom);
        }
        this.dragMovedDist = 999;
        return;
      } else {
        this.initialPinchDist = 0;
      }

      if (!this.isDragging || !pointer.isDown) return;
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      this.dragMovedDist = Math.hypot(dx, dy);

      if (this.dragMovedDist > 6 * this.getDpr()) {
        cam.scrollX = this.camStartScrollX - dx / cam.zoom;
        cam.scrollY = this.camStartScrollY - dy / cam.zoom;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.initialPinchDist = 0;
      if (!this.isDragging) return;
      this.isDragging = false;

      if (this.isIdleBackdrop || this.matchEnded || this.isPaused) return;

      // Treat clean tap (< 14 CSS px finger movement) as world interaction!
      const dpr = this.getDpr();
      if (this.dragMovedDist < 14 * dpr) {
        const worldPt = cam.getWorldPoint(pointer.x, pointer.y);
        this.handleWorldTap(
          worldPt.x,
          worldPt.y,
          pointer.x / dpr,
          pointer.y / dpr,
          pointer.getDuration() > 420
        );
      }
    });

    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
        if (this.isIdleBackdrop) return;
        const dpr = this.getDpr();
        if (_pointer.event && (_pointer.event as WheelEvent).ctrlKey) {
          const nextZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.0012 * dpr, 0.44 * dpr, 1.45 * dpr);
          cam.setZoom(nextZoom);
        } else {
          // Smooth mouse-wheel scroll up/down battlefield on desktop!
          cam.scrollY += dy * 0.65;
        }
      }
    );
  }

  private tryHandleMinimapTap(sx: number, sy: number): boolean {
    const dpr = this.getDpr();
    const vw = this.scale.width;
    const vh = this.scale.height;
    const mapW = 46 * dpr;
    const mapH = 136 * dpr;
    const mx = vw - mapW - 8 * dpr;
    const my = Math.max(108 * dpr, vh * 0.5 - mapH * 0.5);
    if (sx >= mx - 6 * dpr && sx <= mx + mapW + 6 * dpr && sy >= my - 6 * dpr && sy <= my + mapH + 6 * dpr) {
      const ratioY = Phaser.Math.Clamp((sy - my) / mapH, 0, 1);
      this.cameras.main.pan(WORLD_WIDTH * 0.5, ratioY * WORLD_HEIGHT, 200, 'Sine.easeOut', true);
      sound.playClick();
      return true;
    }
    return false;
  }

  // =========================================================================
  // BATTLEFIELD INITIALIZATION (93格 vs 93格 Symmetric Red Alert Peninsula!)
  // =========================================================================
  private resetAndBuildBattlefield(): void {
    // Cleanup previous objects
    this.terrainLayer.removeAll(true);
    this.pinLayer.removeAll(true);
    this.buildingLayer.removeAll(true);
    this.groundUnitLayer.removeAll(true);
    this.projectileLayer.removeAll(true);
    this.airUnitLayer.removeAll(true);
    this.floatTextLayer.removeAll(true);
    this.trackGraphics.clear();
    this.wallGraphics.clear();
    this.effectGraphics.clear();
    this.targetOverlayGraphics.clear();

    this.cells.clear();
    this.buildings.clear();
    this.units.clear();
    this.projectiles = [];
    this.playerPins.clear();
    this.enemyPins.clear();
    this.prismBeams = [];
    this.treadMarks = [];

    this.matchSeed = Math.floor(Math.random() * 90000) + 10000;
    this.elapsedSec = 0;
    this.timeRemainingSec = MATCH_DURATION_SEC;
    this.matchEnded = false;
    this.playerGold = 85; // Immediate tactical choice: open Mine(50), Heavy Gunner(60), Rocketeer(80) or Missile Car(80)!
    this.enemyGold = 65;
    this.baseGoldAccum = 0;
    this.playerTechLevel = 1;
    this.enemyTechLevel = 1;

    const cmdId = store.data.selectedCommanderId;
    this.paratrooperMaxCd = cmdId === 'mac' ? 27 : 30;
    this.paratrooperCd = 14; // First paratrooper ready after 14s!
    this.paratrooperTargeting = false;
    this.enemyParatrooperCd = 31;
    const cmdDef = COMMANDERS.find((c) => c.id === cmdId) || COMMANDERS[0];
    this.commanderMaxCd = cmdDef.cooldown;
    this.commanderCd = 8;

    this.coopWave = 1;
    this.nextCoopWaveSec = 16;
    this.nextAllyBuildSec = 3.5;

    this.playerUnitsSpawned = 0;
    this.enemyUnitsKilled = 0;
    this.buildingsBuilt = 0;
    this.totalGoldMined = 0;
    this.aiController.reset();

    // Draw vibrant ocean backdrop + coastal sand shelves
    this.oceanBg.clear();
    this.oceanBg.fillStyle(0x1e9bc9, 1);
    this.oceanBg.fillRect(-300, -300, WORLD_WIDTH + 600, WORLD_HEIGHT + 600);
    // Decorative wave ripples
    this.oceanBg.fillStyle(0x4fc3f7, 0.22);
    for (let i = 0; i < 45; i++) {
      const wx = ((i * 97) % (WORLD_WIDTH + 200)) - 100;
      const wy = ((i * 151) % (WORLD_HEIGHT + 200)) - 100;
      this.oceanBg.fillRoundedRect(wx, wy, 48, 6, 3);
    }

    // Coastal water cutouts on central left/right edges so total land hexes = EXACTLY 186 (93 vs 93)!
    // 9 * 21 = 189 total grid cells -> cut 3 water inlet hexes => 186 land cells!
    // Check ownership split: 93 player grass hexes + 93 enemy sand hexes!
    const waterCutouts = new Set<string>(['0,10', '8,9', '8,11']);

    // Symmetric Sparkling Gem Deposits (matching Screenshots 6 & 1!)
    const gemLocations = new Set<string>([
      '4,17', // Player initial mine
      '2,15', // Player near-left gem ring (Screenshot 6!)
      '6,15', // Player near-right gem ring (Screenshot 1!)
      '1,12', // Player flank gem ring
      '7,13', // Player right-flank gem ring
      '4,3',  // Enemy initial mine
      '2,5',  // Enemy near-left gem ring
      '6,5',  // Enemy near-right gem ring
      '1,8',  // Enemy flank gem ring
      '7,7',  // Enemy right-flank gem ring
      '2,10', // Contested mid-west rich gem mine!
      '6,10', // Contested mid-east rich gem mine!
    ]);
    const richGemLocations = new Set<string>(['2,10', '6,10']);

    let landIndex = 0;
    const coastShelf = this.add.graphics();
    this.terrainLayer.add(coastShelf);

    // Pre-draw warm golden 3D sandy coastline rim under all land hexes (Screenshot 6 & 1 look!)
    let preIdx = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let q = 0; q < GRID_COLS; q++) {
        const key = hexKey(q, r);
        if (waterCutouts.has(key)) continue;
        const pos = hexToWorld(q, r);
        const outerVerts = getHexVertices(pos.x, pos.y + 5, HEX_RADIUS + 8);
        coastShelf.fillStyle(0xb67a3c, 1);
        coastShelf.beginPath();
        outerVerts.forEach((v, i) => (i === 0 ? coastShelf.moveTo(v.x, v.y) : coastShelf.lineTo(v.x, v.y)));
        coastShelf.closePath();
        coastShelf.fillPath();

        const rimVerts = getHexVertices(pos.x, pos.y, HEX_RADIUS + 6.5);
        coastShelf.fillStyle(0xdfad6b, 1);
        coastShelf.beginPath();
        rimVerts.forEach((v, i) => (i === 0 ? coastShelf.moveTo(v.x, v.y) : coastShelf.lineTo(v.x, v.y)));
        coastShelf.closePath();
        coastShelf.fillPath();
        preIdx++;
      }
    }
    void preIdx;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let q = 0; q < GRID_COLS; q++) {
        const key = hexKey(q, r);
        const pos = hexToWorld(q, r);
        const isWater = waterCutouts.has(key);

        let owner: Team = 'enemy';
        if (!isWater) {
          // Exact 93 vs 93 split! First 93 top cells = enemy sand, bottom 93 cells = player grass!
          owner = landIndex < 93 ? 'enemy' : 'player';
          landIndex++;
        }

        const variant = (q + r) % 2;
        const texKey = isWater
          ? 'hex_sand_0'
          : owner === 'player'
            ? `hex_grass_${variant}`
            : `hex_sand_${variant}`;

        const hexDispW = HEX_RADIUS * 2.08;
        const hexDispH = HEX_RADIUS * Math.sqrt(3) * 1.05;
        const tileSprite = this.add.image(pos.x, pos.y, texKey).setDisplaySize(hexDispW, hexDispH);
        if (isWater) tileSprite.setVisible(false);
        this.terrainLayer.add(tileSprite);

        const hasGemDeposit = !isWater && gemLocations.has(key);
        let gemSprite: Phaser.GameObjects.Image | undefined;
        if (hasGemDeposit) {
          gemSprite = this.add.image(pos.x, pos.y + 1, 'gem_ring').setDisplaySize(76, 68);
          this.terrainLayer.add(gemSprite);
        }

        this.cells.set(key, {
          q,
          r,
          x: pos.x,
          y: pos.y,
          isWater,
          owner,
          hasGemDeposit,
          isRichDeposit: richGemLocations.has(key),
          buildingId: null,
          rubbleUntil: 0,
          tileSprite,
          gemSprite,
        });
      }
    }

    this.terrainLayer.add(coastShelf);
    this.terrainLayer.sendToBack(coastShelf);

    // Coastal 3D Palm Trees + Ancient Sandstone Ruins matching Screenshots 1, 6, and 7!
    const palmCoords = [
      { x: 92, y: 58 },
      { x: 265, y: 50 },
      { x: 488, y: 64 },
      { x: 108, y: WORLD_HEIGHT - 56 },
      { x: 348, y: WORLD_HEIGHT - 52 },
      { x: 512, y: WORLD_HEIGHT - 58 },
    ];
    for (const p of palmCoords) {
      const palm = this.add.image(p.x, p.y, 'prop_palm').setDisplaySize(72, 72);
      this.terrainLayer.add(palm);
      this.tweens.add({
        targets: palm,
        rotation: 0.045,
        duration: 1800 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    const ruinCoords = [
      { x: 54, y: WORLD_HEIGHT - 64 },
      { x: 422, y: WORLD_HEIGHT - 56 },
      { x: WORLD_WIDTH - 34, y: hexToWorld(8, 10).y + 6 },
    ];
    for (const rc of ruinCoords) {
      const ruin = this.add.image(rc.x, rc.y, 'prop_ruins').setDisplaySize(64, 64);
      this.terrainLayer.add(ruin);
    }

    // Spawn Player Initial Base + Initial Gold Mine (Exact match to Screenshot 6!)
    const isCoop = this.configData?.mode === 'coop';
    if (isCoop) {
      this.spawnBuilding('player', 'base', 5, 16, true, false);
      this.spawnBuilding('player', 'gold_mine', 5, 17, false, false);
      // Allied Sub-Commander ("苍白哥哥") base on left flank!
      this.spawnBuilding('player', 'base', 2, 16, false, true);
      this.spawnBuilding('player', 'gold_mine', 2, 17, false, true);
    } else {
      this.spawnBuilding('player', 'base', 4, 16, true, false);
      this.spawnBuilding('player', 'gold_mine', 4, 17, false, false);
    }

    // Spawn Enemy Initial Base + Initial Gold Mine (Top desert fortress!)
    this.spawnBuilding('enemy', 'base', 4, 4, true, false);
    this.spawnBuilding('enemy', 'gold_mine', 4, 3, false, false);
    if (isCoop) {
      // Extra Northern Boss Bastions in Co-op!
      this.spawnBuilding('enemy', 'sam_tower', 3, 5, false, false);
      this.spawnBuilding('enemy', 'bunker', 5, 5, false, false);
      this.spawnBuilding('enemy', 'gold_mine', 6, 4, false, false);
    }

    this.redrawFortressWalls();
    this.refreshBuildPins('player');
    this.refreshBuildPins('enemy');
    this.updatePinAffordabilityVisuals();

    // Opening Vanguard Recon Skirmish at the grass-sand border so action sparks from second 1!
    if (!this.isIdleBackdrop) {
      const pVanguard = hexToWorld(4, 12);
      const eVanguard = hexToWorld(4, 8);
      this.spawnUnit('player', 'assault_infantry', pVanguard.x - 16, pVanguard.y, false);
      this.spawnUnit('player', 'heavy_gunner', pVanguard.x + 16, pVanguard.y, false);
      this.spawnUnit('enemy', 'assault_infantry', eVanguard.x - 16, eVanguard.y, false);
      this.spawnUnit('enemy', 'missile_car', eVanguard.x + 16, eVanguard.y, false);
    }

    this.fitCameraBounds(true);
    this.pushHudState();
  }

  // =========================================================================
  // BUILDING SPAWN, WALL PERIMETER RENDERING & EXPANDABLE HEX PINS
  // =========================================================================
  private getPowerScale(team: Team): number {
    if (team === 'player') {
      return store.getCombatPowerPct() / 200; // ~1.125x at 225%, scales meaningfully with upgrades!
    }
    const oppPct = this.configData?.opponent.powerPct || 168;
    return oppPct / 200;
  }

  private getBuildingTextureKey(team: Team, cardId: string, isCommandCenter: boolean): string {
    const suffix = team === 'player' ? 'blue' : 'red';
    if (isCommandCenter || cardId === 'base') return `bldg_base_${suffix}`;
    const card = CARDS[cardId];
    if (!card) return `bldg_barracks_${suffix}`;
    if (card.id === 'gold_mine') return `bldg_mine_${suffix}`;
    if (card.id === 'bunker') return `bldg_bunker_${suffix}`;
    if (card.id === 'sam_tower') return `bldg_sam_${suffix}`;
    if (card.id === 'prism_tower') return `bldg_prism_${suffix}`;
    if (card.category === 'infantry') return `bldg_barracks_${suffix}`;
    if (card.category === 'air') return `bldg_airfield_${suffix}`;
    return `bldg_factory_${suffix}`;
  }

  private spawnBuilding(
    team: Team,
    cardId: string,
    q: number,
    r: number,
    isCommandCenter: boolean,
    isAllySubBase: boolean
  ): BuildingEntity | null {
    const key = hexKey(q, r);
    const cell = this.cells.get(key);
    if (!cell || cell.isWater || cell.buildingId) return null;

    // Claim tile color immediately
    this.paintHexOwner(cell, team);
    if (cell.rubbleSprite) {
      cell.rubbleSprite.destroy();
      cell.rubbleSprite = undefined;
      cell.rubbleUntil = 0;
    }

    const pScale = this.getPowerScale(team);
    const cmdId = store.data.selectedCommanderId;
    const wallHpBonus = team === 'player' && cmdId === 'boris' ? 1.2 : 1.0;

    let maxHp = 600;
    let atk = 0;
    let range = 0;
    let attackInterval = 1.0;
    let spawnInterval = 0;
    let goldPerCycle = 0;
    let category: UnitCategory = 'base';

    if (isCommandCenter || cardId === 'base') {
      maxHp = Math.round((isCommandCenter ? 2100 : 1200) * pScale * wallHpBonus);
      atk = Math.round(28 * pScale);
      range = 165;
      attackInterval = 0.85;
      category = 'base';
    } else {
      const card = CARDS[cardId];
      category = card.category;
      const lv = team === 'player' ? store.data.cardLevels[cardId] || 8 : 7;
      const lvMult = 1 + (lv - 8) * 0.08;
      maxHp = Math.round(card.buildingHp * pScale * lvMult * wallHpBonus);
      atk = Math.round(card.atk * pScale * lvMult);
      range = card.range;
      attackInterval = card.attackInterval;
      spawnInterval = card.spawnInterval;
      if (card.id === 'gold_mine') {
        const natashaBonus = team === 'player' && cmdId === 'natasha' ? 1.12 : 1.0;
        const richBonus = cell.isRichDeposit ? 1.35 : 1.0;
        goldPerCycle = Number(((4.3 + (lv - 8) * 0.35) * natashaBonus * richBonus).toFixed(1));
      }
    }

    const container = this.add.container(cell.x, cell.y);
    const texKey = this.getBuildingTextureKey(team, cardId, isCommandCenter);
    const bldgSize = isCommandCenter ? 74 : 66;
    const sprite = this.add.image(0, -3, texKey).setDisplaySize(bldgSize, bldgSize);
    const progressArc = this.add.graphics();
    const hpBar = this.add.graphics();

    container.add([sprite, progressArc, hpBar]);

    // Mini 3D unit sprite badge on military spawner buildings so players instantly recognize what spawns here!
    if (!isCommandCenter && cardId !== 'gold_mine' && CARDS[cardId]?.slotType === 'unit') {
      const suffix = team === 'player' ? 'blue' : 'red';
      const unitMini = this.add
        .image(15, -18, `unit_${cardId}_${suffix}`)
        .setDisplaySize(26, 26);
      container.add(unitMini);
    }

    this.buildingLayer.add(container);

    // Pop-in construction tween
    container.setScale(0.35);
    this.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    const id = `b_${this.idCounter++}`;
    cell.buildingId = id;

    const entity: BuildingEntity = {
      id,
      team,
      isCommandCenter,
      cardId,
      category,
      q,
      r,
      x: cell.x,
      y: cell.y,
      hp: maxHp,
      maxHp,
      atk,
      range,
      attackInterval,
      attackTimer: 0.2,
      spawnInterval,
      spawnTimer: spawnInterval * 0.65, // Spawns first squad quickly right after building!
      goldPerCycle,
      isAllySubBase,
      container,
      sprite,
      progressArc,
      hpBar,
    };

    this.buildings.set(id, entity);
    this.drawEntityHpBar(hpBar, entity.hp, entity.maxHp, 38, -32, team === 'player');
    return entity;
  }

  /**
   * Renders continuous connected Red Alert stone fortress walls around outer boundary edges
   * of all living buildings for both Player and Enemy (exact visual match to Screenshots 1, 2, 6, 7!)
   */
  private redrawFortressWalls(): void {
    this.wallGraphics.clear();

    for (const b of this.buildings.values()) {
      const verts = getHexVertices(b.x, b.y, HEX_RADIUS);
      const neighbors = getHexNeighbors(b.q, b.r);

      for (let edge = 0; edge < 6; edge++) {
        const nb = neighbors[edge];
        const nbCell = this.cells.get(hexKey(nb.q, nb.r));
        const nbBldg = nbCell?.buildingId ? this.buildings.get(nbCell.buildingId) : undefined;

        // Shared internal edge between two living buildings of same team -> NO internal wall!
        if (nbBldg && nbBldg.team === b.team) continue;

        const v1 = verts[edge];
        const v2 = verts[(edge + 1) % 6];

        // Drop shadow under wall
        this.wallGraphics.lineStyle(9, 0x1a2228, 0.45);
        this.wallGraphics.beginPath();
        this.wallGraphics.moveTo(v1.x, v1.y + 3);
        this.wallGraphics.lineTo(v2.x, v2.y + 3);
        this.wallGraphics.strokePath();

        // Main steel-concrete bevel wall beam
        const wallColor = b.team === 'player' ? 0x6b7f94 : 0x7a6b6e;
        this.wallGraphics.lineStyle(6.5, 0x37474f, 1);
        this.wallGraphics.beginPath();
        this.wallGraphics.moveTo(v1.x, v1.y);
        this.wallGraphics.lineTo(v2.x, v2.y);
        this.wallGraphics.strokePath();

        this.wallGraphics.lineStyle(3.4, wallColor, 1);
        this.wallGraphics.beginPath();
        this.wallGraphics.moveTo(v1.x, v1.y - 0.8);
        this.wallGraphics.lineTo(v2.x, v2.y - 0.8);
        this.wallGraphics.strokePath();

        // Corner concrete turrets/pillars on hex vertices
        this.wallGraphics.fillStyle(0x455a64, 1);
        this.wallGraphics.fillCircle(v1.x, v1.y, 4.6);
        this.wallGraphics.fillStyle(0xb0bec5, 1);
        this.wallGraphics.fillCircle(v1.x, v1.y - 1, 2.6);
      }
    }
  }

  /**
   * Computes deterministic, zero-frustration expandable hex Build Pins around all living buildings of `team`!
   * Guarantees:
   * - Gem deposits ALWAYS become Gold Mine (`50`金) pins!
   * - Every card in the player's equipped deck is ALWAYS available on at least one surrounding hex pin!
   */
  private refreshBuildPins(team: Team): void {
    const targetMap = team === 'player' ? this.playerPins : this.enemyPins;

    // Destroy old visual containers for player pins
    if (team === 'player') {
      for (const oldPin of targetMap.values()) {
        oldPin.container?.destroy();
      }
    }
    targetMap.clear();

    const candidateCoords: Array<{ q: number; r: number; key: string; cell: HexCell }> = [];
    const seen = new Set<string>();

    let existingMines = 0;
    for (const b of this.buildings.values()) {
      if (b.team !== team) continue;
      if (b.cardId === 'gold_mine') existingMines++;

      for (const nb of getHexNeighbors(b.q, b.r)) {
        if (!isValidGridHex(nb.q, nb.r)) continue;
        const k = hexKey(nb.q, nb.r);
        if (seen.has(k)) continue;
        seen.add(k);

        const cell = this.cells.get(k);
        if (!cell || cell.isWater || cell.buildingId) continue;
        candidateCoords.push({ q: nb.q, r: nb.r, key: k, cell });
      }
    }

    if (candidateCoords.length === 0) return;

    const deck =
      team === 'player'
        ? store.getActiveDeck()
        : {
            units: this.configData?.opponent.unitDeck || ['missile_car', 'rhino_tank', 'heavy_gunner', 'jetpack_trooper'],
            defense: this.configData?.opponent.defenseCard || 'sam_tower',
            mine: 'gold_mine',
          };

    const nonMinePool = [...deck.units, deck.defense];
    const assignments = new Map<string, string>();
    let hasMinePin = false;

    for (const cand of candidateCoords) {
      if (cand.cell.hasGemDeposit) {
        assignments.set(cand.key, 'gold_mine');
        hasMinePin = true;
      } else {
        const hash = Math.abs((cand.q * 73856093) ^ (cand.r * 19349663) ^ this.matchSeed);
        // Rear hexes occasionally offer an extra mine pin if none is adjacent yet
        const isRear = team === 'player' ? cand.r >= 17 : cand.r <= 3;
        if (!hasMinePin && existingMines < 2 && isRear && hash % 3 === 0) {
          assignments.set(cand.key, 'gold_mine');
          hasMinePin = true;
        } else {
          assignments.set(cand.key, nonMinePool[hash % nonMinePool.length]);
        }
      }
    }

    // Deck Coverage Guarantee: ensure EVERY card in nonMinePool appears at least once if enough pins exist!
    const nonGemKeys = candidateCoords.filter((c) => !c.cell.hasGemDeposit).map((c) => c.key);
    const presentCards = new Set(assignments.values());
    let replaceCursor = 0;
    for (const requiredCardId of nonMinePool) {
      if (!presentCards.has(requiredCardId) && replaceCursor < nonGemKeys.length) {
        // Find a duplicate slot to replace so we never wipe out another unique card
        for (let i = 0; i < nonGemKeys.length; i++) {
          const checkKey = nonGemKeys[(replaceCursor + i) % nonGemKeys.length];
          const currId = assignments.get(checkKey)!;
          const countOfCurr = Array.from(assignments.values()).filter((v) => v === currId).length;
          if (countOfCurr > 1) {
            assignments.set(checkKey, requiredCardId);
            presentCards.add(requiredCardId);
            replaceCursor = (replaceCursor + i + 1) % nonGemKeys.length;
            break;
          }
        }
      }
    }

    for (const cand of candidateCoords) {
      const cardId = assignments.get(cand.key) || deck.units[0];
      const card = CARDS[cardId] || CARDS['heavy_gunner'];
      const cost = card.cost;

      const pin: BuildPin = {
        key: cand.key,
        q: cand.q,
        r: cand.r,
        x: cand.cell.x,
        y: cand.cell.y,
        cardId,
        cost,
      };

      if (team === 'player' && !this.isIdleBackdrop) {
        const container = this.add.container(cand.cell.x, cand.cell.y);

        // Extra golden ring highlight under Gold Mine pins so players spot resource hexes immediately!
        if (cardId === 'gold_mine') {
          const mineHalo = this.add.graphics();
          mineHalo.lineStyle(2.2, 0xffd54f, 0.85);
          mineHalo.strokeCircle(0, -10, 17);
          container.add(mineHalo);
        }

        const pinBg = this.add.image(0, -8, 'pin_ready').setDisplaySize(42, 42);
        const miniIcon = this.add.image(0, -11, `card_${cardId}`).setDisplaySize(25, 25);
        const coinIco = this.add.image(-14, 14, 'ui_coin').setDisplaySize(13, 13);

        const costText = this.add
          .text(-6, 14, `${cost}`, {
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#fff176',
            stroke: '#1a1a1a',
            strokeThickness: 3.5,
          })
          .setOrigin(0, 0.5);

        container.add([pinBg, miniIcon, coinIco, costText]);
        this.pinLayer.add(container);

        pin.container = container;
        pin.pinBg = pinBg;
        pin.costText = costText;
      }

      targetMap.set(cand.key, pin);
    }

    this.updatePinAffordabilityVisuals();
  }

  private updatePinAffordabilityVisuals(): void {
    for (const pin of this.playerPins.values()) {
      if (!pin.pinBg || !pin.costText) continue;
      const canAfford = this.playerGold >= pin.cost;
      pin.pinBg.setTexture(canAfford ? 'pin_ready' : 'pin_wait');
      pin.costText.setColor(canAfford ? '#fff59d' : '#ff5252'); // Exact red cost text when unaffordable like Screenshot 6!
    }
  }

  // =========================================================================
  // PLAYER INTERACTIONS: BUILD HEX, TECH UPGRADE, PARATROOPER DROP, COMMANDER SKILL
  // =========================================================================
  private handleWorldTap(
    wx: number,
    wy: number,
    screenX: number,
    screenY: number,
    isLongPress: boolean
  ): void {
    const hex = worldToHex(wx, wy);
    const key = hexKey(hex.q, hex.r);
    const cell = this.cells.get(key);

    // 1. Paratrooper Targeting Mode: Airdrop directly onto tapped land hex!
    if (this.paratrooperTargeting) {
      if (!cell || cell.isWater) {
        this.configData?.onToast('请选择陆地格子空投伞兵！', 'warn');
        return;
      }
      this.executeParatrooperDrop('player', cell.x, cell.y);
      this.paratrooperTargeting = false;
      this.paratrooperCd = this.paratrooperMaxCd;
      this.targetOverlayGraphics.clear();
      this.pushHudState();
      return;
    }

    // 2. Tap on Expandable Build Pin
    const pin = this.playerPins.get(key);
    if (pin) {
      const lv = store.data.cardLevels[pin.cardId] || 8;
      if (isLongPress) {
        sound.playClick();
        this.configData?.onPinInspect(pin.cardId, pin.cost, lv, screenX, screenY);
        return;
      }

      if (this.playerGold < pin.cost) {
        sound.playClick();
        // Show the Screenshot 1 Floating Card Tooltip + helpful remaining gold note!
        this.configData?.onPinInspect(pin.cardId, pin.cost, lv, screenX, screenY);
        return;
      }

      // Spend gold & construct building!
      this.playerGold -= pin.cost;
      const built = this.spawnBuilding('player', pin.cardId, pin.q, pin.r, false, false);
      if (built) {
        this.buildingsBuilt++;
        sound.playBuild();
        this.spawnBurstParticles(built.x, built.y, 0x80d8ff, 12);
        const card = CARDS[pin.cardId];
        this.spawnFloatingText(built.x, built.y - 26, `${card.shortName}!`, '#80d8ff', 14);
        this.redrawFortressWalls();
        this.refreshBuildPins('player');
        this.refreshBuildPins('enemy');
        this.pushHudState();
      }
      return;
    }

    // 3. Tapping an existing enemy or friendly building inspects what card it is!
    if (cell?.buildingId) {
      const b = this.buildings.get(cell.buildingId);
      if (b && CARDS[b.cardId]) {
        sound.playClick();
        const lv = b.team === 'player' ? store.data.cardLevels[b.cardId] || 8 : 7;
        this.configData?.onPinInspect(b.cardId, CARDS[b.cardId].cost, lv, screenX, screenY);
      }
    }
  }

  public getTechUpgradeCost(level: number): number {
    // Starts at exact 30 Gold matching Screenshot 6 bottom-left `科技强化 30`!
    const table = [0, 30, 50, 75, 105, 145, 999];
    return table[Math.min(level, table.length - 1)];
  }

  public triggerTechUpgrade(): void {
    if (this.matchEnded || this.isPaused) return;
    if (this.playerTechLevel >= 6) {
      this.configData?.onToast('科技强化已达最高等级 Lv.6！', 'info');
      return;
    }
    const cost = this.getTechUpgradeCost(this.playerTechLevel);
    if (this.playerGold < cost) {
      this.configData?.onToast(`金币不足！科技强化需要 ${cost} 金币`, 'warn');
      return;
    }
    this.playerGold -= cost;
    this.playerTechLevel += 1;
    sound.playSkill();

    // Flash golden upgrade aura on all friendly units & buildings!
    for (const u of this.units.values()) {
      if (u.team === 'player') {
        this.spawnBurstParticles(u.x, u.y, 0xffd54f, 5);
      }
    }
    for (const b of this.buildings.values()) {
      if (b.team === 'player' && b.isCommandCenter) {
        this.spawnFloatingText(b.x, b.y - 36, `科技 Lv.${this.playerTechLevel} 攻击+18%!`, '#ffd54f', 16);
      }
    }
    this.updatePinAffordabilityVisuals();
    this.configData?.onToast(
      `科技升至 Lv.${this.playerTechLevel}！全军伤害 +${(this.playerTechLevel - 1) * 18}%`,
      'good'
    );
    this.pushHudState();
  }

  public triggerParatrooperButton(): void {
    if (this.matchEnded || this.isPaused) return;
    if (this.paratrooperCd > 0) {
      this.configData?.onToast(`伞兵准备中，还剩 ${Math.ceil(this.paratrooperCd)} 秒`, 'info');
      return;
    }

    // Second tap while already in targeting mode -> smart auto-drop onto best enemy target!
    if (this.paratrooperTargeting) {
      const target = this.pickSmartParatrooperTarget('player');
      this.executeParatrooperDrop('player', target.x, target.y);
      this.paratrooperTargeting = false;
      this.paratrooperCd = this.paratrooperMaxCd;
      this.targetOverlayGraphics.clear();
      this.pushHudState();
      return;
    }

    this.paratrooperTargeting = true;
    sound.playClick();
    this.drawParatrooperTargetOverlay();
    this.configData?.onToast('请点击地图任意陆地空投伞兵！（再点一次自动奇袭敌后金矿）', 'good');
    this.pushHudState();
  }

  private drawParatrooperTargetOverlay(): void {
    this.targetOverlayGraphics.clear();
    if (!this.paratrooperTargeting) return;
    this.targetOverlayGraphics.lineStyle(2.5, 0x69f0ae, 0.85);
    for (const b of this.buildings.values()) {
      if (b.team === 'enemy' && b.cardId === 'gold_mine') {
        this.targetOverlayGraphics.strokeCircle(b.x, b.y, 44);
      }
    }
  }

  private pickSmartParatrooperTarget(team: Team): { x: number; y: number } {
    const targetTeam: Team = team === 'player' ? 'enemy' : 'player';
    // Prefer enemy gold mines for classic Red Alert raid, fallback to front line!
    for (const b of this.buildings.values()) {
      if (b.team === targetTeam && b.cardId === 'gold_mine') {
        return { x: b.x, y: b.y + (team === 'player' ? 36 : -36) };
      }
    }
    return hexToWorld(4, 10);
  }

  private executeParatrooperDrop(team: Team, dropX: number, dropY: number): void {
    sound.playSkill();

    // Fly transport shadow across drop zone!
    const planeShadow = this.add.graphics().setDepth(28);
    planeShadow.fillStyle(0x000000, 0.32);
    planeShadow.fillTriangle(-32, -8, -32, 8, 34, 0);
    planeShadow.fillTriangle(-8, -42, 8, -42, 4, 42);
    planeShadow.setPosition(-80, dropY - 30);
    this.tweens.add({
      targets: planeShadow,
      x: WORLD_WIDTH + 90,
      y: dropY + 20,
      duration: 1150,
      onComplete: () => planeShadow.destroy(),
    });

    // Spawn 5 elite paratroopers (3 Assault Infantry + 2 Heavy Gunners!) with parachutes!
    const squadCards = ['assault_infantry', 'heavy_gunner', 'assault_infantry', 'heavy_gunner', 'assault_infantry'];
    squadCards.forEach((cid, idx) => {
      const ang = (idx / squadCards.length) * Math.PI * 2;
      const px = Phaser.Math.Clamp(dropX + Math.cos(ang) * 32, 48, WORLD_WIDTH - 48);
      const py = Phaser.Math.Clamp(dropY + Math.sin(ang) * 28, 70, WORLD_HEIGHT - 70);
      this.spawnUnit(team, cid, px, py, true);
    });

    if (team === 'player') {
      this.spawnFloatingText(dropX, dropY - 34, '空降奇袭!', '#69f0ae', 16);
      this.cameras.main.pan(dropX, dropY, 280, 'Sine.easeOut', false);
    } else {
      this.spawnFloatingText(dropX, dropY - 34, '敌军伞兵空投!', '#ff5252', 16);
      this.configData?.onToast('警报：敌军召唤伞兵空投！可用机枪碉堡克制！', 'warn');
    }
  }

  public triggerCommanderSkill(): void {
    if (this.matchEnded || this.isPaused) return;
    if (this.commanderCd > 0) {
      this.configData?.onToast(`指挥官技能冷却中（${Math.ceil(this.commanderCd)}s）`, 'info');
      return;
    }

    const cmdId = store.data.selectedCommanderId;
    this.commanderCd = this.commanderMaxCd;
    sound.playSkill();

    if (cmdId === 'boris') {
      // Kirov / MiG Carpet Bombing Strike on densest enemy cluster!
      const targetPos = this.findDensestCluster('enemy');
      this.configData?.onToast('鲍里斯元帅：基洛夫高爆轰炸启动！', 'good');
      for (let i = 0; i < 5; i++) {
        this.time.delayedCall(i * 170, () => {
          if (this.matchEnded) return;
          const bx = targetPos.x + (Math.random() - 0.5) * 95;
          const by = targetPos.y + (Math.random() - 0.5) * 95;
          sound.playExplosion(true);
          this.spawnExplosionVisual(bx, by, 54, true);
          this.applySplashDamage('player', 'jet_fighter', bx, by, 68, 155);
        });
      }
    } else if (cmdId === 'natasha') {
      // Red Alert Iron Curtain Shield + Repair!
      this.configData?.onToast('铁壁·娜塔莎：铁幕护盾已覆盖全军！', 'good');
      for (const u of this.units.values()) {
        if (u.team === 'player') {
          u.buffShieldUntil = this.elapsedSec + 6.5;
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25);
        }
      }
      for (const b of this.buildings.values()) {
        if (b.team === 'player') {
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.18);
          this.spawnFloatingText(b.x, b.y - 24, '+铁幕修复', '#ce93d8', 13);
        }
      }
    } else {
      // General Mac: Combat Stimulants Frenzy (+42% Attack Speed & +35% Move Speed!)
      this.configData?.onToast('麦克将军：全军狂暴集结火力全开！', 'good');
      for (const u of this.units.values()) {
        if (u.team === 'player') {
          u.buffFrenzyUntil = this.elapsedSec + 8.0;
          this.spawnBurstParticles(u.x, u.y, 0x69f0ae, 6);
        }
      }
    }
    this.pushHudState();
  }

  private findDensestCluster(team: Team): { x: number; y: number } {
    let bestX = WORLD_WIDTH * 0.5;
    let bestY = hexToWorld(4, 5).y;
    let bestScore = -1;

    for (const u of this.units.values()) {
      if (u.team !== team) continue;
      let nearby = 0;
      for (const o of this.units.values()) {
        if (o.team === team && Phaser.Math.Distance.Between(u.x, u.y, o.x, o.y) < 110) nearby++;
      }
      if (nearby > bestScore) {
        bestScore = nearby;
        bestX = u.x;
        bestY = u.y;
      }
    }
    if (bestScore <= 0) {
      for (const b of this.buildings.values()) {
        if (b.team === team && !b.isCommandCenter) {
          return { x: b.x, y: b.y };
        }
      }
    }
    return { x: bestX, y: bestY };
  }

  // =========================================================================
  // UNIT SPAWNING & REAL-TIME AUTO-BATTLER SIMULATION LOOP
  // =========================================================================
  private countTeamPop(team: Team): number {
    let n = 0;
    for (const u of this.units.values()) {
      if (u.team === team) n++;
    }
    return n;
  }

  private spawnUnit(
    team: Team,
    cardId: string,
    x: number,
    y: number,
    viaParachute = false
  ): UnitEntity | null {
    const card: CardDef = CARDS[cardId] || CARDS['assault_infantry'];
    const pScale = this.getPowerScale(team);
    const lv = team === 'player' ? store.data.cardLevels[cardId] || 8 : 7;
    const lvMult = 1 + (lv - 8) * 0.08;
    const cmdId = store.data.selectedCommanderId;
    const cmdAtkMult = team === 'player' && cmdId === 'mac' ? 1.12 : 1.0;

    const maxHp = Math.round(card.hp * pScale * lvMult);
    const baseAtk = card.atk * pScale * lvMult * cmdAtkMult;

    const suffix = team === 'player' ? 'blue' : 'red';
    const container = this.add.container(x, y);
    const dispSize =
      card.id === 'apocalypse_tank'
        ? 58
        : card.id === 'rhino_tank' || card.id === 'jet_fighter' || card.id === 'artillery_car'
          ? 52
          : card.id === 'missile_car'
            ? 48
            : 43;

    let shadow: Phaser.GameObjects.Image | undefined;
    if (card.isFlying) {
      shadow = this.add
        .image(8, 22, `unit_${cardId}_${suffix}`)
        .setTint(0x000000)
        .setAlpha(0.28)
        .setDisplaySize(dispSize * 0.88, dispSize * 0.88);
      container.add(shadow);
    }

    const initialAngle = team === 'player' ? -Math.PI / 2 : Math.PI / 2;
    const facesLeftNatively =
      cardId === 'missile_car' || cardId === 'artillery_car' || cardId === 'jet_fighter';
    const sprite = this.add
      .image(0, 0, `unit_${cardId}_${suffix}`)
      .setDisplaySize(dispSize, dispSize)
      .setFlipX(team === 'player' ? !facesLeftNatively : facesLeftNatively);

    const auraRing = this.add.graphics();
    const hpBar = this.add.graphics();
    container.add([auraRing, sprite, hpBar]);

    let turretSprite: Phaser.GameObjects.Image | undefined;
    void turretSprite;

    let parachute: Phaser.GameObjects.Image | undefined;
    if (viaParachute) {
      parachute = this.add.image(0, -48, 'ui_parachute_icon').setDisplaySize(38, 38);
      sprite.y = -32;
      container.add(parachute);
    }

    if (card.isFlying || viaParachute) {
      this.airUnitLayer.add(container);
    } else {
      this.groundUnitLayer.add(container);
    }

    const id = `u_${this.idCounter++}`;
    if (team === 'player') this.playerUnitsSpawned++;

    const unit: UnitEntity = {
      id,
      team,
      cardId,
      category: card.category,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: initialAngle,
      hp: maxHp,
      maxHp,
      atk: baseAtk,
      range: card.range,
      attackInterval: card.attackInterval,
      attackTimer: Math.random() * 0.25,
      moveSpeed: card.moveSpeed,
      splashRadius: card.splashRadius,
      isFlying: card.isFlying,
      canHitAir: card.canHitAir,
      canHitGround: card.canHitGround,
      projectileType: card.projectileType,
      dropProgress: viaParachute ? 0 : 1,
      buffFrenzyUntil: 0,
      buffShieldUntil: 0,
      lastTrackDist: 0,
      container,
      shadow,
      sprite,
      turretSprite,
      parachute,
      hpBar,
      auraRing,
    };

    this.units.set(id, unit);
    return unit;
  }

  public update(_time: number, deltaMs: number): void {
    if (this.isPaused || this.matchEnded) return;

    const rawDt = Math.min(0.05, deltaMs / 1000);
    const dt = rawDt * (this.isIdleBackdrop ? 0.6 : this.gameSpeed);

    if (this.isIdleBackdrop) {
      this.minimapGraphics.clear();
      return;
    }

    this.elapsedSec += dt;
    this.timeRemainingSec = Math.max(0, MATCH_DURATION_SEC - this.elapsedSec);

    // 1. Passive Base Gold Income + Cooldowns
    this.baseGoldAccum += dt;
    if (this.baseGoldAccum >= 0.5) {
      this.baseGoldAccum -= 0.5;
      this.playerGold += 1.1;
      this.enemyGold += 1.05;
      this.updatePinAffordabilityVisuals();
    }

    this.paratrooperCd = Math.max(0, this.paratrooperCd - dt);
    this.commanderCd = Math.max(0, this.commanderCd - dt);

    // Enemy Paratrooper Airdrop Cooldown (Matches exact `31s` -> `0s` badge in Screenshots!)
    this.enemyParatrooperCd -= dt;
    if (this.enemyParatrooperCd <= 0) {
      this.enemyParatrooperCd = 38;
      const dropTarget = this.pickSmartParatrooperTarget('enemy');
      this.executeParatrooperDrop('enemy', dropTarget.x, dropTarget.y);
    }

    // 2. AI Opponent Decisions & Co-op Wave Spawner
    this.updateAIAndCoop(dt);

    // 3. Update All Buildings (Gold Mine cycles, Unit Training rings, Defense Turrets)
    this.updateBuildings(dt);

    // 4. Update All Units (Parachute descent, Boids steering, Territory Capture, Combat)
    this.updateUnits(dt);

    // 5. Update Projectiles, Prism Laser Beams, Tank Tracks & Rubble Cleanup
    this.updateProjectilesAndEffects(dt);

    // 6. Check Match End Conditions (Command Center Destroyed OR 04:00 Timer Expired)
    this.checkMatchEnd();

    // 7. Render Live Right-Edge Tactical Minimap & Sync UI HUD
    this.renderMinimap();
    this.hudSyncAccum += rawDt;
    if (this.hudSyncAccum >= 0.14) {
      this.hudSyncAccum = 0;
      this.pushHudState();
    }
  }

  private updateAIAndCoop(_dt: number): void {
    const enemyTechCost = this.getTechUpgradeCost(this.enemyTechLevel);
    const decision = this.aiController.decide({
      aiGold: this.enemyGold,
      aiTechLevel: this.enemyTechLevel,
      aiTechCost: enemyTechCost,
      elapsedSec: this.elapsedSec,
      enemyPins: Array.from(this.enemyPins.values()),
      enemyBuildings: Array.from(this.buildings.values()).filter((b) => b.team === 'enemy'),
      playerUnits: Array.from(this.units.values()).filter((u) => u.team === 'player'),
      playerBuildings: Array.from(this.buildings.values()).filter((b) => b.team === 'player'),
      profile: this.configData?.opponent || OPPONENT_PROFILES[0],
    });

    if (decision.action === 'tech') {
      this.enemyGold -= enemyTechCost;
      this.enemyTechLevel += 1;
    } else if (decision.action === 'build') {
      this.enemyGold -= decision.pin.cost;
      const built = this.spawnBuilding('enemy', decision.pin.cardId, decision.pin.q, decision.pin.r, false, false);
      if (built) {
        this.redrawFortressWalls();
        this.refreshBuildPins('enemy');
        this.refreshBuildPins('player');
      }
    }

    // Co-op Mode Special Mechanics: Allied AI Partner + Escalating Red Alert Boss Waves!
    if (this.configData?.mode === 'coop') {
      if (this.elapsedSec >= this.nextAllyBuildSec) {
        this.nextAllyBuildSec = this.elapsedSec + 11;
        // Allied partner "苍白哥哥" spawns helpful complementary counter squad from left sub-base!
        const allyPos = hexToWorld(2, 15);
        const allyPool = ['missile_car', 'heavy_gunner', 'jetpack_trooper', 'rhino_tank'];
        const pick = allyPool[Math.floor(Math.random() * allyPool.length)];
        this.spawnUnit('player', pick, allyPos.x, allyPos.y - 16, false);
        this.spawnFloatingText(allyPos.x, allyPos.y - 30, '盟友支援!', '#80d8ff', 12);
      }

      if (this.coopWave <= this.coopMaxWave && this.elapsedSec >= this.nextCoopWaveSec) {
        this.spawnCoopBossWave(this.coopWave);
        this.coopWave++;
        this.nextCoopWaveSec = this.elapsedSec + 32;
      }
    }
  }

  private spawnCoopBossWave(waveNum: number): void {
    sound.playSkill();
    this.configData?.onToast(`合作波次 ${waveNum}/${this.coopMaxWave}：红警精锐突击群来袭！`, 'warn');
    const waveTemplates: string[][] = [
      ['assault_infantry', 'assault_infantry', 'missile_car'],
      ['rhino_tank', 'heavy_gunner', 'heavy_gunner', 'missile_car'],
      ['jetpack_trooper', 'jetpack_trooper', 'artillery_car', 'rhino_tank'],
      ['apocalypse_tank', 'missile_car', 'jet_fighter', 'heavy_gunner'],
      ['apocalypse_tank', 'apocalypse_tank', 'jet_fighter', 'jetpack_trooper'],
      ['apocalypse_tank', 'apocalypse_tank', 'jet_fighter', 'jet_fighter', 'artillery_car'],
    ];
    const list = waveTemplates[Math.min(waveNum - 1, waveTemplates.length - 1)];
    list.forEach((cid, i) => {
      const spawnPos = hexToWorld(2 + (i % 5), 6);
      this.spawnUnit('enemy', cid, spawnPos.x, spawnPos.y, false);
    });
  }

  private updateBuildings(dt: number): void {
    const playerPop = this.countTeamPop('player');
    const enemyPop = this.countTeamPop('enemy');

    for (const b of this.buildings.values()) {
      b.progressArc.clear();

      // 1. Gold Mine Production Cycle + Green Progress Circle + `+4.5` Floating Text!
      if (b.cardId === 'gold_mine' && b.spawnInterval > 0) {
        b.spawnTimer += dt;
        const pct = Math.min(1, b.spawnTimer / b.spawnInterval);
        this.drawRadialProgress(b.progressArc, pct, b.team === 'player' ? 0x00e676 : 0xff7043);

        if (b.spawnTimer >= b.spawnInterval) {
          b.spawnTimer -= b.spawnInterval;
          if (b.team === 'player') {
            this.playerGold += b.goldPerCycle;
            this.totalGoldMined += b.goldPerCycle;
            sound.playGoldTick();
            this.spawnFloatingText(b.x, b.y - 18, `+${b.goldPerCycle}`, '#ffe082', 13);
            this.updatePinAffordabilityVisuals();
          } else {
            this.enemyGold += b.goldPerCycle;
          }
        }
        continue;
      }

      // 2. Unit Training Buildings + Green Circular Progress Meter (Exact match to Screenshot 1!)
      const card = CARDS[b.cardId];
      if (card && card.slotType === 'unit' && b.spawnInterval > 0) {
        const currentPop = b.team === 'player' ? playerPop : enemyPop;
        if (currentPop < MAX_POPULATION) {
          b.spawnTimer += dt;
          const pct = Math.min(1, b.spawnTimer / b.spawnInterval);
          this.drawRadialProgress(b.progressArc, pct, b.team === 'player' ? 0x00e676 : 0xff5252);

          if (b.spawnTimer >= b.spawnInterval) {
            b.spawnTimer -= b.spawnInterval;
            const spawnYOffset = b.team === 'player' ? -22 : 22;
            for (let i = 0; i < card.spawnCount; i++) {
              const spreadX = (i - (card.spawnCount - 1) * 0.5) * 18;
              this.spawnUnit(b.team, b.cardId, b.x + spreadX, b.y + spawnYOffset, false);
            }
          }
        } else {
          this.drawRadialProgress(b.progressArc, 1, 0xffca28);
        }
        continue;
      }

      // 3. Defensive Turrets & Main Command Center Auto-Fire!
      if (b.atk > 0 && b.range > 0) {
        const techLevel = b.team === 'player' ? this.playerTechLevel : this.enemyTechLevel;
        const speedMult = 1 + (techLevel - 1) * 0.06;
        b.attackTimer -= dt * speedMult;

        if (b.attackTimer <= 0) {
          const canAir = b.isCommandCenter ? true : Boolean(card?.canHitAir);
          const canGround = b.isCommandCenter ? true : Boolean(card?.canHitGround);
          const targetUnit = this.findBestUnitTarget(
            b.team,
            b.x,
            b.y,
            b.range,
            canAir,
            canGround,
            card || null
          );

          if (targetUnit) {
            b.attackTimer = b.attackInterval;
            const dmg = b.atk * (1 + (techLevel - 1) * 0.18);
            const pType = b.isCommandCenter ? 'cannon' : card?.projectileType || 'bullet';
            this.fireAttack(b.team, b.cardId, pType, b.x, b.y - 8, targetUnit, null, dmg, card?.splashRadius || 16);
          } else {
            b.attackTimer = 0.2;
          }
        }
      }
    }
  }

  private updateUnits(dt: number): void {
    const unitArray = Array.from(this.units.values());

    for (const u of unitArray) {
      if (u.hp <= 0) continue;

      // Parachute drop animation down to ground level
      if (u.dropProgress < 1) {
        u.dropProgress = Math.min(1, u.dropProgress + dt * 1.15);
        const altitude = (1 - u.dropProgress) * -46;
        u.sprite.y = altitude;
        if (u.parachute) {
          u.parachute.y = altitude - 18;
          u.parachute.rotation = Math.sin(this.elapsedSec * 7 + u.x) * 0.14;
        }
        if (u.dropProgress >= 1) {
          if (u.parachute) {
            u.parachute.destroy();
            u.parachute = undefined;
          }
          u.sprite.y = 0;
          if (!u.isFlying) {
            this.airUnitLayer.remove(u.container, false);
            this.groundUnitLayer.add(u.container);
          }
          this.spawnBurstParticles(u.x, u.y, 0xd7ccc8, 6);
          // Flip hex immediately upon landing!
          const landHex = worldToHex(u.x, u.y);
          const landCell = this.cells.get(hexKey(landHex.q, landHex.r));
          if (landCell && !landCell.isWater && !landCell.buildingId) {
            this.paintHexOwner(landCell, u.team);
          }
        }
        continue;
      }

      const techLevel = u.team === 'player' ? this.playerTechLevel : this.enemyTechLevel;
      const inFrenzy = this.elapsedSec < u.buffFrenzyUntil;
      const inShield = this.elapsedSec < u.buffShieldUntil;

      // Render active Commander Buff Aura rings!
      if (u.auraRing) {
        u.auraRing.clear();
        if (inFrenzy) {
          u.auraRing.lineStyle(2, 0x69f0ae, 0.8);
          u.auraRing.strokeCircle(0, 0, 17);
        }
        if (inShield) {
          u.auraRing.fillStyle(0xba68c8, 0.25);
          u.auraRing.lineStyle(2.2, 0xe040fb, 0.9);
          u.auraRing.fillCircle(0, 0, 19);
          u.auraRing.strokeCircle(0, 0, 19);
        }
      }

      const card = CARDS[u.cardId] || null;
      const scanRange = Math.max(u.range + 95, 210);

      // 1. Acquire nearest valid enemy unit OR enemy building
      const targetUnit = this.findBestUnitTarget(
        u.team,
        u.x,
        u.y,
        scanRange,
        u.canHitAir,
        u.canHitGround,
        card
      );

      let targetBldg: BuildingEntity | null = null;
      if (!targetUnit) {
        targetBldg = this.findNearestEnemyBuilding(u.team, u.x, u.y);
      }

      const tx = targetUnit ? targetUnit.x : targetBldg ? targetBldg.x : WORLD_WIDTH * 0.5;
      const ty = targetUnit ? targetUnit.y : targetBldg ? targetBldg.y : WORLD_HEIGHT * 0.5;
      const distToTarget = Math.hypot(tx - u.x, ty - u.y);
      const effectiveRange = targetBldg ? u.range + 18 : u.range;

      const facesLeftNatively =
        u.cardId === 'missile_car' || u.cardId === 'artillery_car' || u.cardId === 'jet_fighter';

      // 2. Attack if within range, otherwise advance & spread cleanly into isometric 3D battle line!
      const atkSpeedMult = (1 + (techLevel - 1) * 0.06) * (inFrenzy ? 1.42 : 1.0);
      u.attackTimer -= dt * atkSpeedMult;

      if ((targetUnit || targetBldg) && distToTarget <= effectiveRange) {
        const aimAngle = Math.atan2(ty - u.y, tx - u.x);
        const aimDx = Math.cos(aimAngle);
        if (Math.abs(aimDx) > 0.12) {
          const shouldFlip = facesLeftNatively ? aimDx > 0 : aimDx < 0;
          u.sprite.setFlipX(shouldFlip);
          if (u.shadow) u.shadow.setFlipX(shouldFlip);
        }
        u.sprite.setRotation(Phaser.Math.Clamp(aimDx * 0.1, -0.1, 0.1));

        if (u.attackTimer <= 0) {
          u.attackTimer = u.attackInterval;
          const dmg = u.atk * (1 + (techLevel - 1) * 0.18);
          const muzzleX = u.x + Math.cos(aimAngle) * 16;
          const muzzleY = u.y + Math.sin(aimAngle) * 14 - 4;
          this.fireAttack(
            u.team,
            u.cardId,
            u.projectileType,
            muzzleX,
            muzzleY,
            targetUnit,
            targetBldg,
            dmg,
            u.splashRadius
          );
          u.sprite.x = -Math.cos(aimAngle) * 3.2;
          u.sprite.y = -Math.sin(aimAngle) * 2.6;
        } else {
          u.sprite.x *= 0.8;
          u.sprite.y *= 0.8;
        }
      } else {
        // Advance toward target with smooth friendly unit separation (forms Red Alert tank battle line!)
        let dirX = tx - u.x;
        let dirY = ty - u.y;
        const len = Math.hypot(dirX, dirY) || 1;
        dirX /= len;
        dirY /= len;

        let sepX = 0;
        let sepY = 0;
        const desiredSpace = u.isFlying ? 26 : u.category === 'tank' ? 34 : 23;

        for (const other of unitArray) {
          if (other.id === u.id || other.isFlying !== u.isFlying || other.dropProgress < 1) continue;
          const dx = u.x - other.x;
          const dy = u.y - other.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.01 && d < desiredSpace) {
            const push = (desiredSpace - d) / desiredSpace;
            sepX += (dx / d) * push * 1.35;
            sepY += (dy / d) * push * 1.35;
          }
        }

        let moveX = dirX + sepX;
        let moveY = dirY + sepY;
        const mLen = Math.hypot(moveX, moveY) || 1;
        moveX /= mLen;
        moveY /= mLen;

        const speed = u.moveSpeed * (inFrenzy ? 1.35 : 1.0);
        const nextX = Phaser.Math.Clamp(u.x + moveX * speed * dt, 44, WORLD_WIDTH - 44);
        const nextY = Phaser.Math.Clamp(u.y + moveY * speed * dt, 64, WORLD_HEIGHT - 64);

        // Ground units steer lightly around ocean inlets
        const nextHex = worldToHex(nextX, nextY);
        const nextCell = this.cells.get(hexKey(nextHex.q, nextHex.r));
        if (!u.isFlying && nextCell?.isWater) {
          const centerPull = nextX < WORLD_WIDTH * 0.5 ? 1 : -1;
          u.x += centerPull * speed * dt;
          u.y = nextY;
        } else {
          u.x = nextX;
          u.y = nextY;
        }

        u.angle = Phaser.Math.Angle.RotateTo(u.angle, Math.atan2(moveY, moveX), dt * 7);
        if (Math.abs(moveX) > 0.14) {
          const shouldFlip = facesLeftNatively ? moveX > 0 : moveX < 0;
          u.sprite.setFlipX(shouldFlip);
          if (u.shadow) u.shadow.setFlipX(shouldFlip);
        }
        const bank = u.isFlying
          ? Phaser.Math.Clamp(moveX * 0.22, -0.22, 0.22)
          : Phaser.Math.Clamp(moveX * 0.08, -0.08, 0.08);
        u.sprite.setRotation(bank);
        u.sprite.x *= 0.8;
        u.sprite.y =
          u.category === 'infantry' || u.isFlying
            ? Math.sin(this.elapsedSec * 12 + u.x * 0.1) * 1.8
            : u.sprite.y * 0.8;
        if (u.shadow) {
          u.shadow.setRotation(bank);
        }

        u.container.setPosition(u.x, u.y);

        // Leave authentic tank/vehicle tire tracks on grass & sand (exact match to Screenshots 2 & 7!)
        if (!u.isFlying && (u.category === 'tank' || u.category === 'vehicle')) {
          u.lastTrackDist += speed * dt;
          if (u.lastTrackDist >= 13) {
            u.lastTrackDist = 0;
            this.treadMarks.push({ x: u.x, y: u.y, angle: u.angle, alpha: 0.34 });
            if (this.treadMarks.length > 160) this.treadMarks.shift();
          }
        }

        // Paint Hex Territory color when stepping onto open tiles!
        if (nextCell && !nextCell.isWater && !nextCell.buildingId && nextCell.owner !== u.team) {
          this.paintHexOwner(nextCell, u.team);
        }
      }
    }
  }

  private paintHexOwner(cell: HexCell, newOwner: Team): void {
    if (cell.isWater || cell.owner === newOwner) return;
    cell.owner = newOwner;
    if (cell.tileSprite) {
      const variant = (cell.q + cell.r) % 2;
      cell.tileSprite.setTexture(newOwner === 'player' ? `hex_grass_${variant}` : `hex_sand_${variant}`);
    }
  }

  private findBestUnitTarget(
    myTeam: Team,
    x: number,
    y: number,
    maxDist: number,
    canHitAir: boolean,
    canHitGround: boolean,
    attackerCard: CardDef | null
  ): UnitEntity | null {
    let best: UnitEntity | null = null;
    let bestEffectiveScore = Infinity;

    for (const u of this.units.values()) {
      if (u.team === myTeam || u.hp <= 0 || u.dropProgress < 1) continue;
      if (u.isFlying && !canHitAir) continue;
      if (!u.isFlying && !canHitGround) continue;

      const d = Math.hypot(u.x - x, u.y - y);
      if (d > maxDist) continue;

      // Smart target prioritization: prefer units this attacker HARD COUNTERS within range!
      const counterInfo = calculateCounterMultiplier(attackerCard, u.category);
      const priorityBias = counterInfo.isHardCounter ? 0.58 : 1.0;
      const effectiveDist = d * priorityBias;

      if (effectiveDist < bestEffectiveScore) {
        bestEffectiveScore = effectiveDist;
        best = u;
      }
    }
    return best;
  }

  private findNearestEnemyBuilding(myTeam: Team, x: number, y: number): BuildingEntity | null {
    let best: BuildingEntity | null = null;
    let bestDist = Infinity;
    for (const b of this.buildings.values()) {
      if (b.team === myTeam || b.hp <= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  // =========================================================================
  // WEAPON FIRING, PRISM LASER CHAINING, COUNTER DAMAGE & EXPLOSIONS
  // =========================================================================
  private fireAttack(
    team: Team,
    attackerCardId: string,
    projectileType: string,
    sx: number,
    sy: number,
    targetUnit: UnitEntity | null,
    targetBldg: BuildingEntity | null,
    damage: number,
    splashRadius: number
  ): void {
    sound.playWeapon(projectileType);
    const tx = targetUnit ? targetUnit.x : targetBldg ? targetBldg.x : sx;
    const ty = targetUnit ? targetUnit.y : targetBldg ? targetBldg.y : sy;

    // Instant Refracting Prism Laser Beam (chains up to 2 extra enemies!)
    if (projectileType === 'prism') {
      const beamColor = team === 'player' ? 0x00e5ff : 0xff4081;
      this.prismBeams.push({ x1: sx, y1: sy, x2: tx, y2: ty, alpha: 1.0, color: beamColor });
      if (targetUnit) {
        this.damageUnit(targetUnit, damage, attackerCardId);
        // Chain up to 2 nearby enemy units!
        let chained = 0;
        for (const extra of this.units.values()) {
          if (chained >= 2) break;
          if (extra.team !== team && extra.id !== targetUnit.id && extra.hp > 0) {
            if (Math.hypot(extra.x - tx, extra.y - ty) < 88) {
              this.prismBeams.push({ x1: tx, y1: ty, x2: extra.x, y2: extra.y, alpha: 0.85, color: beamColor });
              this.damageUnit(extra, damage * 0.55, attackerCardId);
              chained++;
            }
          }
        }
      } else if (targetBldg) {
        this.damageBuilding(targetBldg, damage, attackerCardId);
      }
      return;
    }

    // Additive WebGL Muzzle Flash at gun barrel / missile pod!
    const muzzle = this.add
      .image(sx, sy, 'fx_muzzle')
      .setDisplaySize(projectileType === 'cannon' || projectileType === 'artillery' ? 28 : 20, projectileType === 'cannon' || projectileType === 'artillery' ? 28 : 20)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.projectileLayer.add(muzzle);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 0.25,
      duration: 110,
      onComplete: () => muzzle.destroy(),
    });

    const texKey =
      projectileType === 'missile'
        ? 'proj_missile'
        : projectileType === 'cannon' || projectileType === 'artillery' || projectileType === 'bomb'
          ? 'proj_shell'
          : 'proj_bullet';

    const speed =
      projectileType === 'bullet' || projectileType === 'heavy_mg'
        ? 540
        : projectileType === 'missile'
          ? 375
          : 330;

    const projSprite = this.add
      .image(sx, sy, texKey)
      .setRotation(Math.atan2(ty - sy, tx - sx))
      .setScale(projectileType === 'artillery' || projectileType === 'bomb' ? 0.72 : 0.56);
    this.projectileLayer.add(projSprite);

    this.projectiles.push({
      id: `p_${this.idCounter++}`,
      team,
      attackerCardId,
      type: projectileType,
      x: sx,
      y: sy,
      targetX: tx,
      targetY: ty,
      targetUnitId: targetUnit ? targetUnit.id : null,
      targetBuildingId: targetBldg ? targetBldg.id : null,
      speed,
      damage,
      splashRadius,
      sprite: projSprite,
    });
  }

  private updateProjectilesAndEffects(dt: number): void {
    // 1. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.targetUnitId) {
        const tu = this.units.get(p.targetUnitId);
        if (tu && tu.hp > 0) {
          p.targetX = tu.x;
          p.targetY = tu.y;
        }
      } else if (p.targetBuildingId) {
        const tb = this.buildings.get(p.targetBuildingId);
        if (tb && tb.hp > 0) {
          p.targetX = tb.x;
          p.targetY = tb.y;
        }
      }

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step + 8) {
        // Impact!
        if (p.splashRadius > 0) {
          this.applySplashDamage(p.team, p.attackerCardId, p.targetX, p.targetY, p.splashRadius, p.damage);
          if (p.type === 'cannon' || p.type === 'artillery' || p.type === 'bomb') {
            this.spawnExplosionVisual(p.targetX, p.targetY, p.splashRadius, false);
          } else {
            this.spawnBurstParticles(p.targetX, p.targetY, 0xffab40, 4);
          }
        } else {
          const tu = p.targetUnitId ? this.units.get(p.targetUnitId) : null;
          const tb = p.targetBuildingId ? this.buildings.get(p.targetBuildingId) : null;
          if (tu && tu.hp > 0) {
            this.damageUnit(tu, p.damage, p.attackerCardId);
          } else if (tb && tb.hp > 0) {
            this.damageBuilding(tb, p.damage, p.attackerCardId);
          }
          this.spawnBurstParticles(p.targetX, p.targetY, 0xfff59d, 3);
        }

        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.sprite.setPosition(p.x, p.y);
        p.sprite.setRotation(Math.atan2(dy, dx));
        if (p.type === 'missile' && Math.random() < 0.55) {
          const puff = this.add.image(p.x, p.y, 'fx_puff').setDisplaySize(9, 9).setAlpha(0.58);
          this.projectileLayer.add(puff);
          this.tweens.add({
            targets: puff,
            alpha: 0,
            scale: 0.45,
            duration: 260,
            onComplete: () => puff.destroy(),
          });
        }
      }
    }

    // 2. Render & Fade Prism Laser Beams
    this.effectGraphics.clear();
    for (let i = this.prismBeams.length - 1; i >= 0; i--) {
      const beam = this.prismBeams[i];
      beam.alpha -= dt * 4.2;
      if (beam.alpha <= 0) {
        this.prismBeams.splice(i, 1);
        continue;
      }
      this.effectGraphics.lineStyle(6, beam.color, beam.alpha * 0.45);
      this.effectGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
      this.effectGraphics.lineStyle(2.4, 0xffffff, beam.alpha);
      this.effectGraphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    }

    // 3. Render Fading Vehicle Tire/Tank Treads on Ground
    this.trackGraphics.clear();
    for (let i = this.treadMarks.length - 1; i >= 0; i--) {
      const tr = this.treadMarks[i];
      tr.alpha -= dt * 0.035;
      if (tr.alpha <= 0) {
        this.treadMarks.splice(i, 1);
        continue;
      }
      const nx = -Math.sin(tr.angle) * 7;
      const ny = Math.cos(tr.angle) * 7;
      const fx = Math.cos(tr.angle) * 4;
      const fy = Math.sin(tr.angle) * 4;
      this.trackGraphics.lineStyle(2.4, 0x4e432e, tr.alpha);
      this.trackGraphics.lineBetween(tr.x + nx - fx, tr.y + ny - fy, tr.x + nx + fx, tr.y + ny + fy);
      this.trackGraphics.lineBetween(tr.x - nx - fx, tr.y - ny - fy, tr.x - nx + fx, tr.y - ny + fy);
    }
  }

  private applySplashDamage(
    attackerTeam: Team,
    attackerCardId: string,
    cx: number,
    cy: number,
    radius: number,
    baseDamage: number
  ): void {
    const attackerCard = CARDS[attackerCardId] || null;
    for (const u of Array.from(this.units.values())) {
      if (u.team === attackerTeam || u.hp <= 0) continue;
      if (u.isFlying && attackerCard && !attackerCard.canHitAir) continue;
      const d = Math.hypot(u.x - cx, u.y - cy);
      if (d <= radius + 12) {
        const falloff = d <= radius * 0.5 ? 1.0 : 0.72;
        this.damageUnit(u, baseDamage * falloff, attackerCardId);
      }
    }

    for (const b of Array.from(this.buildings.values())) {
      if (b.team === attackerTeam || b.hp <= 0) continue;
      const d = Math.hypot(b.x - cx, b.y - cy);
      if (d <= radius + 24) {
        this.damageBuilding(b, baseDamage, attackerCardId);
      }
    }
  }

  private damageUnit(target: UnitEntity, rawDamage: number, attackerCardId: string): void {
    if (target.hp <= 0) return;
    const attackerCard = CARDS[attackerCardId] || null;
    const counter = calculateCounterMultiplier(attackerCard, target.category);
    let finalDmg = rawDamage * counter.multiplier;

    if (this.elapsedSec < target.buffShieldUntil) {
      finalDmg *= 0.3; // Natasha Iron Curtain 70% damage reduction!
    }

    target.hp -= finalDmg;

    // Show crisp "克制!" badge periodically when hard counter occurs so player sees counter mechanics in action!
    if (counter.isHardCounter && Math.random() < 0.28) {
      this.spawnFloatingText(target.x, target.y - 20, '克制!', '#ffab00', 11);
    }

    if (target.hp <= 0) {
      if (target.team === 'enemy') this.enemyUnitsKilled++;
      sound.playExplosion(target.category === 'tank');
      this.spawnExplosionVisual(target.x, target.y, target.category === 'tank' ? 32 : 20, false);
      target.container.destroy();
      this.units.delete(target.id);
    } else {
      this.drawEntityHpBar(target.hpBar, target.hp, target.maxHp, 26, -20, target.team === 'player');
    }
  }

  private damageBuilding(target: BuildingEntity, rawDamage: number, attackerCardId: string): void {
    if (target.hp <= 0) return;
    const attackerCard = CARDS[attackerCardId] || null;
    const counter = calculateCounterMultiplier(attackerCard, target.category);
    const finalDmg = rawDamage * counter.multiplier;

    target.hp -= finalDmg;

    if (target.hp <= 0) {
      sound.playExplosion(true);
      this.spawnExplosionVisual(target.x, target.y, 48, true);

      const cell = this.cells.get(hexKey(target.q, target.r));
      if (cell) {
        cell.buildingId = null;
        cell.rubbleUntil = this.elapsedSec + 14;
        cell.rubbleSprite?.destroy();
        cell.rubbleSprite = this.add.image(cell.x, cell.y + 2, 'rubble_pile').setDisplaySize(56, 56);
        this.terrainLayer.add(cell.rubbleSprite);
        this.paintHexOwner(cell, target.team === 'player' ? 'enemy' : 'player');
      }

      target.container.destroy();
      this.buildings.delete(target.id);

      this.redrawFortressWalls();
      this.refreshBuildPins('player');
      this.refreshBuildPins('enemy');
    } else {
      this.drawEntityHpBar(target.hpBar, target.hp, target.maxHp, 38, -32, target.team === 'player');
    }
  }

  // =========================================================================
  // VISUAL HELPERS, FLOATING TEXT, PARTICLES & MINIMAP
  // =========================================================================
  private drawRadialProgress(g: Phaser.GameObjects.Graphics, pct: number, color: number): void {
    g.fillStyle(0x0d1b2a, 0.72);
    g.fillCircle(0, 10, 9.5);
    g.lineStyle(3.2, color, 1);
    g.beginPath();
    g.arc(0, 10, 7, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2, false);
    g.strokePath();
  }

  private drawEntityHpBar(
    g: Phaser.GameObjects.Graphics,
    hp: number,
    maxHp: number,
    w: number,
    offsetY: number,
    isFriendly: boolean
  ): void {
    g.clear();
    if (hp >= maxHp) return;
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    const h = 4.5;
    g.fillStyle(0x11171a, 0.88);
    g.fillRoundedRect(-w / 2 - 1, offsetY - 1, w + 2, h + 2, 2);
    g.fillStyle(isFriendly ? 0x69f0ae : 0xff5252, 1);
    g.fillRoundedRect(-w / 2, offsetY, Math.max(2, w * ratio), h, 1.5);
  }

  private spawnExplosionVisual(x: number, y: number, radius: number, shakeCam: boolean): void {
    const fb = this.add
      .image(x, y, 'fx_fireball')
      .setDisplaySize(radius * 1.6, radius * 1.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(26);

    this.tweens.add({
      targets: fb,
      scaleX: fb.scaleX * 1.75,
      scaleY: fb.scaleY * 1.75,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => fb.destroy(),
    });

    this.spawnBurstParticles(x, y, 0xff9100, shakeCam ? 12 : 6);
    if (shakeCam) {
      this.cameras.main.shake(140, 0.004);
    }
  }

  private spawnBurstParticles(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 16 + Math.random() * 26;
      const dot = this.add
        .image(x, y, 'particle_dot')
        .setTint(color)
        .setScale(0.32 + Math.random() * 0.25);
      this.floatTextLayer.add(dot);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scaleX: 0.08,
        scaleY: 0.08,
        duration: 280 + Math.random() * 160,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, fontSize: number): void {
    const txt = this.add
      .text(x, y, text, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color,
        stroke: '#101820',
        strokeThickness: 3.5,
      })
      .setOrigin(0.5);
    this.floatTextLayer.add(txt);
    this.tweens.add({
      targets: txt,
      y: y - 24,
      alpha: 0,
      duration: 820,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  private countTerritoryTiles(): { playerTiles: number; enemyTiles: number } {
    let playerTiles = 0;
    let enemyTiles = 0;
    for (const c of this.cells.values()) {
      if (c.isWater) continue;
      if (c.owner === 'player') playerTiles++;
      else enemyTiles++;
    }
    return { playerTiles, enemyTiles };
  }

  private checkMatchEnd(): void {
    let playerHasCmd = false;
    let enemyHasCmd = false;
    for (const b of this.buildings.values()) {
      if (b.isCommandCenter) {
        if (b.team === 'player') playerHasCmd = true;
        if (b.team === 'enemy') enemyHasCmd = true;
      }
    }

    if (!enemyHasCmd) {
      this.finishMatch(true, '成功摧毁敌军主基地！');
      return;
    }
    if (!playerHasCmd) {
      this.finishMatch(false, '我方主基地已被敌军摧毁！');
      return;
    }

    if (this.timeRemainingSec <= 0) {
      const { playerTiles, enemyTiles } = this.countTerritoryTiles();
      if (this.configData?.mode === 'coop') {
        this.finishMatch(true, `坚守成功！击退全部红警波次并占领 ${playerTiles} 格领地！`);
      } else if (playerTiles >= enemyTiles) {
        this.finishMatch(true, `时间结束，领地压制获胜（${playerTiles}格 vs ${enemyTiles}格）！`);
      } else {
        this.finishMatch(false, `时间结束，领地格数落后（${playerTiles}格 vs ${enemyTiles}格）`);
      }
    }
  }

  private finishMatch(won: boolean, reason: string): void {
    this.matchEnded = true;
    sound.stopBGM();
    sound.playVictory(won);

    const { playerTiles, enemyTiles } = this.countTerritoryTiles();
    this.configData?.onBattleEnd({
      won,
      reason,
      durationSec: Math.round(this.elapsedSec),
      playerTiles,
      enemyTiles,
      kills: this.enemyUnitsKilled,
      buildingsBuilt: this.buildingsBuilt,
      goldMined: Math.round(this.totalGoldMined),
      mode: this.configData?.mode || 'pvp',
    });
  }

  private renderMinimap(): void {
    const dpr = this.getDpr();
    const g = this.minimapGraphics;
    g.clear();
    const vw = this.scale.width;
    const vh = this.scale.height;
    const mapW = 44 * dpr;
    const mapH = 132 * dpr;
    const mx = vw - mapW - 8 * dpr;
    const my = Math.max(108 * dpr, vh * 0.5 - mapH * 0.5);

    g.fillStyle(0x0b1622, 0.78);
    g.lineStyle(1.5 * dpr, 0x64b5f6, 0.75);
    g.fillRoundedRect(mx, my, mapW, mapH, 6 * dpr);
    g.strokeRoundedRect(mx, my, mapW, mapH, 6 * dpr);

    const sx = mapW / WORLD_WIDTH;
    const sy = mapH / WORLD_HEIGHT;

    for (const c of this.cells.values()) {
      if (c.isWater) continue;
      g.fillStyle(c.owner === 'player' ? 0x7cb342 : 0xdca85e, 0.65);
      g.fillRect(mx + c.x * sx - 1.5 * dpr, my + c.y * sy - 1.5 * dpr, 3 * dpr, 3 * dpr);
    }

    for (const b of this.buildings.values()) {
      g.fillStyle(b.team === 'player' ? 0x29b6f6 : 0xff5252, 1);
      g.fillCircle(mx + b.x * sx, my + b.y * sy, (b.isCommandCenter ? 3.2 : 2.1) * dpr);
    }

    for (const u of this.units.values()) {
      g.fillStyle(u.team === 'player' ? 0xe1f5fe : 0xffab91, 0.95);
      g.fillRect(mx + u.x * sx - 1 * dpr, my + u.y * sy - 1 * dpr, 2 * dpr, 2 * dpr);
    }

    const cam = this.cameras.main;
    const viewY = Phaser.Math.Clamp(cam.worldView.y * sy, 0, mapH - 16 * dpr);
    const viewH = Phaser.Math.Clamp(cam.worldView.height * sy, 14 * dpr, mapH);
    g.lineStyle(1.4 * dpr, 0xffffff, 0.9);
    g.strokeRect(mx + 2 * dpr, my + viewY, mapW - 4 * dpr, Math.min(viewH, mapH - viewY));
  }

  private pushHudState(): void {
    if (!this.configData) return;
    const { playerTiles, enemyTiles } = this.countTerritoryTiles();

    let incomePerSec = 2.2;
    for (const b of this.buildings.values()) {
      if (b.team === 'player' && b.cardId === 'gold_mine' && b.spawnInterval > 0) {
        incomePerSec += b.goldPerCycle / b.spawnInterval;
      }
    }

    this.configData.onHudUpdate({
      mode: this.configData.mode,
      timeRemainingSec: this.timeRemainingSec,
      playerTiles,
      enemyTiles,
      playerPop: this.countTeamPop('player'),
      playerMaxPop: MAX_POPULATION,
      enemyPop: this.countTeamPop('enemy'),
      enemyMaxPop: MAX_POPULATION,
      playerGold: Math.floor(this.playerGold),
      playerGoldPerSec: Number(incomePerSec.toFixed(1)),
      techLevel: this.playerTechLevel,
      techCost: this.getTechUpgradeCost(this.playerTechLevel),
      paratrooperCd: this.paratrooperCd,
      paratrooperMaxCd: this.paratrooperMaxCd,
      paratrooperTargeting: this.paratrooperTargeting,
      enemyParatrooperCd: Math.max(0, Math.ceil(this.enemyParatrooperCd)),
      commanderCd: this.commanderCd,
      commanderMaxCd: this.commanderMaxCd,
      gameSpeed: this.gameSpeed,
      coopWave: Math.min(this.coopWave, this.coopMaxWave),
      coopMaxWave: this.coopMaxWave,
      playerUnitsSpawned: this.playerUnitsSpawned,
      enemyUnitsKilled: this.enemyUnitsKilled,
      buildingsBuilt: this.buildingsBuilt,
      totalGoldMined: Math.round(this.totalGoldMined),
    });
  }
}
