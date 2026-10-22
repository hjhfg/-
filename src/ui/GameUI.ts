import {
  ALL_CARD_IDS,
  CARDS,
  CATEGORY_BADGE_SVG,
  COMMANDERS,
  MATCH_TIPS,
  OPPONENT_PROFILES,
  RARITY_META,
  type OpponentProfile,
} from '../data/cards';
import { store } from '../data/storage';
import { sound } from '../audio/SoundManager';
import {
  getStudioAsset,
  renderAvatarDataURL,
  renderCardIllustrationDataURL,
} from '../art/RedAlertArt';
import type { BattleEndSummary, LiveBattleHUDState } from '../game/BattleTypes';
import type { BattleScene, StartMatchConfig } from '../game/scenes/BattleScene';

type ScreenView = 'lobby' | 'matchmaking' | 'battle';
type LobbyTab = 'shop' | 'troops' | 'battle' | 'commander' | 'guide';

const ico = (key: string, size = 18, extraStyle = '') =>
  `<img src="${getStudioAsset(key)}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;flex-shrink:0;${extraStyle}" />`;

export class GameUI {
  private root: HTMLElement;
  private getBattleScene: () => BattleScene | null;
  private launchEngineBattle: (cfg: StartMatchConfig) => void;
  private returnToEngineHome: () => void;

  private view: ScreenView = 'lobby';
  private activeTab: LobbyTab = 'battle';
  private sortBy: 'rarity' | 'level' = 'level';
  private currentOpponent: OpponentProfile = OPPONENT_PROFILES[0];
  private pendingMode: 'pvp' | 'coop' = 'pvp';
  private matchTimerHandle: number | null = null;
  private toastTimeout: number | null = null;
  private tooltipTimeout: number | null = null;
  private lastHud: LiveBattleHUDState | null = null;

  constructor(
    root: HTMLElement,
    getBattleScene: () => BattleScene | null,
    launchEngineBattle: (cfg: StartMatchConfig) => void,
    returnToEngineHome: () => void
  ) {
    this.root = root;
    this.getBattleScene = getBattleScene;
    this.launchEngineBattle = launchEngineBattle;
    this.returnToEngineHome = returnToEngineHome;
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
            ? `<div class="slot-role-tag">${showSlotBadge}</div>`
            : ''
        }
        <img class="card-art-img" src="${imgUrl}" alt="${card.name}" />
        <div class="card-short-title">${card.shortName}</div>
        <div class="card-name-row">
          <span>${lv}级</span>
          <span class="cat-svg-badge">${CATEGORY_BADGE_SVG[card.category]}</span>
        </div>
        <div class="shard-bar">
          <div class="shard-fill ${canUp ? 'upgradable' : ''}" style="width:${fillPct}%"></div>
          <span>${canUp ? '▲ ' : ''}${shards}/${needed}</span>
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
    const isHomeDiorama = this.activeTab === 'battle';
    const soundSvg = store.data.soundEnabled
      ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="#80d8ff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="15" height="15" fill="#90a4ae"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

    const shareSvg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="#ffe082"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`;

    this.root.innerHTML = `
      <div class="lobby-screen ${isHomeDiorama ? 'battle-home-active' : 'solid-tab'}">
        <div class="top-resource-bar ui-clickable">
          <div class="res-pill" title="升级任意卡牌均可永久提升全军战力加成">
            ${ico('ui_power', 21)} <span>${powerPct}%</span>
          </div>
          <div class="res-pill">
            ${ico('ui_gem', 21)} <span>${store.data.diamonds}</span>
          </div>
          <div class="res-pill">
            ${ico('ui_coin', 21)} <span>${store.data.gold}</span>
          </div>
          <button class="sound-btn" id="btn-share-url" title="查看手机部署网址">${shareSvg}</button>
          <button class="sound-btn" id="btn-toggle-sound" title="音效开关">${soundSvg}</button>
        </div>

        <div class="lobby-body ${isHomeDiorama ? 'home-passthrough' : 'ui-clickable'}" id="lobby-tab-content">
          ${this.renderActiveLobbyTabHTML()}
        </div>

        <div class="bottom-nav ui-clickable">
          <button class="nav-tab ${this.activeTab === 'shop' ? 'active' : ''}" data-tab="shop">
            <img class="nav-3d-img" src="${getStudioAsset('nav_shop')}" alt="商店" />
            <span>商店</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'troops' ? 'active' : ''}" data-tab="troops">
            <img class="nav-3d-img" src="${getStudioAsset('nav_troops')}" alt="部队" />
            <span>部队</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'battle' ? 'active' : ''}" data-tab="battle">
            <img class="nav-3d-img" src="${getStudioAsset('nav_battle')}" alt="对战" />
            <span>对战</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'commander' ? 'active' : ''}" data-tab="commander">
            <img class="nav-3d-img" src="${getStudioAsset('nav_cmd')}" alt="指挥官" />
            <span>指挥官</span>
          </button>
          <button class="nav-tab ${this.activeTab === 'guide' ? 'active' : ''}" data-tab="guide">
            <img class="nav-3d-img" src="${getStudioAsset('nav_guide')}" alt="克制" />
            <span>克制</span>
          </button>
        </div>
      </div>
    `;

    this.bindLobbyEvents();
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
        <div class="profile-pass-row ui-clickable">
          <div class="profile-card">
            <div class="avatar-frame">
              <img src="${renderAvatarDataURL('player')}" alt="指挥官头像" />
            </div>
            <div class="profile-meta">
              <h3>${store.data.playerName}</h3>
              <p>胜率: ${store.getWinRatePct()}%</p>
              <p style="color:#b3e5fc;font-size:11px;font-weight:700;">阵容: ${deck.name}</p>
            </div>
          </div>

          <div class="pass-banner" id="btn-claim-pass">
            <div class="pass-title">对战通行证</div>
            <div class="pass-bar-wrap">
              <div class="pass-lv-badge">${store.data.battlePassLv}</div>
              <div class="pass-progress">
                <div class="pass-progress-fill" style="width:${passPct}%"></div>
                <span>${store.data.battlePassXp}/200</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Center viewport lets live 60 FPS Phaser 3 WebGL HomeScene 3D Snowy Island shine directly through! -->
        <div class="diorama-stage">
          <div class="side-events-col left ui-clickable">
            <button class="mini-event-btn" data-quick-tab="commander">
              ${ico('nav_cmd', 32)}
              <span>指挥官特权</span>
            </button>
            <button class="mini-event-btn" data-quick-tab="troops">
              ${ico('card_apocalypse_tank', 32)}
              <span>编成卡组</span>
            </button>
            <button class="mini-event-btn" id="btn-free-bonus">
              ${ico('ui_trophy', 32)}
              <span>每日首胜</span>
            </button>
          </div>

          <div class="side-events-col right ui-clickable">
            <button class="mini-event-btn" data-quick-tab="shop">
              ${ico('chest_gold', 32)}
              <span>军备福利</span>
            </button>
            <button class="mini-event-btn" data-quick-tab="guide">
              ${ico('card_missile_car', 32)}
              <span>克制图鉴</span>
            </button>
            <button class="mini-event-btn" id="btn-switch-opp">
              ${ico('avatar_sam', 30, 'border-radius:6px;')}
              <span>切换对手</span>
            </button>
          </div>

          <div class="rank-trophy-pill ui-clickable">
            <div class="rank-title-text">${ico('ui_trophy', 20)} <span>${rank.name}</span></div>
            <div class="rank-bar-bg">
              <div class="rank-bar-fill" style="width:${rankPct}%"></div>
              <span>${store.data.trophies}/${rank.next}</span>
            </div>
          </div>
        </div>

        <div class="daily-quest-box ui-clickable" id="btn-daily-quest">
          <div class="dq-left">
            ${ico('chest_bronze', 34)}
            <div>
              <div>每日商店购物1次</div>
              <div style="font-size:11px;color:${store.data.dailyShopClaimed ? '#69f0ae' : '#ffca28'};">
                ${store.data.dailyShopClaimed ? '今日已完成' : '( 0 / 1 ) 点击免费领取军备空投'}
              </div>
            </div>
          </div>
          <span style="font-size:12px;font-weight:800;color:#80d8ff;">前往 &gt;</span>
        </div>

        <div class="battle-cta-row ui-clickable">
          <button class="btn-pvp" id="btn-start-pvp">
            <span>对战模式</span>
            <span class="sub">翻地块 · 抢金矿 · 推平敌基地</span>
          </button>
          <button class="btn-coop" id="btn-start-coop">
            <span>合作模式</span>
            <span class="sub">双基地联防 · 迎战重装军团</span>
          </button>
        </div>

        <div class="chest-slots-row ui-clickable">
          ${store.data.chests
            .map((ch, idx) => {
              if (!ch) {
                return `<div class="chest-slot empty" data-chest-idx="${idx}">空槽位</div>`;
              }
              const chestKey = ch.tier === 'gold' ? 'chest_gold' : 'chest_bronze';
              return `
                <div class="chest-slot ${ch.tier === 'gold' ? 'gold-tier' : ''}" data-chest-idx="${idx}">
                  <div class="chest-name">${ch.title}</div>
                  <img class="chest-3d-img" src="${getStudioAsset(chestKey)}" alt="${ch.title}" />
                  <div class="chest-timer">
                    ${ch.skipGems > 0 ? `${ico('ui_gem', 12)} ${ch.skipGems} 开启` : '点击开启'}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="ui-clickable" id="btn-chat-coop" style="margin-top:2px;padding:6px 10px;border-radius:8px;background:rgba(13,20,38,0.8);border:1px solid rgba(129,212,250,0.22);font-size:11.5px;color:#cfd8dc;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
          <span><b>苍白哥哥呢:</b> <span style="color:#80d8ff;">[!coop:20144806] 来合作模式一起守红警军团！</span></span>
          <span style="color:#ffd54f;font-weight:800;">加入 &gt;</span>
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
            <span style="font-size:11px;color:#cfd8dc;">点击卡牌可升级或替换</span>
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
          <span style="font-size:13px;font-weight:800;">已获得: ${ALL_CARD_IDS.length}/${ALL_CARD_IDS.length}</span>
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
          <h3 style="font-size:16px;color:#ffe082;margin-bottom:4px;">红警统帅指挥部与战术大招</h3>
          <p style="font-size:12px;color:#cfd8dc;">选择出战指挥官，可在战斗右下角释放专属主动大招，并获得全军被动增益。</p>
        </div>
        ${COMMANDERS.map((cmd) => {
          const selected = store.data.selectedCommanderId === cmd.id;
          const portrait = renderAvatarDataURL(`cmd_${cmd.id}`);
          return `
            <div class="deck-panel-box" style="border-color:${selected ? '#ffe082' : 'rgba(255,255,255,0.2)'};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                <img src="${portrait}" alt="${cmd.name}" style="width:58px;height:58px;border-radius:10px;border:2px solid ${cmd.themeColor};object-fit:cover;flex-shrink:0;" />
                <div style="flex:1;">
                  <span style="background:${cmd.themeColor};padding:2px 8px;border-radius:6px;font-size:11px;font-weight:900;">${cmd.title}</span>
                  <h3 style="font-size:16.5px;margin-top:5px;">${cmd.name} · ${cmd.stars}星统帅</h3>
                </div>
                <button class="action-btn ${selected ? 'green' : 'gold'}" data-select-cmd="${cmd.id}">
                  ${selected ? '出战中' : '设为统帅'}
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
          <h3 style="font-size:17px;color:#ffe082;">军团军火补给站</h3>
          <p style="font-size:12px;color:#cfd8dc;margin-top:4px;">抽取红警部队碎片升级兵种等级，永久提升全军战力百分比！</p>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          ${ico('chest_bronze', 54)}
          <div style="flex:1;">
            <h4 style="font-size:15px;color:#69f0ae;">每日免费军备空投箱</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">立得 金币 +600、钻石 +40 及随机兵种碎片！</p>
          </div>
          <button class="action-btn ${store.data.dailyShopClaimed ? 'secondary' : 'green'}" id="btn-shop-free">
            ${store.data.dailyShopClaimed ? '已领取' : '免费领取'}
          </button>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          ${ico('chest_gold', 56)}
          <div style="flex:1;">
            <h4 style="font-size:15px;color:#80d8ff;">高级王者五连补给箱</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">必出 5 组高阶红警重坦/战机/光棱塔/金矿碎片！</p>
          </div>
          <button class="action-btn gold" id="btn-shop-gems">${ico('ui_gem', 15)} 80 抽取</button>
        </div>

        <div class="deck-panel-box" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          ${ico('nav_shop', 54)}
          <div style="flex:1;">
            <h4 style="font-size:15px;color:#ffe082;">军费物资征召箱</h4>
            <p style="font-size:12px;color:#cfd8dc;margin-top:2px;">消耗金币抽取 4 组主力作战兵种碎片！</p>
          </div>
          <button class="action-btn" id="btn-shop-gold">${ico('ui_coin', 15)} 1200 抽取</button>
        </div>
      `;
    }

    // Tab 5: Visual 3D Unit Counter Matrix (`克制`)
    const counterRows = [
      {
        atk: 'card_heavy_gunner',
        def: 'card_missile_car',
        border: '#4fc3f7',
        bg: 'rgba(41,121,255,0.2)',
        title: '重机枪兵  克制  装甲车系 (225%伤害)',
        desc: '穿甲加特林撕碎【导弹车】与【火炮战车】，同时兼备对空扫射火力。',
      },
      {
        atk: 'card_bunker',
        def: 'card_assault_infantry',
        border: '#69f0ae',
        bg: 'rgba(0,230,118,0.16)',
        title: '机枪碉堡  克制  步兵系 (225%伤害)',
        desc: '钢筋混凝土地堡交叉火网瞬间压制【重机枪兵】【突击大兵】与【空投伞兵】！',
      },
      {
        atk: 'card_jetpack_trooper',
        def: 'card_rhino_tank',
        border: '#ce93d8',
        bg: 'rgba(171,71,188,0.22)',
        title: '火箭飞行兵 / 黑鹰战机  克制  坦克系 (225%伤害)',
        desc: '无视地形高空打击！【主战坦克】无法对空，遭遇飞行兵必须配导弹车护航！',
      },
      {
        atk: 'card_sam_tower',
        def: 'card_jet_fighter',
        border: '#ffd54f',
        bg: 'rgba(255,171,0,0.18)',
        title: '导弹车 / 防空导弹塔  克制  空军系 (225%伤害)',
        desc: '8联装防空导弹与机动导弹战车超远锁定敌军飞行兵与轰炸战机！',
      },
      {
        atk: 'card_artillery_car',
        def: 'card_bunker',
        border: '#ff5252',
        bg: 'rgba(255,82,82,0.18)',
        title: '火炮战车 / 主战坦克  克制  碉堡与防御塔',
        desc: '火炮战车超远射程无伤拆毁敌军碉堡群，主战坦克与天启重坦正面碾压推家！',
      },
    ];

    return `
      <div class="deck-panel-box">
        <h3 style="font-size:16px;color:#ffe082;margin-bottom:8px;">《精英军团》3D 兵种克制实战图鉴</h3>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;line-height:1.45;">
          ${counterRows
            .map(
              (r) => `
              <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:${r.bg};border-left:4px solid ${r.border};">
                ${ico(r.atk, 42)}
                <span style="font-weight:900;color:#ffe082;font-size:12px;">克 &gt;</span>
                ${ico(r.def, 42)}
                <div style="flex:1;">
                  <div style="font-weight:900;color:#ffffff;">${r.title}</div>
                  <div style="color:#d7e8ff;font-size:11.5px;margin-top:2px;">${r.desc}</div>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private bindLobbyEvents(): void {
    this.root.querySelector('#btn-share-url')?.addEventListener('click', () => {
      sound.playClick();
      const instantUrl = 'https://raw.githack.com/hjhfg/-/arena/d056a933-repo/docs/index.html';
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card" style="text-align:center;">
          <h3 style="font-size:18px;color:#ffe082;margin-bottom:8px;">手机端在线部署地址</h3>
          <p style="font-size:12.5px;color:#cfd8dc;line-height:1.5;">
            复制以下公网地址在手机浏览器打开，即可全屏触控体验 WebGL 3D 版《精英军团》：
          </p>
          <div style="margin:12px 0;padding:10px;border-radius:9px;background:rgba(0,0,0,0.45);border:1px solid #80d8ff;font-size:12px;word-break:break-all;font-weight:800;color:#69f0ae;user-select:text;-webkit-user-select:text;">
            ${instantUrl}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="action-btn gold" id="btn-copy-link" style="flex:1;">复制公网直连网址</button>
            <button class="action-btn secondary" id="btn-close-share">关闭</button>
          </div>
        </div>
      `;
      this.root.appendChild(modal);
      modal.querySelector('#btn-close-share')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#btn-copy-link')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(instantUrl).catch(() => {});
        this.showToast('已复制公网直连网址！', 'good');
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
      this.showToast('领取军团战备津贴 +250 金币！', 'good');
      this.render();
    });

    this.root.querySelector('#btn-switch-opp')?.addEventListener('click', () => {
      sound.playClick();
      const idx = (OPPONENT_PROFILES.indexOf(this.currentOpponent) + 1) % OPPONENT_PROFILES.length;
      this.currentOpponent = OPPONENT_PROFILES[idx];
      this.showToast(`下一战匹配对手已切换：${this.currentOpponent.name}`, 'info');
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
        this.showRewardsModal('战利品宝箱开启成功！', res.rewards);
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
        this.showToast('已委任统帅！战斗右下角主动技能已更新', 'good');
        this.render();
      });
    });

    // Supply Shop Gacha Buttons
    this.root.querySelector('#btn-shop-free')?.addEventListener('click', () => {
      if (store.data.dailyShopClaimed) {
        this.showToast('今日免费补给已领取！可体验钻石或金币征召箱', 'info');
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
      this.showRewardsModal('每日军备补给到账！', {
        gold: 600,
        diamonds: 40,
        cards: [{ id: randomCard, count: 25 }],
      });
    });

    this.root.querySelector('#btn-shop-gems')?.addEventListener('click', () => {
      if (store.data.diamonds < 80) {
        this.showToast('钻石不足 80！打赢对战或开启宝箱可获得钻石', 'warn');
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
      this.showRewardsModal('高级王者五连补给结果', { gold: 200, diamonds: 0, cards });
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
      this.showRewardsModal('军费征召补给结果', { gold: 0, diamonds: 5, cards });
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
          <img src="${renderCardIllustrationDataURL(cardId)}" style="width:94px;height:86px;object-fit:contain;background:rgba(255,255,255,0.1);border-radius:10px;padding:4px;" />
          <div style="flex:1;">
            <div style="font-size:18px;font-weight:900;">${card.name} <span style="color:#ffd54f;font-size:14px;">${lv}级</span></div>
            <div style="font-size:12px;color:#80d8ff;margin-top:3px;">
              解锁格耗费: ${ico('ui_coin', 14)} ${card.cost} | 建筑: ${card.buildingName}
            </div>
            <div style="font-size:11.5px;color:#cfd8dc;margin-top:3px;">碎片进度: ${shards} / ${needed}</div>
          </div>
        </div>

        <p style="margin-top:10px;font-size:12.5px;line-height:1.5;color:#eceff1;">${card.description}</p>

        <div style="margin-top:10px;padding:9px;border-radius:8px;background:rgba(0,0,0,0.34);font-size:12px;line-height:1.55;">
          <div style="color:#69f0ae;font-weight:800;">优势：${card.countersText}</div>
          <div style="color:#ff8a80;margin-top:3px;">弱点：${card.counteredByText}</div>
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
                ${deck.defense === cardId ? '当前已装备该防御塔' : `上阵替换【${CARDS[deck.defense].shortName}】`}
              </button>
            </div>
          `
              : ''
        }

        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="action-btn gold" id="btn-do-upgrade" style="flex:1;">
            升级卡牌 (${ico('ui_coin', 15)} ${goldCost})
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
          ${rewards.gold > 0 ? `<span>${ico('ui_coin', 18)} +${rewards.gold}</span>` : ''}
          ${rewards.diamonds > 0 ? `<span>${ico('ui_gem', 18)} +${rewards.diamonds}</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(4, Math.max(1, rewards.cards.length))}, 1fr);gap:8px;">
          ${rewards.cards
            .map(
              (c) => `
              <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:6px;border:1px solid #80d8ff;">
                <img src="${renderCardIllustrationDataURL(c.id)}" style="width:100%;height:58px;object-fit:contain;" />
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

    const lensSvg = `<svg viewBox="0 0 64 64" width="62" height="62"><circle cx="28" cy="28" r="18" fill="rgba(168,216,255,0.45)" stroke="#1e272e" stroke-width="4.5"/><path d="M20 21a10 10 0 0 1 12-3" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/><line x1="41" y1="41" x2="56" y2="56" stroke="#ff9f43" stroke-width="9" stroke-linecap="round"/><line x1="41" y1="41" x2="56" y2="56" stroke="#1e272e" stroke-width="3" stroke-linecap="round"/></svg>`;

    this.root.innerHTML = `
      <div class="matchmaking-screen">
        <div class="mm-top-info">
          <div class="mm-title" id="mm-status-text">
            ${this.pendingMode === 'coop' ? '匹配合作战友..' : '搜寻对手..'}
          </div>
          <div class="mm-timer-pill"><span id="mm-sec">1s</span></div>
          <div style="font-size:12.5px;font-weight:700;">
            当前有 <span style="color:#69f0ae;font-weight:900;">${onlineCount}人</span> 正在战斗中，预计匹配时间: <span style="color:#69f0ae;">2s</span>
          </div>
        </div>

        <div class="mm-enemy-banner" id="mm-enemy-box">
          <div>
            <div style="font-size:13px;color:#ffcdd2;">正在雷达扫描战区目标...</div>
            <div style="font-size:18px;font-weight:900;margin-top:4px;" id="mm-opp-reveal">搜索敌方信号中</div>
          </div>
          <div>${lensSvg}</div>
        </div>

        <div class="mm-player-banner">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="mini-ava"><img src="${renderAvatarDataURL('player')}" alt="me" /></div>
              <div>
                <div style="font-size:15px;font-weight:900;">${store.data.playerName}</div>
                <div style="font-size:12px;">
                  ${ico('ui_power', 14)} ${store.getCombatPowerPct()}% &nbsp; ${ico('ui_trophy', 15)} ${store.data.trophies}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="action-btn gold" id="btn-instant-go" style="padding:5px 9px;font-size:11.5px;">秒进战场</button>
              <button class="action-btn secondary" id="btn-cancel-mm" style="padding:5px 10px;font-size:11.5px;">取消</button>
            </div>
          </div>

          <div class="mm-deck-strip">
            ${sixCards
              .map(
                (cid) => `
                <div style="background:linear-gradient(180deg,#3484e8,#1b4c94);border:1.5px solid #90caf9;border-radius:7px;padding:3px;text-align:center;position:relative;">
                  <span style="position:absolute;top:-4px;left:-3px;background:#ffb300;color:#000;font-size:9px;font-weight:900;padding:0 3.5px;border-radius:6px;">${CARDS[cid].cost}</span>
                  <img src="${renderCardIllustrationDataURL(cid)}" style="width:100%;height:44px;object-fit:contain;" />
                  <div style="font-size:9.5px;font-weight:800;">${store.data.cardLevels[cid] || 8}级</div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>

        <div style="text-align:center;padding:0 14px;font-size:12.5px;font-weight:800;text-shadow:0 1px 3px #000;">
          提示：${tip}
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
              : `${opp.name}（战力 ${opp.powerPct}%）`;
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
    this.view = 'battle';
    this.renderBattleHUD();

    this.launchEngineBattle({
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
                  <div style="font-size:11px;font-weight:800;">${ico('ui_trophy', 13)} ${store.data.trophies}</div>
                  <div style="font-size:11px;font-weight:800;color:#ffd54f;">${ico('ui_power', 13)} ${store.getCombatPowerPct()}%</div>
                </div>
              </div>
              <div class="pop-pill">兵力 <span id="hud-p-pop">0/50</span></div>
            </div>

            <div class="match-clock-box">
              <div><span id="hud-clock">04:00</span></div>
              <div id="hud-mode-sub" style="font-size:10px;color:#80d8ff;display:none;"></div>
            </div>

            <div>
              <div class="player-mini-box right">
                <div class="mini-ava"><img src="${renderAvatarDataURL(opp.avatarType)}" alt="enemy" /></div>
                <div>
                  <div style="font-size:12.5px;font-weight:900;color:#ff8a80;">
                    ${this.pendingMode === 'coop' ? '北方红警要塞' : opp.name}
                  </div>
                  <div style="font-size:11px;font-weight:800;">${ico('ui_trophy', 13)} ${oppTrophies}</div>
                  <div style="font-size:11px;font-weight:800;color:#ffd54f;">${ico('ui_power', 13)} ${opp.powerPct}%</div>
                </div>
              </div>
              <div class="pop-pill">兵力 <span id="hud-e-pop">0/50</span></div>
              <div class="enemy-para-badge" title="敌军伞兵空投倒计时">
                ${ico('ui_parachute_icon', 15)} <span id="hud-e-para">31s</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Middle Quick Tactical & Camera Controls -->
        <div class="bhud-mid" id="bhud-mid-layer">
          <div class="right-cam-tools">
            <button class="cam-jump-btn" data-cam="enemy">敌方基地</button>
            <button class="cam-jump-btn" data-cam="front">前线交火</button>
            <button class="cam-jump-btn" data-cam="home">我方基地</button>
            <button class="cam-jump-btn" data-cam="overview">全图视角</button>
          </div>

          <div class="left-side-tools">
            <button class="tool-square-btn" id="btn-battle-menu" title="菜单/倍速">菜单</button>
            <button class="tool-square-btn" id="btn-battle-guide" title="兵种克制表">克制</button>
            <button class="tool-square-btn" id="btn-battle-emote" title="发送战地指令">指令</button>
            <button class="tool-square-btn" id="btn-battle-stats" style="font-size:11px;">战况</button>
          </div>
        </div>

        <!-- Bottom Action Bar: 3D 科技强化 | 3D 金币 | 3D 召唤伞兵 | 3D 指挥官大招 -->
        <div class="bhud-bottom">
          <button class="hex-action-btn" id="btn-tech-up">
            ${ico('ui_tech_hammer', 38)}
            <span style="font-size:11px;font-weight:900;margin-top:-2px;" id="hud-tech-label">科技强化</span>
            <span style="font-size:11.5px;font-weight:900;color:#ffd54f;display:flex;align-items:center;gap:3px;" id="hud-tech-cost-wrap">
              ${ico('ui_coin', 13)} <span id="hud-tech-cost">30</span>
            </span>
          </button>

          <div class="gold-counter-pill">
            ${ico('ui_coin', 24)}
            <span class="gold-num" id="hud-gold">85</span>
            <span style="font-size:10.5px;color:#69f0ae;font-weight:800;" id="hud-income">+4.0/s</span>
          </div>

          <div style="display:flex;align-items:flex-end;gap:7px;">
            <button class="hex-action-btn" id="btn-paratrooper">
              ${ico('ui_parachute_icon', 36)}
              <span style="font-size:13px;font-weight:900;margin-top:-2px;" id="hud-para-cd">14s</span>
              <span style="font-size:10.5px;font-weight:900;">召唤伞兵</span>
            </button>

            <button class="cmd-skill-btn" id="btn-cmd-skill" title="${cmd.skillName}：${cmd.skillDesc}">
              <img src="${getStudioAsset('ui_cmd_soldier')}" alt="技能" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
              <span class="cmd-cd-pill" id="hud-cmd-cd">8s</span>
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
        '指挥官：准备迎接钢铁洪流吧！',
        '指挥官：重机枪兵就位，专治导弹车与火炮车！',
        '指挥官：火箭飞行兵升空，主战坦克颤抖吧！',
        '指挥官：抢占双矿暴兵，一举推平敌方基地！',
      ];
      this.showToast(lines[Math.floor(Math.random() * lines.length)], 'good');
    });

    this.root.querySelector('#btn-battle-stats')?.addEventListener('click', () => {
      sound.playClick();
      if (!this.lastHud) return;
      const h = this.lastHud;
      this.showToast(
        `已建建筑 ${h.buildingsBuilt} | 出兵 ${h.playerUnitsSpawned} | 歼敌 ${h.enemyUnitsKilled} | 采矿 ${h.totalGoldMined}`,
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
      techCostEl.textContent = h.techLevel >= 6 ? '已满级' : `${h.techCost}`;
      techCostEl.style.color = h.playerGold >= h.techCost ? '#ffd54f' : '#ff5252';
    }

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
   * Exact Screenshot 1 & 2 Dark Rounded Floating Card & Counter Tooltip right above tapped hex!
   */
  private showHexCardTooltip(cardId: string, cost: number, level: number, sx: number, sy: number): void {
    const old = this.root.querySelector('.hex-card-tooltip');
    if (old) old.remove();
    if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);

    const card = CARDS[cardId];
    if (!card) return;

    const tip = document.createElement('div');
    tip.className = 'hex-card-tooltip';
    const clampedX = Math.max(92, Math.min(this.root.clientWidth - 92, sx));
    const clampedY = Math.max(210, sy - 10);
    tip.style.left = `${clampedX}px`;
    tip.style.top = `${clampedY}px`;

    const needMore = Math.max(0, cost - (this.lastHud?.playerGold || 0));

    tip.innerHTML = `
      <div style="font-size:12.5px;font-weight:900;background:#228be6;border-radius:6px;padding:2px 6px;margin-bottom:5px;">
        ${card.name}
      </div>
      <div style="position:relative;background:linear-gradient(180deg,#3484e8,#1b4c94);border-radius:8px;padding:5px;border:1.5px solid #90caf9;">
        <span style="position:absolute;top:-5px;left:-5px;background:#ffca28;color:#000;font-weight:900;font-size:10.5px;padding:1px 5px;border-radius:99px;border:1.5px solid #261600;">${cost}</span>
        <img src="${renderCardIllustrationDataURL(cardId)}" style="width:94px;height:70px;object-fit:contain;" />
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:900;padding:0 2px;">
          <span>${level}级</span>
          <span>${CATEGORY_BADGE_SVG[card.category]}</span>
        </div>
      </div>
      <div style="font-size:10.5px;color:#fff59d;margin-top:5px;line-height:1.35;font-weight:700;">
        ${card.countersText}
      </div>
      ${
        needMore > 0
          ? `<div style="font-size:10px;color:#ff8a80;margin-top:3px;font-weight:800;">还差 ${needMore} 金币解锁</div>`
          : ''
      }
    `;

    tip.addEventListener('click', () => tip.remove());
    this.root.appendChild(tip);
    this.tooltipTimeout = window.setTimeout(() => tip.remove(), 2600);
  }

  private showQuickCounterOverlay(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <h3 style="color:#ffe082;font-size:16px;margin-bottom:8px;">战地 3D 兵种克制速查</h3>
        <div style="display:flex;flex-direction:column;gap:7px;font-size:12.5px;line-height:1.5;">
          <div>${ico('card_heavy_gunner', 26)} <b>重机枪兵</b> 克制 ${ico('card_missile_car', 26)} <b>导弹车 / 火炮车</b> (225%伤害)</div>
          <div>${ico('card_bunker', 26)} <b>机枪碉堡</b> 克制 ${ico('card_assault_infantry', 26)} <b>重机枪兵 / 大兵 / 伞兵</b> (225%伤害)</div>
          <div>${ico('card_jetpack_trooper', 26)} <b>飞行兵 / 战机</b> 克制 ${ico('card_rhino_tank', 26)} <b>主战坦克 / 天启重坦</b> (225%伤害)</div>
          <div>${ico('card_sam_tower', 26)} <b>导弹车 / 防空塔</b> 克制 ${ico('card_jet_fighter', 26)} <b>飞行兵 / 黑鹰战机</b> (225%伤害)</div>
          <div>${ico('card_artillery_car', 26)} <b>火炮战车 / 坦克</b> 克制 ${ico('card_bunker', 26)} <b>机枪碉堡 / 光棱塔</b></div>
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
        <h3 style="font-size:18px;color:#ffe082;margin-bottom:12px;">战地指挥部菜单</h3>
        <div style="display:flex;flex-direction:column;gap:9px;">
          <button class="action-btn green" id="btn-resume">继续战斗</button>
          <button class="action-btn" id="btn-speed">切换战斗倍速（当前 ${curSpeed}x）</button>
          <button class="action-btn gold" id="btn-rematch">重新开局</button>
          <button class="action-btn secondary" id="btn-quit">撤退返回主界面</button>
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
      this.showToast(`战斗倍速已切换为 ${nextSpd}x`, 'good');
      modal.remove();
    });

    modal.querySelector('#btn-rematch')?.addEventListener('click', () => {
      modal.remove();
      this.launchPhaserBattle();
    });

    modal.querySelector('#btn-quit')?.addEventListener('click', () => {
      modal.remove();
      this.returnToEngineHome();
      this.view = 'lobby';
      this.render();
    });
  }

  private showBattleResultModal(summary: BattleEndSummary): void {
    const rewardInfo = store.recordBattleResult(summary.won, summary.mode);
    if (summary.won) {
      const nextIdx = (OPPONENT_PROFILES.indexOf(this.currentOpponent) + 1) % OPPONENT_PROFILES.length;
      this.currentOpponent = OPPONENT_PROFILES[nextIdx];
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <div style="margin-bottom:6px;">
          ${ico(summary.won ? 'ui_trophy' : 'rubble_pile', 58)}
        </div>
        <h2 style="font-size:24px;color:${summary.won ? '#ffd54f' : '#ff8a80'};">
          ${summary.won ? '战役大捷 · 胜利！' : '防线失守 · 惜败'}
        </h2>
        <p style="font-size:13px;color:#e0f7fa;margin-top:4px;">${summary.reason}</p>

        <div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.35);display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;">
          <div>我方领地: <b style="color:#80d8ff;">${summary.playerTiles}格</b></div>
          <div>敌方领地: <b style="color:#ff8a80;">${summary.enemyTiles}格</b></div>
          <div>歼灭敌军: <b style="color:#ffd54f;">${summary.kills}</b></div>
          <div>建造设施: <b style="color:#69f0ae;">${summary.buildingsBuilt}</b></div>
        </div>

        <div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(255,213,79,0.12);border:1px solid rgba(255,213,79,0.4);font-size:13px;font-weight:800;">
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
            <span>${ico('ui_trophy', 16)} ${rewardInfo.trophyDelta >= 0 ? `+${rewardInfo.trophyDelta}` : rewardInfo.trophyDelta}</span>
            <span>${ico('ui_coin', 16)} +${rewardInfo.goldEarned}</span>
            <span>${ico('ui_gem', 16)} +${rewardInfo.gemEarned}</span>
          </div>
          ${
            rewardInfo.addedChestTitle
              ? `<div style="margin-top:6px;color:#69f0ae;">${ico('chest_gold', 18)} 获得战利品：【${rewardInfo.addedChestTitle}】已放入主页槽位！</div>`
              : ''
          }
        </div>

        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="action-btn gold" id="btn-play-again" style="flex:1;">再来一局</button>
          <button class="action-btn" id="btn-back-home" style="flex:1;">返回主页</button>
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
      this.returnToEngineHome();
      this.view = 'lobby';
      this.render();
    });
  }
}
