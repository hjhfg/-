import Phaser from 'phaser';
import './styles/game.css';
import { BootScene } from './game/scenes/BootScene';
import { HomeScene } from './game/scenes/HomeScene';
import { BattleScene, type StartMatchConfig } from './game/scenes/BattleScene';
import { GameUI } from './ui/GameUI';

const phaserContainer = document.getElementById('phaser-container')!;
const uiLayer = document.getElementById('ui-layer')!;

const dpr = Math.min(window.devicePixelRatio || 2, 2);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: phaserContainer,
  backgroundColor: '#3b5ba1',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1 / dpr,
    width: (phaserContainer.clientWidth || 412) * dpr,
    height: (phaserContainer.clientHeight || 860) * dpr,
  },
  render: {
    antialias: true,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    pixelArt: false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, HomeScene, BattleScene],
});

// Keep Retina backing resolution sharp across mobile rotation / window resize
window.addEventListener('resize', () => {
  const nw = (phaserContainer.clientWidth || window.innerWidth) * dpr;
  const nh = (phaserContainer.clientHeight || window.innerHeight) * dpr;
  game.scale.resize(nw, nh);
});

const getBattleScene = (): BattleScene | null => {
  const scene = game.scene.getScene('BattleScene') as BattleScene | undefined;
  return scene || null;
};

const launchEngineBattle = (cfg: StartMatchConfig): void => {
  if (game.scene.isActive('HomeScene')) {
    game.scene.sleep('HomeScene');
  }
  const existing = game.scene.getScene('BattleScene') as BattleScene | undefined;
  if (existing && game.scene.isActive('BattleScene')) {
    existing.startNewMatch(cfg);
  } else {
    game.scene.start('BattleScene', { matchConfig: cfg });
  }
};

const returnToEngineHome = (): void => {
  const bScene = getBattleScene();
  if (bScene && game.scene.isActive('BattleScene')) {
    bScene.stopToBackdrop();
    game.scene.stop('BattleScene');
  }
  if (game.scene.isSleeping('HomeScene')) {
    game.scene.wake('HomeScene');
  } else if (!game.scene.isActive('HomeScene')) {
    game.scene.start('HomeScene');
  }
};

new GameUI(uiLayer, getBattleScene, launchEngineBattle, returnToEngineHome);
