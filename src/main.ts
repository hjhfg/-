import Phaser from 'phaser';
import './styles/game.css';
import { BootScene } from './game/scenes/BootScene';
import { BattleScene } from './game/scenes/BattleScene';
import { GameUI } from './ui/GameUI';

const phaserContainer = document.getElementById('phaser-container')!;
const uiLayer = document.getElementById('ui-layer')!;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: phaserContainer,
  backgroundColor: '#1e9bc9',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: phaserContainer.clientWidth || 412,
    height: phaserContainer.clientHeight || 860,
  },
  render: {
    antialias: true,
    pixelArt: false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, BattleScene],
});

const getBattleScene = (): BattleScene | null => {
  const scene = game.scene.getScene('BattleScene') as BattleScene | undefined;
  return scene || null;
};

new GameUI(uiLayer, getBattleScene);
