import Phaser from 'phaser';
import { registerPhaserTextures } from '../../art/RedAlertArt';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  public create(): void {
    registerPhaserTextures(this);
    this.scene.start('BattleScene', { idleBackdrop: true });
  }
}
