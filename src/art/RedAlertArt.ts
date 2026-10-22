import type Phaser from 'phaser';
import { HEX_RADIUS, getHexVertices } from '../game/HexMath';

/** All Phaser canvas textures are rendered at 2x retina density; multiply world display scale by 0.5! */
export const TEX_SCALE = 0.5;

const cardArtCache = new Map<string, string>();
const avatarArtCache = new Map<string, string>();

export interface FactionPalette {
  main: string;
  light: string;
  dark: string;
  accent: string;
  trim: string;
}

export const BLUE_PALETTE: FactionPalette = {
  main: '#2979ff',
  light: '#75b7ff',
  dark: '#143d8a',
  accent: '#00e5ff',
  trim: '#e3f2fd',
};

export const RED_PALETTE: FactionPalette = {
  main: '#e53935',
  light: '#ff7961',
  dark: '#881318',
  accent: '#ffca28',
  trim: '#eceff1',
};

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draw crisp Red Alert stylized unit/building illustration centered at (0,0) scaled to `s`
 * Used BOTH for 3/4 Card Artwork in UI AND crisp Retina Phaser battlefield sprites!
 */
export function drawUnitOrBuildingArt(
  ctx: CanvasRenderingContext2D,
  cardId: string,
  pal: FactionPalette,
  scale = 1,
  withTurret = true
): void {
  ctx.save();
  ctx.scale(scale, scale);

  if (cardId === 'rhino_tank') {
    // Classic Red Alert Heavy Main Battle Tank (Symmetric hull for clean 360 rotation!)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dual tracks
    ctx.fillStyle = '#263238';
    roundRectPath(ctx, -21, -16, 42, 8.5, 3);
    ctx.fill();
    roundRectPath(ctx, -21, 7.5, 42, 8.5, 3);
    ctx.fill();
    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 1.4;
    for (let tx = -16; tx <= 16; tx += 6) {
      ctx.beginPath();
      ctx.moveTo(tx, -16);
      ctx.lineTo(tx, -7.5);
      ctx.moveTo(tx, 7.5);
      ctx.lineTo(tx, 16);
      ctx.stroke();
    }

    // Armored hull
    const hullGrad = ctx.createLinearGradient(-18, -11, 18, 11);
    hullGrad.addColorStop(0, pal.light);
    hullGrad.addColorStop(0.5, pal.main);
    hullGrad.addColorStop(1, pal.dark);
    ctx.fillStyle = hullGrad;
    roundRectPath(ctx, -18, -11.5, 36, 23, 5);
    ctx.fill();
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Front faction stripe
    ctx.fillStyle = pal.trim;
    ctx.fillRect(8, -9.5, 4.5, 19);

    if (withTurret) {
      drawTankTurret(ctx, 'rhino_tank', pal);
    }
  } else if (cardId === 'apocalypse_tank') {
    // Legendary Dual-Barrel Apocalypse Mammoth Tank!
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 25, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Quad heavy treads
    ctx.fillStyle = '#1c252c';
    roundRectPath(ctx, -23, -18.5, 46, 9, 3);
    ctx.fill();
    roundRectPath(ctx, -23, 9.5, 46, 9, 3);
    ctx.fill();

    // Dozer blade front
    ctx.fillStyle = '#b0bec5';
    roundRectPath(ctx, 18, -16, 5.5, 32, 2);
    ctx.fill();

    // Massive hull
    ctx.fillStyle = pal.main;
    roundRectPath(ctx, -20, -13, 40, 26, 5);
    ctx.fill();
    ctx.strokeStyle = '#0d1b2a';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    if (withTurret) {
      drawTankTurret(ctx, 'apocalypse_tank', pal);
    }
  } else if (cardId === 'missile_car') {
    // Iconic Screenshot 1 Blue/White Twin-Pod Missile IFV!
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 19, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 6 Wheels
    ctx.fillStyle = '#1e272e';
    for (const wx of [-13, 0, 12]) {
      ctx.fillRect(wx - 3.5, -15, 7, 4.5);
      ctx.fillRect(wx - 3.5, 10.5, 7, 4.5);
    }

    // Sleek white/blue armored IFV body
    ctx.fillStyle = pal.trim;
    roundRectPath(ctx, -18, -11, 36, 22, 6);
    ctx.fill();
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hood & windshield
    ctx.fillStyle = pal.main;
    roundRectPath(ctx, -5, -9, 21, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#4dd0e1';
    ctx.fillRect(9, -6.5, 5, 13);

    // Twin 4-cell missile launcher pods on roof!
    ctx.fillStyle = pal.dark;
    roundRectPath(ctx, -15, -10, 17, 9, 2.5);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, -15, 1, 17, 9, 2.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff5252';
    for (const py of [-7.5, -4, 3.5, 7]) {
      ctx.beginPath();
      ctx.arc(0, py, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (cardId === 'artillery_car') {
    // V3 Long-Range Siege Artillery Truck
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#263238';
    roundRectPath(ctx, -19, -14, 38, 5.5, 2);
    ctx.fill();
    roundRectPath(ctx, -19, 8.5, 38, 5.5, 2);
    ctx.fill();

    ctx.fillStyle = '#558b2f';
    roundRectPath(ctx, -18, -10, 36, 20, 4);
    ctx.fill();
    ctx.strokeStyle = '#1b262c';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = pal.main;
    roundRectPath(ctx, 5, -8, 12, 16, 3);
    ctx.fill();

    // Heavy red/steel siege howitzer barrel
    ctx.fillStyle = '#d84315';
    roundRectPath(ctx, -16, -6.5, 19, 13, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eceff1';
    roundRectPath(ctx, -2, -3.2, 26, 6.4, 2);
    ctx.fill();
    ctx.stroke();
  } else if (cardId === 'heavy_gunner') {
    // Iconic Gas-Mask Red-Eye Stormtrooper with Gatling Minigun (Upright 2.5D character!)
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 13, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Armored red/blue coat & boots
    ctx.fillStyle = pal.main;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -11, -2, 22, 15, 6);
    ctx.fill();
    ctx.stroke();

    // Dark Stahlhelm + Glowing Red Gas Mask Eyes!
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(0, -8, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(-3.5, -7.5, 2.5, 0, Math.PI * 2);
    ctx.arc(4, -7.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Gatling Minigun held across chest pointing right (+X)
    ctx.fillStyle = '#455a64';
    roundRectPath(ctx, -2, 1, 23, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(13, 2, 8, 2);
    ctx.fillRect(13, 5, 8, 2);
  } else if (cardId === 'assault_infantry') {
    // Allied GI / Elite Rifleman (Upright 2.5D character!)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.main;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.8;
    roundRectPath(ctx, -9, -1, 18, 13, 5);
    ctx.fill();
    ctx.stroke();

    // Combat helmet
    ctx.fillStyle = '#558b2f';
    ctx.beginPath();
    ctx.arc(0, -7, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffccbc';
    ctx.fillRect(-4, -5, 9, 4.5);

    // Assault rifle pointing right (+X)
    ctx.fillStyle = '#263238';
    roundRectPath(ctx, 0, 2, 19, 4.5, 1.5);
    ctx.fill();
  } else if (cardId === 'jetpack_trooper') {
    // Rocketeer (火箭飞行兵) hovering with twin jetpack flames!
    // Twin orange/yellow jet exhaust plumes underneath!
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(-9, 9);
    ctx.lineTo(-6, 20);
    ctx.lineTo(-3, 9);
    ctx.moveTo(3, 9);
    ctx.lineTo(6, 20);
    ctx.lineTo(9, 9);
    ctx.fill();

    // Silver jetpack cylinders
    ctx.fillStyle = '#eceff1';
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.8;
    roundRectPath(ctx, -13, -7, 7, 16, 3);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, 6, -7, 7, 16, 3);
    ctx.fill();
    ctx.stroke();

    // Flight suit
    ctx.fillStyle = pal.main;
    roundRectPath(ctx, -9, -2, 18, 13, 5);
    ctx.fill();
    ctx.stroke();

    // Blue/Red visor helmet with white star
    ctx.fillStyle = pal.light;
    ctx.beginPath();
    ctx.arc(0, -8, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#00e5ff';
    roundRectPath(ctx, -4, -10, 10, 5, 2);
    ctx.fill();

    // Anti-tank rocket launcher barrel
    ctx.fillStyle = '#b0bec5';
    roundRectPath(ctx, 2, 1, 18, 5, 2);
    ctx.fill();
    ctx.stroke();
  } else if (cardId === 'jet_fighter') {
    // Black Eagle Supersonic Strike Jet
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(-17, -6);
    ctx.lineTo(-27, -4);
    ctx.lineTo(-17, -2);
    ctx.moveTo(-17, 2);
    ctx.lineTo(-27, 4);
    ctx.lineTo(-17, 6);
    ctx.fill();

    const jetGrad = ctx.createLinearGradient(-18, -20, 22, 20);
    jetGrad.addColorStop(0, pal.dark);
    jetGrad.addColorStop(0.5, pal.main);
    jetGrad.addColorStop(1, pal.light);
    ctx.fillStyle = jetGrad;
    ctx.strokeStyle = '#0d1b2a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(4, -5.5);
    ctx.lineTo(-9, -22);
    ctx.lineTo(-16, -20);
    ctx.lineTo(-11, -6.5);
    ctx.lineTo(-20, -10);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-11, 6.5);
    ctx.lineTo(-16, 20);
    ctx.lineTo(-9, 22);
    ctx.lineTo(4, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#80d8ff';
    ctx.beginPath();
    ctx.ellipse(8, 0, 7.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (cardId === 'bunker') {
    // Red Alert Concrete Pillbox Bunker (碉堡克步兵!)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 23, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8d6e63';
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 5, 21, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const domeGrad = ctx.createLinearGradient(0, -15, 0, 9);
    domeGrad.addColorStop(0, '#cfd8dc');
    domeGrad.addColorStop(1, '#607d8b');
    ctx.fillStyle = domeGrad;
    ctx.strokeStyle = '#1c252c';
    ctx.lineWidth = 2.2;
    roundRectPath(ctx, -17, -12, 34, 19, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#11171a';
    ctx.fillRect(-12, -4, 24, 5);
    ctx.fillStyle = '#ffab00';
    ctx.fillRect(-5, -3, 3, 3);
    ctx.fillRect(3, -3, 3, 3);

    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.ellipse(0, -10, 9.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (cardId === 'sam_tower') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 9, 21, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.main;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 7, 18, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#90a4ae';
    roundRectPath(ctx, -6.5, -3, 13, 10, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.light;
    roundRectPath(ctx, -17, -20, 34, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#eceff1';
    roundRectPath(ctx, -14, -18, 22, 14, 2);
    ctx.fill();

    ctx.fillStyle = '#263238';
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.beginPath();
        ctx.arc(-10.5 + col * 5.2, -14.5 + row * 6.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (cardId === 'prism_tower') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 19, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.main;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 9, 16, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#cfd8dc';
    roundRectPath(ctx, -5.5, -9, 11, 18, 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(11, -12);
    ctx.lineTo(5.5, -5.5);
    ctx.lineTo(-5.5, -5.5);
    ctx.lineTo(-11, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -13, 4.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (cardId === 'gold_mine') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#78909c';
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -18, -3, 36, 18, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.main;
    roundRectPath(ctx, -10, -18, 20, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd54f';
    roundRectPath(ctx, -10, -11, 20, 4.5, 1);
    ctx.fill();

    ctx.fillStyle = '#cfd8dc';
    roundRectPath(ctx, -3.5, -24, 7, 8, 2);
    ctx.fill();
    ctx.stroke();

    const gemColors = ['#ff1744', '#00e676', '#2979ff', '#ffd600'];
    gemColors.forEach((gc, idx) => {
      const ang = idx * 1.4 + 0.4;
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 15, 7 + Math.sin(ang) * 5.5, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function drawTankTurret(ctx: CanvasRenderingContext2D, cardId: string, pal: FactionPalette): void {
  if (cardId === 'apocalypse_tank') {
    // Side Mammoth missile pods
    ctx.fillStyle = pal.trim;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, -12, -15, 14, 5.5, 2);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, -12, 9.5, 14, 5.5, 2);
    ctx.fill();
    ctx.stroke();

    // Dual 125mm heavy barrels
    ctx.fillStyle = '#eceff1';
    roundRectPath(ctx, 5, -7.5, 23, 5, 1.5);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, 5, 2.5, 23, 5, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.light;
    roundRectPath(ctx, -11, -10, 21, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(-4, -3.5, 7, 7);
  } else {
    // Rhino single 120mm cannon + turret dome
    ctx.fillStyle = '#90a4ae';
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.8;
    roundRectPath(ctx, 4, -3.2, 22, 6.4, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#37474f';
    ctx.fillRect(22, -4.2, 4.5, 8.4);

    ctx.fillStyle = pal.light;
    roundRectPath(ctx, -9.5, -8.5, 19, 17, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(-2, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderCardIllustrationDataURL(cardId: string): string {
  const cached = cardArtCache.get(cardId);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 140;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;

  const rad = ctx.createRadialGradient(70, 62, 8, 70, 62, 62);
  rad.addColorStop(0, 'rgba(255,255,255,0.32)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 140, 120);

  ctx.save();
  ctx.translate(70, 62);
  if (
    cardId === 'jet_fighter' ||
    cardId === 'rhino_tank' ||
    cardId === 'apocalypse_tank' ||
    cardId === 'missile_car' ||
    cardId === 'artillery_car'
  ) {
    ctx.rotate(-0.26);
  }
  drawUnitOrBuildingArt(ctx, cardId, BLUE_PALETTE, 2.05, true);
  ctx.restore();

  const url = canvas.toDataURL('image/png');
  cardArtCache.set(cardId, url);
  return url;
}

export function renderAvatarDataURL(type: 'player' | 'sam' | 'chopper' | 'tank' | 'commando' | 'tesla'): string {
  const cached = avatarArtCache.get(type);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, 96);
  if (type === 'player') {
    bg.addColorStop(0, '#37474f');
    bg.addColorStop(1, '#102027');
  } else {
    bg.addColorStop(0, '#4a2533');
    bg.addColorStop(1, '#1f1218');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 96, 96);

  ctx.save();
  ctx.translate(48, 52);
  if (type === 'player') {
    ctx.fillStyle = '#c62828';
    roundRectPath(ctx, -34, 8, 68, 34, 14);
    ctx.fill();
    ctx.fillStyle = '#263238';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -10, 25, Math.PI, 0);
    ctx.lineTo(27, 4);
    ctx.lineTo(-27, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c252c';
    ctx.beginPath();
    ctx.arc(0, -2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(-9, -4, 6, 0, Math.PI * 2);
    ctx.arc(9, -4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a80';
    ctx.beginPath();
    ctx.arc(-10, -6, 2, 0, Math.PI * 2);
    ctx.arc(8, -6, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.arc(0, 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (type === 'sam') {
    drawUnitOrBuildingArt(ctx, 'sam_tower', RED_PALETTE, 1.85, true);
  } else if (type === 'chopper') {
    ctx.rotate(-0.3);
    drawUnitOrBuildingArt(ctx, 'jet_fighter', RED_PALETTE, 1.65, true);
  } else if (type === 'tank') {
    ctx.rotate(-0.25);
    drawUnitOrBuildingArt(ctx, 'apocalypse_tank', RED_PALETTE, 1.55, true);
  } else {
    drawUnitOrBuildingArt(ctx, 'prism_tower', RED_PALETTE, 1.85, true);
  }
  ctx.restore();

  const url = canvas.toDataURL('image/png');
  avatarArtCache.set(type, url);
  return url;
}

/**
 * Generates ALL Phaser 3 WebGL textures at 2x Retina DPI (`TEX_SCALE = 0.5` maps 1:1 to world coords!)
 */
export function registerPhaserTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('hex_grass_0')) return;

  const hexW = Math.ceil(HEX_RADIUS * 2 + 4);
  const hexH = Math.ceil(HEX_RADIUS * Math.sin(Math.PI / 3) * 2 + 4);

  const makeHexTexture = (
    key: string,
    fillColors: [string, string],
    borderColor: string,
    tuftColor: string | null,
    variant: number
  ) => {
    const tex = scene.textures.createCanvas(key, hexW * 2, hexH * 2)!;
    const ctx = tex.context;
    ctx.scale(2, 2);
    const cx = hexW / 2;
    const cy = hexH / 2;
    const verts = getHexVertices(cx, cy, HEX_RADIUS + 0.45);

    const grad = ctx.createLinearGradient(0, 0, 0, hexH);
    grad.addColorStop(0, fillColors[0]);
    grad.addColorStop(1, fillColors[1]);

    ctx.beginPath();
    verts.forEach((v, idx) => (idx === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.15;
    ctx.stroke();

    if (tuftColor) {
      ctx.strokeStyle = tuftColor;
      ctx.lineWidth = 1.2;
      const ox = (variant - 0.5) * 3;
      const oy = ((variant % 2) - 0.5) * 2.5;
      for (let b = -2; b <= 2; b++) {
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy + oy + 2.5);
        ctx.lineTo(cx + ox + b * 2, cy + oy - 2.2 + Math.abs(b) * 0.5);
        ctx.stroke();
      }
    }
    tex.refresh();
  };

  makeHexTexture('hex_grass_0', ['#96be4b', '#87b03f'], 'rgba(110, 146, 48, 0.55)', '#577a24', 0);
  makeHexTexture('hex_grass_1', ['#9cc451', '#8cb543'], 'rgba(110, 146, 48, 0.55)', '#577a24', 1);
  makeHexTexture('hex_sand_0', ['#ebc37b', '#e2b76b'], 'rgba(194, 148, 78, 0.65)', '#8d7b4a', 0);
  makeHexTexture('hex_sand_1', ['#efd089', '#e5bd73'], 'rgba(194, 148, 78, 0.65)', '#8d7b4a', 1);
  makeHexTexture('hex_water_0', ['#24a8d8', '#1b93c4'], 'rgba(128, 222, 234, 0.35)', null, 0);

  // Sparkling Multi-Gem Deposit Ring
  {
    const tex = scene.textures.createCanvas('gem_ring', 140, 120)!;
    const ctx = tex.context;
    ctx.scale(2, 2);
    const colors = ['#ff1744', '#00e676', '#2979ff', '#ffd600', '#e040fb', '#00e5ff'];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + (i % 3) * 0.1;
      const rx = 23 + (i % 2) * 3;
      const ry = 18 + (i % 2) * 2.5;
      const gx = 35 + Math.cos(a) * rx;
      const gy = 30 + Math.sin(a) * ry;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.arc(gx + 0.8, gy + 1.2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(gx, gy, 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx - 0.9, gy - 1.1, 1.1, 1.1);
    }
    tex.refresh();
  }

  // Blue Teardrop Build Pins (Affordable vs Locked)
  const makePinTexture = (key: string, topColor: string, botColor: string) => {
    const tex = scene.textures.createCanvas(key, 84, 96)!;
    const ctx = tex.context;
    ctx.scale(2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(21, 41, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(21, 4, 21, 39);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, botColor);
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(21, 18, 13.5, Math.PI * 0.78, Math.PI * 0.22, false);
    ctx.lineTo(21, 39);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    tex.refresh();
  };
  makePinTexture('pin_ready', '#4fc3f7', '#1976d2');
  makePinTexture('pin_wait', '#78909c', '#455a64');

  const makeBuildingTexture = (key: string, drawFn: (ctx: CanvasRenderingContext2D) => void) => {
    const tex = scene.textures.createCanvas(key, 140, 140)!;
    const ctx = tex.context;
    ctx.scale(2, 2);
    ctx.translate(35, 36);
    drawFn(ctx);
    tex.refresh();
  };

  for (const [teamSuffix, pal] of [
    ['blue', BLUE_PALETTE],
    ['red', RED_PALETTE],
  ] as const) {
    // Main Command Center
    makeBuildingTexture(`bldg_base_${teamSuffix}`, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 26, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#eceff1';
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 2, 24, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.ellipse(0, 2, 19, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = pal.main;
      roundRectPath(ctx, -13, -11, 26, 20, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#37474f';
      roundRectPath(ctx, -3, -23, 6, 14, 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.trim;
      ctx.beginPath();
      ctx.arc(0, -3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    makeBuildingTexture(`bldg_barracks_${teamSuffix}`, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 23, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#546e7a';
      ctx.strokeStyle = '#102027';
      ctx.lineWidth = 2;
      roundRectPath(ctx, -19, -12, 38, 25, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.main;
      roundRectPath(ctx, -17, -17, 34, 15, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#11171a';
      ctx.fillRect(-7, 1, 14, 11);
      ctx.fillStyle = pal.accent;
      ctx.fillRect(-9, -13, 18, 3.5);
    });

    makeBuildingTexture(`bldg_factory_${teamSuffix}`, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 24, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#455a64';
      ctx.strokeStyle = '#102027';
      ctx.lineWidth = 2.2;
      roundRectPath(ctx, -21, -13, 42, 26, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.main;
      roundRectPath(ctx, -19, -19, 26, 14, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#90a4ae';
      roundRectPath(ctx, 9, -22, 8, 16, 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(-12, 0, 20, 12);
      ctx.fillStyle = '#263238';
      ctx.fillRect(-10, 3, 16, 8);
    });

    makeBuildingTexture(`bldg_airfield_${teamSuffix}`, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 24, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#37474f';
      ctx.strokeStyle = pal.light;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(-2, 4, 20, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.strokeRect(-7, -1, 10, 8);

      ctx.fillStyle = pal.main;
      roundRectPath(ctx, 5, -19, 13, 16, 3);
      ctx.fill();
      ctx.strokeStyle = '#102027';
      ctx.stroke();
    });

    makeBuildingTexture(`bldg_mine_${teamSuffix}`, (ctx) => drawUnitOrBuildingArt(ctx, 'gold_mine', pal, 0.96, true));
    makeBuildingTexture(`bldg_bunker_${teamSuffix}`, (ctx) => drawUnitOrBuildingArt(ctx, 'bunker', pal, 0.98, true));
    makeBuildingTexture(`bldg_sam_${teamSuffix}`, (ctx) => drawUnitOrBuildingArt(ctx, 'sam_tower', pal, 0.96, true));
    makeBuildingTexture(`bldg_prism_${teamSuffix}`, (ctx) => drawUnitOrBuildingArt(ctx, 'prism_tower', pal, 0.96, true));

    // Independent Turret sprites for Rhino & Apocalypse Tanks!
    for (const tankId of ['rhino_tank', 'apocalypse_tank'] as const) {
      const tTex = scene.textures.createCanvas(`turret_${tankId}_${teamSuffix}`, 128, 128)!;
      const tCtx = tTex.context;
      tCtx.scale(2, 2);
      tCtx.translate(32, 32);
      drawTankTurret(tCtx, tankId, pal);
      tTex.refresh();
    }

    // All 8 Combat Units (Tanks rendered hull-only so independent turret rotates on top!)
    const unitIds = [
      'heavy_gunner',
      'assault_infantry',
      'missile_car',
      'artillery_car',
      'rhino_tank',
      'apocalypse_tank',
      'jetpack_trooper',
      'jet_fighter',
    ];
    for (const uid of unitIds) {
      const utex = scene.textures.createCanvas(`unit_${uid}_${teamSuffix}`, 128, 128)!;
      const uctx = utex.context;
      uctx.scale(2, 2);
      uctx.translate(32, 32);
      const isSeparateTurretTank = uid === 'rhino_tank' || uid === 'apocalypse_tank';
      drawUnitOrBuildingArt(uctx, uid, pal, 0.9, !isSeparateTurretTank);
      utex.refresh();
    }

    // Crisp Full-Unit Mini Icon for Build Pins (always includes tank turret!)
    for (const uid of unitIds) {
      const mtex = scene.textures.createCanvas(`icon_${uid}_${teamSuffix}`, 128, 128)!;
      const mctx = mtex.context;
      mctx.scale(2, 2);
      mctx.translate(32, 32);
      drawUnitOrBuildingArt(mctx, uid, pal, 0.9, true);
      mtex.refresh();
    }
  }

  // Smoking Rubble Pile
  makeBuildingTexture('rubble_pile', (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    const grays = ['#546e7a', '#78909c', '#37474f', '#607d8b'];
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = grays[i % grays.length];
      ctx.strokeStyle = '#1c252c';
      ctx.lineWidth = 1.2;
      const rx = ((i * 19) % 32) - 16;
      const ry = ((i * 13) % 16) - 5;
      roundRectPath(ctx, rx - 4.5, ry - 3.5, 9, 6.5, 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  // Parachute, Projectiles & Palm Props
  {
    const pTex = scene.textures.createCanvas('parachute_canopy', 96, 96)!;
    const pCtx = pTex.context;
    pCtx.scale(2, 2);
    pCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    pCtx.lineWidth = 1.1;
    for (const cx of [10, 18, 24, 30, 38]) {
      pCtx.beginPath();
      pCtx.moveTo(cx, 20);
      pCtx.lineTo(24, 42);
      pCtx.stroke();
    }
    pCtx.fillStyle = '#43a047';
    pCtx.strokeStyle = '#1b5e20';
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.arc(24, 21, 16, Math.PI, 0);
    pCtx.closePath();
    pCtx.fill();
    pCtx.stroke();
    pCtx.fillStyle = '#81c784';
    pCtx.beginPath();
    pCtx.arc(24, 21, 9, Math.PI, 0);
    pCtx.fill();
    pTex.refresh();

    const projBullet = scene.textures.createCanvas('proj_bullet', 24, 12)!;
    projBullet.context.fillStyle = '#ffeb3b';
    projBullet.context.fillRect(2, 3, 20, 6);
    projBullet.context.fillStyle = '#ffffff';
    projBullet.context.fillRect(8, 4, 12, 4);
    projBullet.refresh();

    const projShell = scene.textures.createCanvas('proj_shell', 36, 20)!;
    projShell.context.fillStyle = '#ff6d00';
    projShell.context.beginPath();
    projShell.context.ellipse(18, 10, 15, 7, 0, 0, Math.PI * 2);
    projShell.context.fill();
    projShell.context.fillStyle = '#ffff8d';
    projShell.context.beginPath();
    projShell.context.ellipse(20, 10, 9, 4, 0, 0, Math.PI * 2);
    projShell.context.fill();
    projShell.refresh();

    const projMissile = scene.textures.createCanvas('proj_missile', 40, 18)!;
    const mctx = projMissile.context;
    mctx.fillStyle = '#ff9100';
    mctx.fillRect(0, 5, 11, 8);
    mctx.fillStyle = '#eceff1';
    mctx.fillRect(10, 4, 22, 10);
    mctx.fillStyle = '#ff1744';
    mctx.beginPath();
    mctx.moveTo(32, 3);
    mctx.lineTo(40, 9);
    mctx.lineTo(32, 15);
    mctx.closePath();
    mctx.fill();
    projMissile.refresh();

    const particleDot = scene.textures.createCanvas('particle_dot', 16, 16)!;
    particleDot.context.fillStyle = '#ffffff';
    particleDot.context.beginPath();
    particleDot.context.arc(8, 8, 7, 0, Math.PI * 2);
    particleDot.context.fill();
    particleDot.refresh();

    const palmTex = scene.textures.createCanvas('prop_palm', 96, 96)!;
    const plCtx = palmTex.context;
    plCtx.scale(2, 2);
    plCtx.strokeStyle = '#6d4c41';
    plCtx.lineWidth = 4;
    plCtx.beginPath();
    plCtx.moveTo(24, 42);
    plCtx.quadraticCurveTo(20, 28, 25, 17);
    plCtx.stroke();
    plCtx.fillStyle = '#2e7d32';
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      plCtx.beginPath();
      plCtx.ellipse(25 + Math.cos(ang) * 9, 16 + Math.sin(ang) * 7, 9, 3.5, ang, 0, Math.PI * 2);
      plCtx.fill();
    }
    palmTex.refresh();
  }
}
