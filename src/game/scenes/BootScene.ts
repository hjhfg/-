import Phaser from 'phaser';
import { STUDIO_ASSETS } from '../../assets/studioAssets';
import { registerVfxTextures } from '../../art/RedAlertArt';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2d487e, 0x2d487e, 0x1a2c54, 0x1a2c54, 1);
    bg.fillRect(0, 0, w, h);

    const barW = Math.min(280, w * 0.72);
    const barH = 14;
    const bx = (w - barW) / 2;
    const by = h * 0.54;

    const label = this.add
      .text(w / 2, by - 26, '正在加载 3D 军团美术资源...', {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffe17d',
        stroke: '#0d1830',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const frame = this.add.graphics();
    frame.fillStyle(0x0f1b36, 0.92);
    frame.fillRoundedRect(bx - 3, by - 3, barW + 6, barH + 6, 8);
    frame.lineStyle(2, 0x6ea8ff, 0.8);
    frame.strokeRoundedRect(bx - 3, by - 3, barW + 6, barH + 6, 8);

    const fill = this.add.graphics();
    this.load.on('progress', (val: number) => {
      fill.clear();
      fill.fillStyle(0xf8b92a, 1);
      fill.fillRoundedRect(bx, by, Math.max(8, barW * val), barH, 6);
    });

    for (const [key, dataUrl] of Object.entries(STUDIO_ASSETS)) {
      if (!this.textures.exists(key)) {
        this.load.image(key, dataUrl);
      }
    }

    this.load.once('complete', () => {
      bg.destroy();
      label.destroy();
      frame.destroy();
      fill.destroy();
    });
  }

  create(): void {
    // Enable smooth trilinear/linear filtering on all HD 3D sprites
    for (const key of Object.keys(STUDIO_ASSETS)) {
      const tex = this.textures.get(key);
      if (tex) {
        tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }
    registerVfxTextures(this);

    this.scene.start('HomeScene');
    window.dispatchEvent(new CustomEvent('legion-engine-ready'));
  }
}
