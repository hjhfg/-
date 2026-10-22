import Phaser from 'phaser';
import { STUDIO_ASSETS } from '../assets/studioAssets';

export const TEX_SCALE = 1;

export function getStudioAsset(key: string): string {
  return STUDIO_ASSETS[key] ?? STUDIO_ASSETS['card_rhino_tank'];
}

export function renderCardIllustrationDataURL(cardId: string): string {
  return STUDIO_ASSETS[`card_${cardId}`] ?? STUDIO_ASSETS['card_rhino_tank'];
}

export function renderAvatarDataURL(who: string): string {
  if (who === 'player') return STUDIO_ASSETS['avatar_player'];
  if (who === 'tank') return STUDIO_ASSETS['card_apocalypse_tank'];
  if (who === 'chopper') return STUDIO_ASSETS['card_jet_fighter'];
  if (who === 'tesla') return STUDIO_ASSETS['card_prism_tower'];
  if (who === 'commando') return STUDIO_ASSETS['avatar_cmd_natasha'];
  if (who === 'cmd_mac') return STUDIO_ASSETS['avatar_cmd_commando'];
  if (who === 'cmd_boris') return STUDIO_ASSETS['avatar_cmd_iron'];
  if (who === 'cmd_natasha') return STUDIO_ASSETS['avatar_cmd_natasha'];
  return STUDIO_ASSETS['avatar_sam'];
}

/**
 * Generates crisp Retina WebGL battlefield VFX, projectiles, gem rings, and map pins
 * inside Phaser's TextureManager alongside all 71 HD 3D Studio WebP assets.
 */
export function registerVfxTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx_muzzle')) return;

  const mkCanvas = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.context);
    tex.refresh();
  };

  // 1. Muzzle blast star flare
  mkCanvas('fx_muzzle', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,245,1)');
    g.addColorStop(0.3, 'rgba(255,212,68,0.95)');
    g.addColorStop(0.65, 'rgba(255,96,16,0.52)');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,252,215,0.92)';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, 27, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // 2. Soft volumetric smoke / dust / snow puff
  mkCanvas('fx_puff', 48, 48, (ctx) => {
    const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 22);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(235,242,255,0.55)');
    g.addColorStop(1, 'rgba(220,230,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(24, 24, 22, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Particle spark dot
  mkCanvas('particle_dot', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 1, 12, 12, 11);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(12, 12, 11, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. High-explosive fireball burst
  mkCanvas('fx_fireball', 96, 96, (ctx) => {
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 44);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.3, 'rgba(255,196,46,0.96)');
    g.addColorStop(0.65, 'rgba(242,76,18,0.72)');
    g.addColorStop(0.88, 'rgba(80,32,20,0.32)');
    g.addColorStop(1, 'rgba(40,20,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(48, 48, 44, 0, Math.PI * 2);
    ctx.fill();
  });

  // 5. Guided Rocket Projectile (`proj_missile`)
  mkCanvas('proj_missile', 46, 20, (ctx) => {
    const fg = ctx.createLinearGradient(0, 10, 18, 10);
    fg.addColorStop(0, 'rgba(255,100,0,0)');
    fg.addColorStop(0.55, 'rgba(255,180,36,0.92)');
    fg.addColorStop(1, 'rgba(255,255,220,1)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(1, 10);
    ctx.lineTo(18, 4.5);
    ctx.lineTo(18, 15.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#eef4fc';
    ctx.strokeStyle = '#1b2638';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(15, 6, 18, 8, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff3d3d';
    ctx.beginPath();
    ctx.moveTo(32, 5.2);
    ctx.lineTo(43, 10);
    ctx.lineTo(32, 14.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // 6. Armor-Piercing Tank / Artillery Shell (`proj_shell`)
  mkCanvas('proj_shell', 38, 16, (ctx) => {
    const g = ctx.createLinearGradient(2, 8, 36, 8);
    g.addColorStop(0, 'rgba(255,130,10,0)');
    g.addColorStop(0.55, 'rgba(255,205,65,0.95)');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(19, 8, 17, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#bf360c';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // 7. Heavy Gatling / Rifle Tracer (`proj_bullet`)
  mkCanvas('proj_bullet', 26, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 4, 26, 4);
    g.addColorStop(0, 'rgba(255,235,59,0)');
    g.addColorStop(0.6, 'rgba(255,241,118,0.95)');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(1, 1.5, 24, 5, 2.5);
    ctx.fill();
  });

  // 8. Glossy 3D Sky-Blue & Muted Map Build Teardrop Pins (`pin_ready` & `pin_wait`, Screenshot 6!)
  const drawPin = (ctx: CanvasRenderingContext2D, cTop: string, cBot: string, border: string) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;

    const grad = ctx.createLinearGradient(32, 4, 32, 58);
    grad.addColorStop(0, cTop);
    grad.addColorStop(1, cBot);
    ctx.fillStyle = grad;
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(32, 26, 20, Math.PI * 0.78, Math.PI * 0.22, false);
    ctx.lineTo(32, 57);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Inner bright circular window
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(32, 24, 14.5, 0, Math.PI * 2);
    ctx.fill();
  };

  mkCanvas('pin_ready', 64, 64, (ctx) => drawPin(ctx, '#7fd0ff', '#2c84e6', '#e3f4ff'));
  mkCanvas('pin_wait', 64, 64, (ctx) => drawPin(ctx, '#8ea2bc', '#536882', '#cfd8dc'));

  // 9. Sparkling Multi-Colored Crystal Gem Deposit Ring (`gem_ring`, Screenshot 1 & 6!)
  mkCanvas('gem_ring', 96, 86, (ctx) => {
    const gems = [
      '#ff1744', '#00e5ff', '#ffea00', '#00e676', '#d500f9',
      '#2979ff', '#ff9100', '#1de9b6', '#ff4081', '#76ff03',
      '#40c4ff', '#ffd740', '#ff5252', '#69f0ae',
    ];
    gems.forEach((col, i) => {
      const ang = (i / gems.length) * Math.PI * 2 + (i % 2) * 0.14;
      const rx = 28 + (i % 3) * 4;
      const ry = 23 + ((i + 1) % 3) * 3.5;
      const gx = 48 + Math.cos(ang) * rx;
      const gy = 43 + Math.sin(ang) * ry;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-3.5, -2.5, 8, 7);

      ctx.fillStyle = col;
      ctx.strokeStyle = '#102027';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -5.2);
      ctx.lineTo(4.6, 0);
      ctx.lineTo(0, 5.2);
      ctx.lineTo(-4.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-1.5, -2.5, 2.2, 2.2);
      ctx.restore();
    });
  });
}
