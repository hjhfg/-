import {
  ALL_CARD_IDS,
  CARDS,
  CATEGORY_ICON,
  COMMANDERS,
  MATCH_TIPS,
  OPPONENT_PROFILES,
  RARITY_META,
  type OpponentProfile,
} from '../data/cards';
import { store } from '../data/storage';
import { sound } from '../audio/SoundManager';
import { renderAvatarDataURL, renderCardIllustrationDataURL } from '../art/RedAlertArt';
import type { BattleEndSummary, LiveBattleHUDState } from '../game/BattleTypes';
import type { BattleScene } from '../game/scenes/BattleScene';

type ScreenView = 'lobby' | 'matchmaking' | 'battle';
type LobbyTab = 'shop' | 'troops' | 'battle' | 'commander' | 'guide';

export class GameUI {
  private root: HTMLElement;
  private getBattleScene: () => BattleScene | null;

  private view: ScreenView = 'lobby';
  private activeTab: LobbyTab = 'battle';
  private sortBy: 'rarity' | 'level' = 'level';
  private currentOpponent: OpponentProfile = OPPONENT_PROFILES[0];
  private pendingMode: 'pvp' | 'coop' = 'pvp';
  private matchTimerHandle: number | null = null;
  private toastTimeout: number | null = null;
  private tooltipTimeout: number | null = null;
  private dioramaRaf: number | null = null;
  private lastHud: LiveBattleHUDState | null = null;

  constructor(root: HTMLElement, getBattleScene: () => BattleScene | null) {
    this.root = root;
    this.getBattleScene = getBattleScene;
    sound.enabled = store.data.soundEnabled;
    this.render();
  }

  public showToast(msg: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    const existing = this.root.querySelector('.toast-banner');
    if (existing) existing.remove();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    const el = document.createElement('div');
    el.className = 'toast-banner';
    el.style.borderColor = tone === 'warn' ? '#ff5252' : tone === 'good' ? '#69f0ae' : '#80d8ff';
    el.textContent = msg;
    this.root.appendChild(el);

    this.toastTimeout = window.setTimeout(() => el.remove(), 2200);
  }

  private renderCardTileHTML(cardId: string, showSlotBadge?: string): string {
    const card = CARDS[cardId];
    const rMeta = RARITY_META[card.rarity];
    const lv = store.data.cardLevels[cardId] || 8;
    const shards = store.data.cardShards[cardId] || 0;
    const needed = store.getShardsNeeded(cardId);
    const fillPct = Math.min(100, Math.round((shards / needed) * 100));
    const canUp = shards >= needed;
    const imgUrl = renderCardIllustrationDataURL(cardId);

    return `
      <div class="ra-card" data-card-id="${cardId}" style="background:${rMeta.bgGrad}; border-color:${rMeta.border};">
        <div class="cost-orb">${card.cost}</div>
        ${
          showSlotBadge
            ? `<div style="position:absolute;top:2px;right:3px;font-size:9px;background:rgba(0,0,0,0.65);padding:1px 4px;border-radius:4px;font-weight:800;">${showSlotBadge}</div>`
            : ''
        }
        <img class="card-art-img" src="${imgUrl}" alt="${card.name}" />
        <div style="font-size:11.5px;font-weight:900;color:#fff;text-shadow:0 1px 3px #000;margin-bottom:1px;">
          ${card.shortName}
        </div>
        <div class="card-name-row">
          <span>${lv}级</span>
          <span>${CATEGORY_ICON[card.category]}</span>
        </div>
        <div class="shard-bar">
          <div class="shard-fill ${canUp ? 'upgradable' : ''}" style="width:${fillPct}%"></div>
          <span>${canUp ? '⬆ ' : ''}${shards}/${needed}</span>
        </div>
      </div>
    `;
  }

  public render(): void {
    if (this.view === 'lobby') {
      this.renderLobby();
    } else if (this.view === 'matchmaking') {
      this.renderMatchmaking();
    } else {
      this.renderBattleHUD();
    }
  }

  // =========================================================================
  // 1. META-GAME LOBBY (5 TABS: 商店 / 部队 / 对战 / 指挥官 / 克制)
  // =========================================================================
  private renderLobby(): void {
    const powerPct = store.getCombatPowerPct();
    const soundIcon = store.data.soundEnabled ? '🔊' : '🔇';

    this.root.innerHTML = `
      <div class="lobby-screen">
        <div class="top-resource-bar">
          <div class="res-pill" title="升级任意卡牌均可永久提升全军战力加成">✊ <span>${powerPct}%</span></div>
          <div class="res-pill">💎 <span>${store.data.diamonds}</span></div>
          <div class="res-pill">🪙 <span>${store.data.gold}</span></div>
          <button class="sound-btn" id="btn-share-url" title="查看手机部署网址">🌐</button>
          <button class="sound-btn" id="btn-toggle-sound" title="音效开关">${soundIcon}</button>
        </div>

        <div class="lobby-body" id="lobby-tab-content">
          ${this.renderActiveLobbyTabHTML()}
        </div>

        <div class="bottom-nav">
          <button class="nav-tab ${this.activeTab === 'shop' ? 'active' : ''}" data-tab="shop">
            <span class="nav-ico">📦</span>
            <span>商店</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'troops' ? 'active' : ''}" data-tab="troops">
            <span class="nav-ico">🚜</span>
            <span>部队</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'battle' ? 'active' : ''}" data-tab="battle">
            <span class="nav-ico">📡</span>
            <span>对战</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'commander' ? 'active' : ''}" data-tab="commander">
            <span class="nav-ico">🎖️</span>
            <span>指挥官</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'guide' ? 'active' : ''}" data-tab="guide">
            <span class="nav-ico">⚔️</span>
            <span>克制</span>
          </button>
        </div>
      </div>
    `;

    this.bindLobbyEvents();
    if (this.activeTab === 'battle') {
      this.drawSnowyWatchtowerDiorama();
    }
  }

  private renderActiveLobbyTabHTML(): string {
    if (this.activeTab === 'battle') {
      const rank = store.getRankTitle();
      const rankPct = Math.min(
        100,
        Math.max(8, Math.round(((store.data.trophies - rank.base) / (rank.next - rank.base)) * 100))
      );
      const passPct = Math.min(100, Math.round((store.data.battlePassXp / 200) * 100));
      const deck = store.getActiveDeck();

      return `
        <div class="profile-pass-row">
          <div class="profile-card">
            <div class="avatar-frame">
              <img src="${renderAvatarDataURL('player')}" alt="指挥官头像" />
            </div>
            <div class="profile-meta">
              <h3>${store.data.playerName}</h3>
              <p>胜率: ${store.getWinRatePct()}%</p>
              <p style="color:#81d4fa;font-size:11px;">当前阵容: ${deck.name}</p>
            </div>
          </div>

          <div class="pass-banner" id="btn-claim-pass">
            <div class="pass-title">对战通行证 🎁</div>
            <div class="pass-bar-wrap">
              <div class="pass-lv-badge">${store.data.battlePassLv}</div>
              <div class="pass-progress">
                <div class="pass-progress-fill" style="width:${passPct}%"></div>
                <span>${store.data.battlePassXp}/200</span>
              </div>
            </div>
          </div>
        </div>

        <div class="diorama-stage">
          <div class="side-events-col left">
            <button class="mini-event-btn" data-quick-tab="commander"><span class="ev-icon">🌟</span>指挥官</button>
            <button class="mini-event-btn" data-quick-tab="troops"><span class="ev-icon">🃏</span>配卡组</button>
            <button class="mini-event-btn" id="btn-free-bonus"><span class="ev-icon">🏆</span>每日首胜</button>
          </div>

          <canvas class="diorama-canvas" id="diorama-canvas" width="580" height="410"></canvas>

          <div class="side-events-col right">
            <button class="mini-event-btn" data-quick-tab="guide"><span class="ev-icon">📖</span>克制表</button>
            <button class="mini-event-btn" data-quick-tab="shop"><span class="ev-icon">💎</span>抽卡包</button>
            <button class="mini-event-btn" id="btn-switch-opp"><span class="ev-icon">🎯</span>换对手</button>
          </div>

          <div class="rank-trophy-pill">
            <div class="rank-title-text">🏆 ${rank.name}</div>
            <div class="rank-bar-bg">
              <div class="rank-bar-fill" style="width:${rankPct}%"></div>
              <span>${store.data.trophies}/${rank.next}</span>
            </div>
          </div>
        </div>

        <div class="daily-quest-box" id="btn-daily-quest">
          <div class="dq-left">
            <span style="font-size:22px;">🃏</span>
            <div>
              <div>每日商店免费补给 1 次</div>
              <div style="font-size:11px;color:${store.data.dailyShopClaimed ? '#69f0ae' : '#ffca28'};">
                ${store.data.dailyShopClaimed ? '今日已完成 ✔' : '( 0 / 1 ) 点击前往商店免费领取！'}
              </div>
            </div>
          </div>
          <span style="font-size:12px;font-weight:800;color:#80d8ff;">前往 ➔</span>
        </div>

        <div class="battle-cta-row">
          <button class="btn-pvp" id="btn-start-pvp">
            <span>对战模式</span>
            <span class="sub">开格子 · 抢金矿 · 推平敌基地</span>
          </button>
          <button class="btn-coop" id="btn-start-coop">
            <span>合作模式</span>
            <span class="sub">双基地联防 · 迎战基洛夫大军</span>
          </button>
        </div>

        <div class="chest-slots-row">
          ${store.data.chests
            .map((ch, idx) => {
              if (!ch) {
                return `<div class="chest-slot empty" data-chest-idx="${idx}">空槽位</div>`;
              }
              const ico = ch.tier === 'gold' ? '👑' : ch.tier === 'silver' ? '🧰' : '📦';
              return `
                <div class="chest-slot ${ch.tier === 'gold' ? 'gold-tier' : ''}" data-chest-idx="${idx}">
                  <div class="chest-name">${ch.title}</div>
                  <div class="chest-icon">${ico}</div>
                  <div class="chest-timer">${ch.skipGems > 0 ? `💎${ch.skipGems} 秒开` : '点击开启'}</div>
                </div>
              `;
            })
            .join('')}
        </div>

        <div id="btn-chat-coop" style="margin-top:2px;padding:6px 10px;border-radius:8px;background:rgba(13,20,38,0.72);font-size:11.5px;color:#cfd8dc;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
          <span>💬 <b>苍白哥哥呢:</b> <span style="color:#80d8ff;">[!coop:20144806] 来合作模式一起守红警BOSS！</span></span>
          <span style="color:#ffd54f;font-weight:800;">加入 ➔</span>
        </div>
      `;
    }

    if (this.activeTab === 'troops') {
      const deck = store.getActiveDeck();
      const sortedCards = [...ALL_CARD_IDS].sort((a, b) => {
        if (this.sortBy === 'level') {
          return (store.data.cardLevels[b] || 1) - (store.data.cardLevels[a] || 1);
        }
        const order = { legendary: 4, epic: 3, rare: 2, common: 1 };
        return order[CARDS[b].rarity] - order[CARDS[a].rarity];
      });

      return `
        <div class="deck-panel-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
            <span style="font-size:13.5px;font-weight:900;color:#ffe082;">
              出战卡组 ${store.data.activeDeckIndex + 1}：${deck.name}
            </span>
            <span style="font-size:11px;color:#b0bec5;">点任意卡牌升级或替换</span>
          </div>

          <div class="equipped-deck-grid">
            <div class="unit-2x2">
              ${deck.units.map((cid, idx) => this.renderCardTileHTML(cid, `兵营${idx + 1}`)).join('')}
            </div>
            <div class="support-1x2">
              ${this.renderCardTileHTML(deck.defense, '防御塔')}
              ${this.renderCardTileHTML(deck.mine, '金矿')}
            </div>
          </div>

          <div class="deck-preset-tabs">
            ${store.data.decks
              .map(
                (d, idx) =>
                  `<button class="preset-btn ${idx === store.data.activeDeckIndex ? 'active' : ''}" data-preset="${idx}" title="${d.name}">${idx + 1}</button>`
              )
              .join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 2px;">
          <span style="font-size:13px;font-weight:800;">已获得红警部队: ${ALL_CARD_IDS.length}/${ALL_CARD_IDS.length}</span>
          <div style="display:flex;gap:6px;">
            <button class="action-btn ${this.sortBy === 'rarity' ? 'gold' : 'secondary'}" id="btn-sort-rarity" style="padding:4px 10px;font-size:11.5px;">品质</button>
            <button class="action-btn ${this.sortBy === 'level' ? 'gold' : 'secondary'}" id="btn-sort-level" style="padding:4px 10px;font-size:11.5px;">等级</button>
          </div>
        </div>

        <div class="collection-grid">
          ${sortedCards.map((cid) => this.renderCardTileHTML(cid)).join('')}
        </div>
      `;
    }

    if (this.activeTab === 'commander') {
      return `
        <div class="deck-panel-box">
          <h3 style="font-size:16px;color:#ffe082;margin-bottom:4px;">🎖️ 红警指挥官与空投伞兵战术</h3>
          <p style="font-size:12px;color:#cfd8dc;">选择出战指挥官，可在战斗右下角释放专属逆转大招，并获得全军被动增益！</p>
        </div>
        ${COMMANDERS.map((cmd) => {
          const selected = store.data.selectedCommanderId === cmd.id;
          return `
            <div class="deck-panel-box" style="border-color:${selected ? '#ffe082' : 'rgba(255,255,255,0.2)'};">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <span style="background:${cmd.themeColor};padding:2px 8px;border-radius:6px;font-size:11px;font-weight:900;">${cmd.title}</span>
                  <h3 style="font-size:17px;margin-top:5px;">${cmd.name} ${'⭐'.repeat(cmd.stars)}</h3>
                </div>
                <button class="action-btn ${selected ? 'green' : 'gold'}" data-select-cmd="${cmd.id}">
                  ${selected ? '✔ 出战中' : '设为统帅'}
                </button>
              </div>
              <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.3);font-size:12px;line-height:1.5;">
                <div style="color:#69f0ae;font-weight:800;">主动技能【${cmd.skillName}】（冷却 ${cmd.cooldown}s）：</div>
                <div>${cmd.skillDesc}</div>
                <div style="margin-top:4px;color:#ffd54f;">被动加成：${cmd.passiveDesc}</div>
              </div>
            </div>
          `;
        }).join('')}
      `;
    }

    if (this.activeTab === 'shop') {
      return `
        <div class="deck-panel-box" style="text-align:center;">
          <h3 style="font-size:17px;color:#ffe082;">📦 军团军火补给站</h3>
          <p style="font-size:12px;color:#cfd8dc;margin-top:4px;">抽取红警部队碎片升级兵种等级，永久提升全军战力百分比！</p>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h4 style="font-size:15px;color:#69f0ae;">🎁 每日免费军备空投</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">立得 金币 +600、钻石 +40 及随机兵种碎片！</p>
          </div>
          <button class="action-btn ${store.data.dailyShopClaimed ? 'secondary' : 'green'}" id="btn-shop-free">
            ${store.data.dailyShopClaimed ? '已领取' : '免费领取'}
          </button>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h4 style="font-size:15px;color:#80d8ff;">🧰 精锐部队五连抽补给箱</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">必出 5 组高阶红警兵种/光棱塔/金矿卡牌碎片！</p>
          </div>
          <button class="action-btn gold" id="btn-shop-gems">💎 80 抽取</button>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h4 style="font-size:15px;color:#ffe082;">🪙 军费物资征召箱</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">消耗金币抽取 4 组主力作战兵种碎片！</p>
          </div>
          <button class="action-btn" id="btn-shop-gold">🪙 1200 抽取</button>
        </div>
      `;
    }

    // Tab 5: Unit Counter Matrix & Tactical Manual (`克制`)
    return `
      <div class="deck-panel-box">
        <h3 style="font-size:16px;color:#ffe082;margin-bottom:6px;">⚔️ 《精英军团》核心兵种克制闭环</h3>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;line-height:1.45;">
          <div style="padding:8px;border-radius:8px;background:rgba(41,121,255,0.2);border-left:4px solid #4fc3f7;">
            <b>🪖 重机枪兵 ➔ 克制 ➔ 🚙 装甲车系 (225%伤害)</b><br/>
            穿甲加特林撕碎【导弹车】与【火炮战车】，并可轻火力防空。
          </div>
          <div style="padding:8px;border-radius:8px;background:rgba(0,230,118,0.16);border-left:4px solid #69f0ae;">
            <b>🏰 机枪碉堡 ➔ 克制 ➔ 🪖 步兵系 (225%伤害)</b><br/>
            钢筋混凝土机枪火网瞬间融化敌方【重机枪兵】【突击大兵】与【空降伞兵】！
          </div>
          <div style="padding:8px;border-radius:8px;background:rgba(171,71,188,0.22);border-left:4px solid #ce93d8;">
            <b>✈️ 火箭飞行兵 / 黑鹰战机 ➔ 克制 ➔ 🛡️ 坦克系 (225%伤害)</b><br/>
            无视地形直飞高空打击！陆战【主战坦克】无法对空，只能挨打！
          </div>
          <div style="padding:8px;border-radius:8px;background:rgba(255,171,0,0.18);border-left:4px solid #ffd54f;">
            <b>🚙 导弹车 / 🚀 防空塔 ➔ 克制 ➔ ✈️ 空军系 (225%伤害)</b><br/>
            敌方爆飞行兵或黑鹰战机时，翻开导弹车或防空导弹塔即可轻松净空！
          </div>
          <div style="padding:8px;border-radius:8px;background:rgba(255,82,82,0.18);border-left:4px solid #ff5252;">
            <b>🚙 火炮战车 / 🛡️ 主战坦克 ➔ 克制 ➔ 🏰 机枪碉堡与防御塔</b><br/>
            火炮车超远射程白嫖拆毁敌方碉堡群，主战坦克厚甲顶线推进！
          </div>
        </div>
      </div>

      <div class="deck-panel-box" style="font-size:12px;line-height:1.6;color:#e0f7fa;">
        <h4 style="color:#80d8ff;margin-bottom:4px;">💡 实战“开格子”必胜秘诀：</h4>
        1. <b>开局先开双矿</b>：地图上闪烁彩色宝石圈的格子必出【钻井金矿】，经济领先才能源源不断暴兵！<br/>
        2. <b>侦察敌方基地</b>：点右侧【🔭敌情】或拖动屏幕观察上方敌军解锁了什么兵营，针对性翻开克制兵营！<br/>
        3. <b>伞兵奇袭断矿</b>：右下角【🪂召唤伞兵】冷却完毕后，直接点击敌军后排金矿空投5名精锐伞兵偷矿！
      </div>
    `;
  }

  private drawSnowyWatchtowerDiorama(): void {
    if (this.dioramaRaf) {
      cancelAnimationFrame(this.dioramaRaf);
      this.dioramaRaf = null;
    }
    const canvas = this.root.querySelector('#diorama-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const snowFlakes = Array.from({ length: 26 }, (_, i) => ({
      x: ((i * 53) % 440) - 220,
      y: ((i * 41) % 300) - 160,
      r: 1.8 + (i % 3) * 1.1,
      spd: 0.45 + (i % 4) * 0.22,
    }));

    const renderFrame = (timeMs: number) => {
      if (!canvas.isConnected || this.view !== 'lobby' || this.activeTab !== 'battle') {
        this.dioramaRaf = null;
        return;
      }
      const t = timeMs * 0.001;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(290, 215 + Math.sin(t * 2.1) * 4);

      // 3D Isometric Metallic Hex Base Pedestal (Screenshot 4!)
      ctx.fillStyle = '#1b2845';
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -145);
      ctx.lineTo(225, -35);
      ctx.lineTo(175, 130);
      ctx.lineTo(-175, 130);
      ctx.lineTo(-225, -35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Snowy Terrain Island + Frozen Cyan River in Center
      ctx.fillStyle = '#eceff1';
      ctx.beginPath();
      ctx.moveTo(0, -132);
      ctx.lineTo(205, -30);
      ctx.lineTo(155, 112);
      ctx.lineTo(-155, 112);
      ctx.lineTo(-205, -30);
      ctx.closePath();
      ctx.fill();

      // Shimmering cyan river channel + wooden bridge
      ctx.fillStyle = '#4dd0e1';
      ctx.beginPath();
      ctx.ellipse(-25, 32, 88, 42, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(-25 + Math.sin(t * 2) * 5, 32, 54, 20, 0.35, 0, Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#8d6e63';
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 3;
      ctx.save();
      ctx.translate(-15, 36);
      ctx.rotate(-0.42);
      ctx.fillRect(-34, -12, 68, 24);
      ctx.strokeRect(-34, -12, 68, 24);
      ctx.restore();

      // Snowy Rock Cliff + Red Alert Watchtower with Waving Red Flag at Peak!
      ctx.fillStyle = '#78909c';
      ctx.fillRect(-55, -95, 120, 68);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(5, -95, 68, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 5;
      ctx.strokeRect(-18, -155, 36, 52);
      ctx.fillStyle = '#eceff1';
      ctx.beginPath();
      ctx.moveTo(-26, -155);
      ctx.lineTo(0, -176);
      ctx.lineTo(26, -155);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Animated waving red flag!
      const wave = Math.sin(t * 6.5) * 4.5;
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -176);
      ctx.lineTo(0, -204);
      ctx.stroke();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.moveTo(0, -204);
      ctx.quadraticCurveTo(15, -200 + wave, 30, -195 - wave * 0.5);
      ctx.lineTo(0, -187);
      ctx.closePath();
      ctx.fill();

      // Snow-dusted pine trees around island
      const pines = [
        [-135, -35],
        [-75, -108],
        [95, -95],
        [142, -18],
        [-125, 65],
      ];
      for (const [px, py] of pines) {
        ctx.fillStyle = '#2e7d32';
        for (let tier = 0; tier < 3; tier++) {
          const yOff = py - tier * 18;
          const w = 32 - tier * 6;
          ctx.beginPath();
          ctx.moveTo(px, yOff - 28);
          ctx.lineTo(px + w, yOff);
          ctx.lineTo(px - w, yOff);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(px, yOff - 28);
          ctx.lineTo(px + w * 0.55, yOff - 12);
          ctx.lineTo(px - w * 0.55, yOff - 12);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#2e7d32';
        }
      }

      // Gently drifting snowflakes
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (const sf of snowFlakes) {
        sf.y += sf.spd;
        sf.x += Math.sin(t * 1.5 + sf.r) * 0.35;
        if (sf.y > 140) sf.y = -175;
        ctx.beginPath();
        ctx.arc(sf.x, sf.y, sf.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      this.dioramaRaf = requestAnimationFrame(renderFrame);
    };

    this.dioramaRaf = requestAnimationFrame(renderFrame);
  }

  private bindLobbyEvents(): void {
    this.root.querySelector('#btn-share-url')?.addEventListener('click', () => {
      sound.playClick();
      const instantUrl = 'https://raw.githack.com/hjhfg/-/arena/d056a933-repo/docs/index.html';
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card" style="text-align:center;">
          <h3 style="font-size:18px;color:#ffe082;margin-bottom:8px;">🌐 手机端在线部署地址</h3>
          <p style="font-size:12.5px;color:#cfd8dc;line-height:1.5;">
            复制以下公网直连地址在手机浏览器打开，即可全屏触控畅玩《精英军团》：
          </p>
          <div style="margin:12px 0;padding:10px;border-radius:9px;background:rgba(0,0,0,0.45);border:1px solid #80d8ff;font-size:12px;word-break:break-all;font-weight:800;color:#69f0ae;user-select:text;-webkit-user-select:text;">
            ${instantUrl}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="action-btn gold" id="btn-copy-link" style="flex:1;">📋 复制公网直连网址</button>
            <button class="action-btn secondary" id="btn-close-share">关闭</button>
          </div>
        </div>
      `;
      this.root.appendChild(modal);
      modal.querySelector('#btn-close-share')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#btn-copy-link')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(instantUrl).catch(() => {});
        this.showToast('✅ 已复制公网直连网址！', 'good');
        modal.remove();
      });
    });

    this.root.querySelector('#btn-toggle-sound')?.addEventListener('click', () => {
      store.data.soundEnabled = !store.data.soundEnabled;
      sound.enabled = store.data.soundEnabled;
      if (!sound.enabled) sound.stopBGM();
      store.save();
      this.render();
    });

    this.root.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.activeTab = (btn as HTMLElement).dataset.tab as LobbyTab;
        this.render();
      });
    });

    this.root.querySelectorAll('[data-quick-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.activeTab = (btn as HTMLElement).dataset.quickTab as LobbyTab;
        this.render();
      });
    });

    this.root.querySelector('#btn-daily-quest')?.addEventListener('click', () => {
      sound.playClick();
      this.activeTab = 'shop';
      this.render();
    });

    this.root.querySelector('#btn-free-bonus')?.addEventListener('click', () => {
      sound.playBuild();
      store.data.gold += 250;
      store.save();
      this.showToast('🎁 领取军团战备津贴 +250 金币！', 'good');
      this.render();
    });

    this.root.querySelector('#btn-switch-opp')?.addEventListener('click', () => {
      sound.playClick();
      const idx = (OPPONENT_PROFILES.indexOf(this.currentOpponent) + 1) % OPPONENT_PROFILES.length;
      this.currentOpponent = OPPONENT_PROFILES[idx];
      this.showToast(`🎯 下一战匹配目标已切换：${this.currentOpponent.name}`, 'info');
    });

    this.root.querySelector('#btn-start-pvp')?.addEventListener('click', () => {
      sound.unlock();
      sound.playBuild();
      this.enterMatchmaking('pvp');
    });

    this.root.querySelector('#btn-start-coop')?.addEventListener('click', () => {
      sound.unlock();
      sound.playBuild();
      this.enterMatchmaking('coop');
    });

    this.root.querySelector('#btn-chat-coop')?.addEventListener('click', () => {
      sound.unlock();
      sound.playBuild();
      this.enterMatchmaking('coop');
    });

    // Chest opening
    this.root.querySelectorAll('.chest-slot').forEach((slotEl) => {
      slotEl.addEventListener('click', () => {
        const idx = Number((slotEl as HTMLElement).dataset.chestIdx);
        const res = store.openChest(idx);
        if (!res.ok || !res.rewards) {
          sound.playClick();
          this.showToast(res.msg, 'info');
          return;
        }
        sound.playVictory(true);
        this.render();
        this.showRewardsModal('🎉 宝箱开启成功！', res.rewards);
      });
    });

    // Deck presets & card modals
    this.root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.playClick();
        store.data.activeDeckIndex = Number((btn as HTMLElement).dataset.preset);
        store.save();
        this.render();
      });
    });

    this.root.querySelector('#btn-sort-rarity')?.addEventListener('click', () => {
      this.sortBy = 'rarity';
      this.render();
    });
    this.root.querySelector('#btn-sort-level')?.addEventListener('click', () => {
      this.sortBy = 'level';
      this.render();
    });

    this.root.querySelectorAll('.ra-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const cid = (cardEl as HTMLElement).dataset.cardId!;
        sound.playClick();
        this.openCardDetailModal(cid);
      });
    });

    // Commander selection
    this.root.querySelectorAll('[data-select-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.selectCmd!;
        store.data.selectedCommanderId = cid;
        store.save();
        sound.playSkill();
        this.showToast(`🎖️ 已委任统帅！战斗右下角技能已更新`, 'good');
        this.render();
      });
    });

    // Supply Shop Gacha Buttons
    this.root.querySelector('#btn-shop-free')?.addEventListener('click', () => {
      if (store.data.dailyShopClaimed) {
        this.showToast('今日免费补给已领取！可体验钻石/金币抽卡包', 'info');
        return;
      }
      store.data.dailyShopClaimed = true;
      store.data.gold += 600;
      store.data.diamonds += 40;
      const randomCard = ALL_CARD_IDS[Math.floor(Math.random() * ALL_CARD_IDS.length)];
      store.data.cardShards[randomCard] = (store.data.cardShards[randomCard] || 0) + 25;
      store.save();
      sound.playVictory(true);
      this.render();
      this.showRewardsModal('🎁 每日军备补给到账！', {
        gold: 600,
        diamonds: 40,
        cards: [{ id: randomCard, count: 25 }],
      });
    });

    this.root.querySelector('#btn-shop-gems')?.addEventListener('click', () => {
      if (store.data.diamonds < 80) {
        this.showToast('钻石不足 80！打赢对战或开箱可获得钻石', 'warn');
        return;
      }
      store.data.diamonds -= 80;
      const picks = [...ALL_CARD_IDS].sort(() => Math.random() - 0.5).slice(0, 5);
      const cards = picks.map((id) => {
        const count = CARDS[id].rarity === 'legendary' ? 4 : 28;
        store.data.cardShards[id] = (store.data.cardShards[id] || 0) + count;
        return { id, count };
      });
      store.save();
      sound.playVictory(true);
      this.render();
      this.showRewardsModal('✨ 精锐五连抽补给结果', { gold: 200, diamonds: 0, cards });
    });

    this.root.querySelector('#btn-shop-gold')?.addEventListener('click', () => {
      if (store.data.gold < 1200) {
        this.showToast('金币不足 1200！', 'warn');
        return;
      }
      store.data.gold -= 1200;
      const picks = [...ALL_CARD_IDS].sort(() => Math.random() - 0.5).slice(0, 4);
      const cards = picks.map((id) => {
        const count = CARDS[id].rarity === 'legendary' ? 3 : 20;
        store.data.cardShards[id] = (store.data.cardShards[id] || 0) + count;
        return { id, count };
      });
      store.save();
      sound.playVictory(true);
      this.render();
      this.showRewardsModal('🪙 军费征召结果', { gold: 0, diamonds: 5, cards });
    });
  }

  private openCardDetailModal(cardId: string): void {
    const card = CARDS[cardId];
    const lv = store.data.cardLevels[cardId] || 8;
    const shards = store.data.cardShards[cardId] || 0;
    const needed = store.getShardsNeeded(cardId);
    const goldCost = store.getUpgradeGoldCost(cardId);
    const deck = store.getActiveDeck();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div style="display:flex;gap:12px;align-items:center;">
          <img src="${renderCardIllustrationDataURL(cardId)}" style="width:92px;height:82px;object-fit:contain;background:rgba(255,255,255,0.08);border-radius:10px;padding:4px;" />
          <div style="flex:1;">
            <div style="font-size:18px;font-weight:900;">${card.name} <span style="color:#ffd54f;font-size:14px;">${lv}级</span></div>
            <div style="font-size:12px;color:#80d8ff;margin-top:2px;">解锁格耗费: 🪙 ${card.cost} | 建筑: ${card.buildingName}</div>
            <div style="font-size:11.5px;color:#cfd8dc;margin-top:3px;">碎片进度: ${shards} / ${needed}</div>
          </div>
        </div>

        <p style="margin-top:10px;font-size:12.5px;line-height:1.5;color:#eceff1;">${card.description}</p>

        <div style="margin-top:10px;padding:9px;border-radius:8px;background:rgba(0,0,0,0.34);font-size:12px;line-height:1.55;">
          <div style="color:#69f0ae;font-weight:800;">✔ ${card.countersText}</div>
          <div style="color:#ff8a80;margin-top:3px;">✖ ${card.counteredByText}</div>
        </div>

        ${
          card.slotType === 'unit'
            ? `
            <div style="margin-top:12px;">
              <div style="font-size:12px;color:#ffe082;margin-bottom:6px;font-weight:800;">选择替换出战兵营槽位：</div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
                ${deck.units
                  .map(
                    (uc, idx) => `
                    <button class="action-btn secondary" data-equip-slot="${idx}" style="font-size:11px;padding:7px 4px;">
                      槽${idx + 1}: ${CARDS[uc].shortName}
                    </button>
                  `
                  )
                  .join('')}
              </div>
            </div>
          `
            : card.slotType === 'defense'
              ? `
            <div style="margin-top:12px;">
              <button class="action-btn green" id="btn-equip-def" style="width:100%;">
                ${deck.defense === cardId ? '✔ 当前已装备该防御塔' : `上阵替换【${CARDS[deck.defense].shortName}】`}
              </button>
            </div>
          `
              : ''
        }

        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="action-btn gold" id="btn-do-upgrade" style="flex:1;">
            ⬆ 升级卡牌 (🪙 ${goldCost})
          </button>
          <button class="action-btn secondary" id="btn-close-modal">关闭</button>
        </div>
      </div>
    `;

    this.root.appendChild(modal);

    modal.querySelector('#btn-close-modal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#btn-do-upgrade')?.addEventListener('click', () => {
      const res = store.upgradeCard(cardId);
      if (res.ok) {
        sound.playSkill();
        this.showToast(res.msg, 'good');
        modal.remove();
        this.render();
      } else {
        sound.playClick();
        this.showToast(res.msg, 'warn');
      }
    });

    modal.querySelector('#btn-equip-def')?.addEventListener('click', () => {
      const msg = store.equipCardToSlot(cardId);
      sound.playBuild();
      this.showToast(msg, 'good');
      modal.remove();
      this.render();
    });

    modal.querySelectorAll('[data-equip-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slotIdx = Number((btn as HTMLElement).dataset.equipSlot);
        const msg = store.equipCardToSlot(cardId, slotIdx);
        sound.playBuild();
        this.showToast(msg, 'good');
        modal.remove();
        this.render();
      });
    });
  }

  private showRewardsModal(
    title: string,
    rewards: { gold: number; diamonds: number; cards: Array<{ id: string; count: number }> }
  ): void {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <h3 style="font-size:19px;color:#ffe082;margin-bottom:10px;">${title}</h3>
        <div style="display:flex;justify-content:center;gap:16px;font-size:15px;font-weight:900;margin-bottom:12px;">
          ${rewards.gold > 0 ? `<span>🪙 +${rewards.gold}</span>` : ''}
          ${rewards.diamonds > 0 ? `<span>💎 +${rewards.diamonds}</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(4, Math.max(1, rewards.cards.length))}, 1fr);gap:8px;">
          ${rewards.cards
            .map(
              (c) => `
              <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:6px;border:1px solid #80d8ff;">
                <img src="${renderCardIllustrationDataURL(c.id)}" style="width:100%;height:56px;object-fit:contain;" />
                <div style="font-size:11px;font-weight:800;">${CARDS[c.id].shortName}</div>
                <div style="font-size:12px;color:#69f0ae;font-weight:900;">+${c.count} 碎片</div>
              </div>
            `
            )
            .join('')}
        </div>
        <button class="action-btn gold" id="btn-ok-reward" style="margin-top:14px;width:100%;">收下物资</button>
      </div>
    `;
    this.root.appendChild(modal);
    modal.querySelector('#btn-ok-reward')?.addEventListener('click', () => modal.remove());
  }

  // =========================================================================
  // 2. MATCHMAKING SCREEN (`搜寻对手..` — Exact Match to Screenshot 3!)
  // =========================================================================
  private enterMatchmaking(mode: 'pvp' | 'coop'): void {
    this.pendingMode = mode;
    this.view = 'matchmaking';
    this.renderMatchmaking();
  }

  private renderMatchmaking(): void {
    const deck = store.getActiveDeck();
    const sixCards = [...deck.units, deck.defense, deck.mine];
    const tip = MATCH_TIPS[Math.floor(Math.random() * MATCH_TIPS.length)];
    const opp = this.currentOpponent;
    const onlineCount = 23480 + Math.floor(Math.random() * 160);

    this.root.innerHTML = `
      <div class="matchmaking-screen">
        <div class="mm-top-info">
          <div class="mm-title" id="mm-status-text">
            ${this.pendingMode === 'coop' ? '匹配合作战友..' : '搜寻对手..'}
          </div>
          <div class="mm-timer-pill">⏱ <span id="mm-sec">1s</span></div>
          <div style="font-size:12.5px;font-weight:700;">
            当前有 <span style="color:#69f0ae;font-weight:900;">${onlineCount}人</span> 正在战斗中，预计匹配时间: <span style="color:#69f0ae;">2s</span>
          </div>
        </div>

        <div class="mm-enemy-banner" id="mm-enemy-box">
          <div>
            <div style="font-size:13px;color:#ffcdd2;">正在雷达扫描战区目标...</div>
            <div style="font-size:18px;font-weight:900;margin-top:4px;" id="mm-opp-reveal">🔍 搜索信号中</div>
          </div>
          <div style="font-size:48px;">🔍</div>
        </div>

        <div class="mm-player-banner">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="mini-ava"><img src="${renderAvatarDataURL('player')}" alt="me" /></div>
              <div>
                <div style="font-size:15px;font-weight:900;">${store.data.playerName}</div>
                <div style="font-size:12px;">✊ ${store.getCombatPowerPct()}% &nbsp; 🏆 ${store.data.trophies}</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="action-btn gold" id="btn-instant-go" style="padding:5px 9px;font-size:11.5px;">⚡秒进</button>
              <button class="action-btn secondary" id="btn-cancel-mm" style="padding:5px 10px;font-size:11.5px;">取消</button>
            </div>
          </div>

          <div class="mm-deck-strip">
            ${sixCards
              .map(
                (cid) => `
                <div style="background:rgba(12,24,48,0.65);border:1.5px solid #90caf9;border-radius:7px;padding:3px;text-align:center;position:relative;">
                  <span style="position:absolute;top:-4px;left:-3px;background:#ffb300;color:#000;font-size:9px;font-weight:900;padding:0 3px;border-radius:6px;">${CARDS[cid].cost}</span>
                  <img src="${renderCardIllustrationDataURL(cid)}" style="width:100%;height:42px;object-fit:contain;" />
                  <div style="font-size:9.5px;font-weight:800;">${store.data.cardLevels[cid] || 8}级</div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>

        <div style="text-align:center;padding:0 14px;font-size:12.5px;font-weight:800;text-shadow:0 1px 3px #000;">
          🔊 ${tip}
        </div>
      </div>
    `;

    this.root.querySelector('#btn-instant-go')?.addEventListener('click', () => {
      if (this.matchTimerHandle) clearInterval(this.matchTimerHandle);
      this.launchPhaserBattle();
    });

    this.root.querySelector('#btn-cancel-mm')?.addEventListener('click', () => {
      if (this.matchTimerHandle) clearInterval(this.matchTimerHandle);
      this.view = 'lobby';
      this.render();
    });

    let sec = 1;
    this.matchTimerHandle = window.setInterval(() => {
      sec++;
      const secEl = this.root.querySelector('#mm-sec');
      if (secEl) secEl.textContent = `${sec}s`;

      if (sec === 2) {
        sound.playClick();
        const statusEl = this.root.querySelector('#mm-status-text');
        const revealEl = this.root.querySelector('#mm-opp-reveal');
        if (statusEl) statusEl.textContent = '发现敌军基地！';
        if (revealEl) {
          revealEl.textContent =
            this.pendingMode === 'coop'
              ? `盟友【苍白哥哥】已就位 vs 红警BOSS群`
              : `${opp.name}（✊ ${opp.powerPct}%）`;
        }
      }

      if (sec >= 3) {
        if (this.matchTimerHandle) clearInterval(this.matchTimerHandle);
        this.launchPhaserBattle();
      }
    }, 550);
  }

  // =========================================================================
  // 3. LIVE BATTLE HUD & INTERACTIVE CONTROLS (Screenshots 6, 1, 2, 7)
  // =========================================================================
  private launchPhaserBattle(): void {
    const scene = this.getBattleScene();
    if (!scene) return;

    this.view = 'battle';
    this.renderBattleHUD();

    scene.startNewMatch({
      mode: this.pendingMode,
      opponent: this.currentOpponent,
      onHudUpdate: (hud) => this.updateBattleHUDDOM(hud),
      onPinInspect: (cardId, cost, level, sx, sy) => this.showHexCardTooltip(cardId, cost, level, sx, sy),
      onToast: (msg, tone) => this.showToast(msg, tone),
      onBattleEnd: (summary) => this.showBattleResultModal(summary),
    });
  }

  private renderBattleHUD(): void {
    const opp = this.currentOpponent;
    const oppTrophies = Math.max(120, store.data.trophies + opp.trophiesOffset);
    const cmd = COMMANDERS.find((c) => c.id === store.data.selectedCommanderId) || COMMANDERS[0];

    this.root.innerHTML = `
      <div class="battle-hud">
        <!-- Top Territory Bar + Dual Player Headers + Countdown -->
        <div class="bhud-top">
          <div class="territory-bar">
            <div class="territory-blue-fill" id="hud-blue-bar" style="width:50%;"></div>
            <div class="territory-label left" id="hud-player-tiles">93格</div>
            <div class="territory-label right" id="hud-enemy-tiles">93格</div>
          </div>

          <div class="bhud-players-row">
            <div>
              <div class="player-mini-box">
                <div class="mini-ava"><img src="${renderAvatarDataURL('player')}" alt="player" /></div>
                <div>
                  <div style="font-size:12.5px;font-weight:900;color:#80d8ff;">${store.data.playerName}</div>
                  <div style="font-size:11px;font-weight:800;">🏆 ${store.data.trophies}</div>
                  <div style="font-size:11px;font-weight:800;color:#ffd54f;">✊ ${store.getCombatPowerPct()}%</div>
                </div>
              </div>
              <div class="pop-pill">👤 <span id="hud-p-pop">0/50</span></div>
            </div>

            <div class="match-clock-box">
              <div>⏱ <span id="hud-clock">04:00</span></div>
              <div id="hud-mode-sub" style="font-size:10px;color:#80d8ff;display:none;"></div>
            </div>

            <div>
              <div class="player-mini-box right">
                <div class="mini-ava"><img src="${renderAvatarDataURL(opp.avatarType)}" alt="enemy" /></div>
                <div>
                  <div style="font-size:12.5px;font-weight:900;color:#ff8a80;">
                    ${this.pendingMode === 'coop' ? '北方红警要塞' : opp.name}
                  </div>
                  <div style="font-size:11px;font-weight:800;">🏆 ${oppTrophies}</div>
                  <div style="font-size:11px;font-weight:800;color:#ffd54f;">✊ ${opp.powerPct}%</div>
                </div>
              </div>
              <div class="pop-pill">👤 <span id="hud-e-pop">0/50</span></div>
              <div class="enemy-para-badge" title="敌军伞兵空投倒计时">🪂 <span id="hud-e-para">31s</span></div>
            </div>
          </div>
        </div>

        <!-- Middle Quick Tactical & Camera Controls -->
        <div class="bhud-mid" id="bhud-mid-layer">
          <div class="right-cam-tools">
            <button class="cam-jump-btn" data-cam="enemy">🔭敌情</button>
            <button class="cam-jump-btn" data-cam="front">⚔️前线</button>
            <button class="cam-jump-btn" data-cam="home">🏠基地</button>
            <button class="cam-jump-btn" data-cam="overview">🗺️全景</button>
          </div>

          <div class="left-side-tools">
            <button class="tool-square-btn" id="btn-battle-menu" title="菜单/倍速">☰</button>
            <button class="tool-square-btn" id="btn-battle-guide" title="兵种克制表">📖</button>
            <button class="tool-square-btn" id="btn-battle-emote" title="发送战地指令">😄</button>
            <button class="tool-square-btn" id="btn-battle-stats" style="font-size:11px;">战况</button>
          </div>
        </div>

        <!-- Bottom Action Bar: 科技强化 | 金币 | 召唤伞兵 | 指挥官技能 -->
        <div class="bhud-bottom">
          <button class="hex-action-btn" id="btn-tech-up">
            <span style="font-size:22px;line-height:1;">🛠️</span>
            <span style="font-size:11.5px;font-weight:900;" id="hud-tech-label">科技强化</span>
            <span style="font-size:12px;font-weight:900;color:#ffd54f;" id="hud-tech-cost">🪙 30</span>
          </button>

          <div class="gold-counter-pill">
            <span style="font-size:20px;">🪙</span>
            <span class="gold-num" id="hud-gold">65</span>
            <span style="font-size:10.5px;color:#69f0ae;font-weight:800;" id="hud-income">+4.0/s</span>
          </div>

          <div style="display:flex;align-items:flex-end;gap:7px;">
            <button class="hex-action-btn" id="btn-paratrooper">
              <span style="font-size:21px;line-height:1;">🪂</span>
              <span style="font-size:13px;font-weight:900;" id="hud-para-cd">14s</span>
              <span style="font-size:11px;font-weight:900;">召唤伞兵</span>
            </button>

            <button class="cmd-skill-btn" id="btn-cmd-skill" title="${cmd.skillName}：${cmd.skillDesc}">
              <span style="font-size:18px;line-height:1;">⚡</span>
              <span id="hud-cmd-cd">8s</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindBattleHUDEvents();
  }

  private bindBattleHUDEvents(): void {
    const scene = () => this.getBattleScene();

    this.root.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.playClick();
        const target = (btn as HTMLElement).dataset.cam as 'home' | 'front' | 'enemy' | 'overview';
        scene()?.focusCameraPreset(target);
      });
    });

    this.root.querySelector('#btn-tech-up')?.addEventListener('click', () => {
      scene()?.triggerTechUpgrade();
    });

    this.root.querySelector('#btn-paratrooper')?.addEventListener('click', () => {
      scene()?.triggerParatrooperButton();
    });

    this.root.querySelector('#btn-cmd-skill')?.addEventListener('click', () => {
      scene()?.triggerCommanderSkill();
    });

    this.root.querySelector('#btn-battle-guide')?.addEventListener('click', () => {
      sound.playClick();
      this.showQuickCounterOverlay();
    });

    this.root.querySelector('#btn-battle-emote')?.addEventListener('click', () => {
      sound.playClick();
      const lines = [
        '💬 指挥官：准备迎接钢铁洪流吧！',
        '💬 指挥官：重机枪兵就位，专治装甲车！',
        '💬 指挥官：火箭飞行兵升空，坦克颤抖吧！',
        '💬 指挥官：开矿暴兵，一举推平敌方基地！',
      ];
      this.showToast(lines[Math.floor(Math.random() * lines.length)], 'good');
    });

    this.root.querySelector('#btn-battle-stats')?.addEventListener('click', () => {
      sound.playClick();
      if (!this.lastHud) return;
      const h = this.lastHud;
      this.showToast(
        `📊 已建建筑 ${h.buildingsBuilt} | 出兵 ${h.playerUnitsSpawned} | 歼敌 ${h.enemyUnitsKilled} | 采矿 ${h.totalGoldMined}`,
        'info'
      );
    });

    this.root.querySelector('#btn-battle-menu')?.addEventListener('click', () => {
      sound.playClick();
      this.openBattlePauseMenu();
    });
  }

  private updateBattleHUDDOM(h: LiveBattleHUDState): void {
    this.lastHud = h;
    if (this.view !== 'battle') return;

    const totalTiles = Math.max(1, h.playerTiles + h.enemyTiles);
    const bluePct = ((h.playerTiles / totalTiles) * 100).toFixed(1);

    const setTxt = (sel: string, val: string) => {
      const el = this.root.querySelector(sel);
      if (el && el.textContent !== val) el.textContent = val;
    };

    const barEl = this.root.querySelector('#hud-blue-bar') as HTMLElement | null;
    if (barEl) barEl.style.width = `${bluePct}%`;

    setTxt('#hud-player-tiles', `${h.playerTiles}格`);
    setTxt('#hud-enemy-tiles', `${h.enemyTiles}格`);
    setTxt('#hud-p-pop', `${h.playerPop}/${h.playerMaxPop}`);
    setTxt('#hud-e-pop', `${h.enemyPop}/${h.enemyMaxPop}`);
    setTxt('#hud-e-para', `${h.enemyParatrooperCd}s`);

    const mins = String(Math.floor(h.timeRemainingSec / 60)).padStart(2, '0');
    const secs = String(Math.floor(h.timeRemainingSec % 60)).padStart(2, '0');
    setTxt('#hud-clock', `${mins}:${secs}`);

    const modeSub = this.root.querySelector('#hud-mode-sub') as HTMLElement | null;
    if (modeSub) {
      if (h.mode === 'coop') {
        modeSub.style.display = 'block';
        modeSub.textContent = `合作波次 ${h.coopWave}/${h.coopMaxWave}`;
      } else {
        modeSub.style.display = 'none';
      }
    }

    setTxt('#hud-gold', `${h.playerGold}`);
    setTxt('#hud-income', `+${h.playerGoldPerSec}/s`);

    setTxt('#hud-tech-label', `科技 Lv.${h.techLevel}`);
    const techCostEl = this.root.querySelector('#hud-tech-cost') as HTMLElement | null;
    if (techCostEl) {
      techCostEl.textContent = h.techLevel >= 6 ? '已满级' : `🪙 ${h.techCost}`;
      techCostEl.style.color = h.playerGold >= h.techCost ? '#ffd54f' : '#ff5252';
    }

    // Paratrooper Button State
    const paraBtn = this.root.querySelector('#btn-paratrooper') as HTMLElement | null;
    if (paraBtn) {
      if (h.paratrooperTargeting) {
        paraBtn.className = 'hex-action-btn targeting-active';
        setTxt('#hud-para-cd', '点地图!');
      } else if (h.paratrooperCd <= 0) {
        paraBtn.className = 'hex-action-btn ready-glow';
        setTxt('#hud-para-cd', '可空投!');
      } else {
        paraBtn.className = 'hex-action-btn';
        setTxt('#hud-para-cd', `${Math.ceil(h.paratrooperCd)}s`);
      }
    }

    // Commander Skill Button State
    const cmdBtn = this.root.querySelector('#btn-cmd-skill') as HTMLElement | null;
    if (cmdBtn) {
      if (h.commanderCd <= 0) {
        cmdBtn.style.borderColor = '#ffeb3b';
        cmdBtn.style.boxShadow = '0 0 14px rgba(255,235,59,0.85)';
        setTxt('#hud-cmd-cd', '释放!');
      } else {
        cmdBtn.style.borderColor = '#a5d6a7';
        cmdBtn.style.boxShadow = 'none';
        setTxt('#hud-cmd-cd', `${Math.ceil(h.commanderCd)}s`);
      }
    }
  }

  /**
   * Exact Screenshot 1 Floating Card Tooltip right above tapped hex!
   */
  private showHexCardTooltip(cardId: string, cost: number, level: number, sx: number, sy: number): void {
    const old = this.root.querySelector('.hex-card-tooltip');
    if (old) old.remove();
    if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);

    const card = CARDS[cardId];
    if (!card) return;

    const tip = document.createElement('div');
    tip.className = 'hex-card-tooltip';
    const clampedX = Math.max(70, Math.min(this.root.clientWidth - 70, sx));
    const clampedY = Math.max(195, sy - 10);
    tip.style.left = `${clampedX}px`;
    tip.style.top = `${clampedY}px`;

    const needMore = Math.max(0, cost - (this.lastHud?.playerGold || 0));

    tip.innerHTML = `
      <div style="font-size:12.5px;font-weight:900;background:#1976d2;border-radius:6px;padding:2px 4px;margin-bottom:4px;">
        ${card.name}
      </div>
      <div style="position:relative;background:linear-gradient(180deg,#3484e8,#1b4c94);border-radius:7px;padding:4px;">
        <span style="position:absolute;top:-4px;left:-4px;background:#ffca28;color:#000;font-weight:900;font-size:10px;padding:1px 5px;border-radius:99px;">${cost}</span>
        <img src="${renderCardIllustrationDataURL(cardId)}" style="width:88px;height:66px;object-fit:contain;" />
        <div style="font-size:11px;font-weight:900;">${level}级</div>
      </div>
      <div style="font-size:10px;color:#69f0ae;margin-top:4px;line-height:1.3;font-weight:700;">
        ${card.countersText}
      </div>
      ${
        needMore > 0
          ? `<div style="font-size:10px;color:#ff8a80;margin-top:2px;font-weight:800;">还差 ${needMore} 金币解锁</div>`
          : ''
      }
    `;

    tip.addEventListener('click', () => tip.remove());
    this.root.appendChild(tip);
    this.tooltipTimeout = window.setTimeout(() => tip.remove(), 2400);
  }

  private showQuickCounterOverlay(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <h3 style="color:#ffe082;font-size:16px;margin-bottom:8px;">📖 战地兵种克制速查</h3>
        <div style="font-size:12.5px;line-height:1.75;">
          • <b>🪖 重机枪兵</b> ➔ 克制 <b>🚙 导弹车 / 火炮车</b> (225%伤害)<br/>
          • <b>🏰 机枪碉堡</b> ➔ 克制 <b>🪖 重机枪兵 / 大兵 / 伞兵</b> (225%伤害)<br/>
          • <b>✈️ 火箭飞行兵 / 战机</b> ➔ 克制 <b>🛡️ 主战坦克 / 天启重坦</b><br/>
          • <b>🚙 导弹车 / 🚀 防空塔</b> ➔ 克制 <b>✈️ 飞行兵 / 黑鹰战机</b><br/>
          • <b>🚙 火炮战车 / 🛡️ 坦克</b> ➔ 克制 <b>🏰 机枪碉堡 / 光棱塔</b>
        </div>
        <button class="action-btn gold" id="btn-close-guide" style="margin-top:12px;width:100%;">返回战斗</button>
      </div>
    `;
    this.root.appendChild(modal);
    modal.querySelector('#btn-close-guide')?.addEventListener('click', () => modal.remove());
  }

  private openBattlePauseMenu(): void {
    const scene = this.getBattleScene();
    scene?.setPausedState(true);

    const curSpeed = this.lastHud?.gameSpeed || 1;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <h3 style="font-size:18px;color:#ffe082;margin-bottom:12px;">⚙️ 战地指挥部菜单</h3>
        <div style="display:flex;flex-direction:column;gap:9px;">
          <button class="action-btn green" id="btn-resume">▶ 继续战斗</button>
          <button class="action-btn" id="btn-speed">⏩ 切换战斗速度（当前 ${curSpeed}x）</button>
          <button class="action-btn gold" id="btn-rematch">🔄 重新开局</button>
          <button class="action-btn secondary" id="btn-quit">🏳️ 撤退返回主界面</button>
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('#btn-resume')?.addEventListener('click', () => {
      scene?.setPausedState(false);
      modal.remove();
    });

    modal.querySelector('#btn-speed')?.addEventListener('click', () => {
      const nextSpd = scene?.toggleSpeed() || 1;
      scene?.setPausedState(false);
      this.showToast(`⏩ 战斗倍速已切换为 ${nextSpd}x`, 'good');
      modal.remove();
    });

    modal.querySelector('#btn-rematch')?.addEventListener('click', () => {
      modal.remove();
      this.launchPhaserBattle();
    });

    modal.querySelector('#btn-quit')?.addEventListener('click', () => {
      modal.remove();
      scene?.stopToBackdrop();
      this.view = 'lobby';
      this.render();
    });
  }

  private showBattleResultModal(summary: BattleEndSummary): void {
    const rewardInfo = store.recordBattleResult(summary.won, summary.mode);
    // Advance to next opponent profile on win so player faces fresh deck styles!
    if (summary.won) {
      const nextIdx = (OPPONENT_PROFILES.indexOf(this.currentOpponent) + 1) % OPPONENT_PROFILES.length;
      this.currentOpponent = OPPONENT_PROFILES[nextIdx];
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <div style="font-size:44px;margin-bottom:4px;">${summary.won ? '🏆' : '💥'}</div>
        <h2 style="font-size:24px;color:${summary.won ? '#ffd54f' : '#ff8a80'};">
          ${summary.won ? '战役大捷 · 胜利！' : '防线失守 · 惜败'}
        </h2>
        <p style="font-size:13px;color:#e0f7fa;margin-top:4px;">${summary.reason}</p>

        <div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.35);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;">
          <div>🟦 我方领地: <b>${summary.playerTiles}格</b></div>
          <div>🟥 敌方领地: <b>${summary.enemyTiles}格</b></div>
          <div>⚔️ 歼灭敌军: <b>${summary.kills}</b></div>
          <div>🏗️ 解锁建筑: <b>${summary.buildingsBuilt}</b></div>
        </div>

        <div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(255,213,79,0.12);border:1px solid rgba(255,213,79,0.4);font-size:13px;font-weight:800;">
          <div>
            🏆 奖杯 ${rewardInfo.trophyDelta >= 0 ? `+${rewardInfo.trophyDelta}` : rewardInfo.trophyDelta}
            &nbsp;|&nbsp; 🪙 +${rewardInfo.goldEarned}
            &nbsp;|&nbsp; 💎 +${rewardInfo.gemEarned}
          </div>
          ${
            rewardInfo.addedChestTitle
              ? `<div style="margin-top:5px;color:#69f0ae;">🎁 获得战利品：【${rewardInfo.addedChestTitle}】已放入主页槽位！</div>`
              : ''
          }
        </div>

        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="action-btn gold" id="btn-play-again" style="flex:1;">⚔️ 再来一局</button>
          <button class="action-btn" id="btn-back-home" style="flex:1;">🏠 返回主页</button>
        </div>
      </div>
    `;

    this.root.appendChild(modal);

    modal.querySelector('#btn-play-again')?.addEventListener('click', () => {
      modal.remove();
      this.launchPhaserBattle();
    });

    modal.querySelector('#btn-back-home')?.addEventListener('click', () => {
      modal.remove();
      this.getBattleScene()?.stopToBackdrop();
      this.view = 'lobby';
      this.render();
    });
  }
}
