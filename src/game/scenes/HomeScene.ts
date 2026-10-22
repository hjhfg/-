import Phaser from 'phaser';
import { sound } from '../../audio/SoundManager';

interface SnowFlake {
  spr: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  wobble: number;
}

/**
 * Interactive 60 FPS Phaser 3 WebGL Home Screen 3D Snowy Watchtower Diorama Scene.
 * Renders the blueprint tactical backdrop, glowing aura, floating 3D Watchtower Hex Island,
 * drifting snow particles, patrol units, supersonic jet flybys, and interactive touch bounce!
 */
export class HomeScene extends Phaser.Scene {
  private islandContainer!: Phaser.GameObjects.Container;
  private islandSprite!: Phaser.GameObjects.Image;
  private islandShadow!: Phaser.GameObjects.Ellipse;
  private auraGlow!: Phaser.GameObjects.Image;
  private jetPatrol!: Phaser.GameObjects.Image;
  private jetShadow!: Phaser.GameObjects.Image;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private snowFlakes: SnowFlake[] = [];
  private baseCenterY = 0;
  private tiltOffsetX = 0;
  private tiltOffsetY = 0;
  private jetTimer = 1.0;

  constructor() {
    super({ key: 'HomeScene' });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.baseCenterY = Math.round(h * 0.372);

    // 1. Tactical Blueprint Gradient & Subtle Engineering Grid (Matches Screenshot 4!)
    this.bgGraphics = this.add.graphics();
    this.drawBlueprintBackdrop(w, h);

    // 2. Ambient Cold-Ice Glow + Pedestal Drop Shadow
    const dprBg = Math.min(window.devicePixelRatio || 2, 2);
    this.auraGlow = this.add
      .image(w / 2, this.baseCenterY, 'fx_puff')
      .setDisplaySize(Math.min(w * 0.92, 390 * dprBg), Math.min(w * 0.82, 340 * dprBg))
      .setTint(0x7ac4ff)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.islandShadow = this.add.ellipse(
      w / 2,
      this.baseCenterY + Math.min(w * 0.3, 126 * dprBg),
      Math.min(w * 0.68, 286 * dprBg),
      56 * dprBg,
      0x0b1630,
      0.58
    );

    // 3. 3D Snowy Mountain Watchtower Island Diorama Container
    const dprScale = Math.min(window.devicePixelRatio || 2, 2);
    this.islandContainer = this.add.container(w / 2, this.baseCenterY);
    const targetIslandSize = Math.min(w * 0.72, h * 0.4, 320 * dprScale);
    this.islandSprite = this.add.image(0, 0, 'island_diorama');
    const islandScale = targetIslandSize / Math.max(this.islandSprite.width, this.islandSprite.height);
    this.islandSprite.setScale(islandScale);

    // Miniature 3D Allied Tank & Rocketeer patrolling the snowy bridge & mountain ridge!
    const miniTank = this.add
      .image(-targetIslandSize * 0.11, targetIslandSize * 0.16, 'unit_rhino_tank_blue')
      .setDisplaySize(32 * dprScale, 32 * dprScale);
    const miniFlyer = this.add
      .image(targetIslandSize * 0.18, -targetIslandSize * 0.16, 'unit_jetpack_trooper_blue')
      .setFlipX(true)
      .setDisplaySize(30 * dprScale, 30 * dprScale);

    this.tweens.add({
      targets: miniFlyer,
      y: miniFlyer.y - 9,
      x: miniFlyer.x - 6,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: miniTank,
      x: miniTank.x + 14,
      y: miniTank.y + 7,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onYoyo: () => miniTank.setFlipX(true),
      onRepeat: () => miniTank.setFlipX(false),
    });

    this.islandContainer.add([this.islandSprite, miniTank, miniFlyer]);

    // Interactive touch / click bounce on the 3D Island
    this.islandSprite.setInteractive({ useHandCursor: true });
    this.islandSprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      sound.unlock();
      sound.playBuild();
      this.tweens.add({
        targets: this.islandContainer,
        scaleX: 1.055,
        scaleY: 0.96,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      this.spawnTapSparkles(pointer.x, pointer.y);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.tiltOffsetX = ((pointer.x - w / 2) / Math.max(1, w / 2)) * 8;
      this.tiltOffsetY = ((pointer.y - this.baseCenterY) / Math.max(1, h / 2)) * 5;
    });

    // 4. Supersonic Fighter Flyby Layer
    this.jetShadow = this.add
      .image(-120, this.baseCenterY + 50 * dprScale, 'unit_jet_fighter_blue')
      .setDisplaySize(44 * dprScale, 44 * dprScale)
      .setFlipX(true)
      .setTint(0x000000)
      .setAlpha(0.26);
    this.jetPatrol = this.add
      .image(-120, this.baseCenterY + 12 * dprScale, 'unit_jet_fighter_blue')
      .setDisplaySize(50 * dprScale, 50 * dprScale)
      .setFlipX(true);

    // 5. Gentle 60 FPS Snowfall Particles
    this.snowFlakes = [];
    for (let i = 0; i < 34; i++) {
      const sz = Phaser.Math.Between(4 * dprScale, 10 * dprScale);
      const spr = this.add
        .image(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), 'fx_puff')
        .setDisplaySize(sz, sz)
        .setAlpha(Phaser.Math.FloatBetween(0.28, 0.76));
      this.snowFlakes.push({
        spr,
        vx: Phaser.Math.FloatBetween(-12, 16),
        vy: Phaser.Math.FloatBetween(18, 42),
        wobble: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
    }

    this.scale.on('resize', this.handleResize, this);
  }

  private drawBlueprintBackdrop(w: number, h: number): void {
    this.bgGraphics.clear();
    this.bgGraphics.fillGradientStyle(0x4f74bf, 0x4f74bf, 0x3b5ba1, 0x2f4b8c, 1);
    this.bgGraphics.fillRect(0, 0, w, h);

    this.bgGraphics.lineStyle(1, 0x8db4ff, 0.11);
    for (let x = 0; x < w; x += 36) {
      this.bgGraphics.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y < h; y += 36) {
      this.bgGraphics.lineBetween(0, y, w, y);
    }

    this.bgGraphics.lineStyle(12, 0x7aa4f5, 0.06);
    for (let i = -2; i < 6; i++) {
      const sx = (i * 150) % (w + 120);
      const sy = ((i * 210) + 120) % (h + 100);
      this.bgGraphics.lineBetween(sx, sy, sx + 38, sy + 38);
      this.bgGraphics.lineBetween(sx + 26, sy - 14, sx + 54, sy + 14);
    }
  }

  private spawnTapSparkles(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const sp = this.add
        .image(x, y, 'fx_muzzle')
        .setDisplaySize(24, 24)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ang = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
      const dist = Phaser.Math.Between(24, 56);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.05,
        duration: 420,
        onComplete: () => sp.destroy(),
      });
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const w = gameSize.width;
    const h = gameSize.height;
    this.baseCenterY = Math.round(h * 0.372);
    this.drawBlueprintBackdrop(w, h);
    if (this.auraGlow) {
      this.auraGlow.setPosition(w / 2, this.baseCenterY);
    }
    if (this.islandShadow) {
      this.islandShadow.setPosition(w / 2, this.baseCenterY + Math.min(w * 0.3, 126));
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const w = this.scale.width;
    const h = this.scale.height;
    const floatY = Math.sin(time * 0.0021) * 5.5;

    if (this.islandContainer) {
      this.islandContainer.x = Phaser.Math.Linear(this.islandContainer.x, w / 2 + this.tiltOffsetX, 0.08);
      this.islandContainer.y = Phaser.Math.Linear(this.islandContainer.y, this.baseCenterY + floatY + this.tiltOffsetY, 0.08);
      this.islandContainer.rotation = this.tiltOffsetX * 0.004;
    }
    if (this.islandShadow) {
      const sFactor = 1 - floatY * 0.008;
      this.islandShadow.setScale(sFactor, sFactor);
    }
    if (this.auraGlow) {
      this.auraGlow.setAlpha(0.24 + Math.sin(time * 0.003) * 0.06);
    }

    this.jetTimer -= dt;
    if (this.jetTimer <= 0) {
      if (this.jetPatrol.x > w + 130 || this.jetPatrol.x < -110) {
        this.jetPatrol.setPosition(-90, this.baseCenterY + Phaser.Math.Between(-90, 40));
      }
      this.jetPatrol.x += 180 * dt;
      this.jetPatrol.y -= 28 * dt;
      this.jetShadow.setPosition(this.jetPatrol.x + 12, this.jetPatrol.y + 42);

      if (Math.random() < 0.45) {
        const trail = this.add
          .image(this.jetPatrol.x - 18, this.jetPatrol.y + 3, 'fx_puff')
          .setDisplaySize(9, 9)
          .setAlpha(0.5);
        this.tweens.add({
          targets: trail,
          alpha: 0,
          scale: 0.55,
          duration: 360,
          onComplete: () => trail.destroy(),
        });
      }

      if (this.jetPatrol.x > w + 120) {
        this.jetTimer = 4.2;
      }
    }

    for (const f of this.snowFlakes) {
      f.wobble += dt * 2.2;
      f.spr.x += (f.vx + Math.sin(f.wobble) * 14) * dt;
      f.spr.y += f.vy * dt;
      if (f.spr.y > h + 12) {
        f.spr.y = -12;
        f.spr.x = Phaser.Math.Between(0, w);
      }
      if (f.spr.x < -12) f.spr.x = w + 12;
      if (f.spr.x > w + 12) f.spr.x = -12;
    }
  }
}
