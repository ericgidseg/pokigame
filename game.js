(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const ui = {
    hud: document.querySelector("#hud"),
    time: document.querySelector("#time"),
    level: document.querySelector("#level"),
    wave: document.querySelector("#wave"),
    xp: document.querySelector("#xp-fill"),
    coins: document.querySelector("#coins"),
    slots: document.querySelector("#weapon-slots"),
    talents: document.querySelector("#talent-slots"),
    bossWrap: document.querySelector("#boss-wrap"),
    bossFill: document.querySelector("#boss-fill"),
    start: document.querySelector("#start-screen"),
    levelScreen: document.querySelector("#level-screen"),
    cards: document.querySelector("#upgrade-cards"),
    pause: document.querySelector("#pause-screen"),
    end: document.querySelector("#end-screen"),
    touch: document.querySelector("#touch-zone"),
    joystickBase: document.querySelector("#joystick-base"),
    joystickKnob: document.querySelector("#joystick-knob"),
    record: document.querySelector("#record"),
    bankCoins: document.querySelector("#bank-coins"),
    roster: document.querySelector("#character-roster"),
    characterName: document.querySelector("#character-name"),
    characterWeapon: document.querySelector("#character-weapon"),
    characterPerk: document.querySelector("#character-perk"),
    masteryPips: document.querySelector("#mastery-pips"),
    masteryButton: document.querySelector("#mastery-btn"),
    metaShopItems: document.querySelector("#meta-shop-items"),
    levelKicker: document.querySelector("#level-screen .panel-title p"),
    levelTitle: document.querySelector("#level-screen .panel-title h2"),
    upgradeActions: document.querySelector("#upgrade-actions"),
    rerollUpgrades: document.querySelector("#reroll-upgrades-btn"),
    buyExtraUpgrade: document.querySelector("#buy-extra-upgrade-btn"),
    banishUpgrade: document.querySelector("#banish-upgrade-btn"),
    skipUpgrade: document.querySelector("#skip-upgrade-btn"),
    revive: document.querySelector("#revive-btn"),
  };

  const TAU = Math.PI * 2;
  const ENEMY_CELL_SIZE = 96;
  const MAX_ENEMY_RADIUS = 48;
  const MAX_ENEMY_SPEED = 165;
  const PICKUP_STEP = 1 / 30;
  const RECOVERY_DELAY = 4;
  const RECOVERY_MAX_HP_PER_SECOND = .01;
  const BASE_ATTACK_DAMAGE_MULT = 1.22;
  const MAX_LEVEL_DAMAGE_MULT = 1.6;
  const REVIVE_BASE_COST = 30;
  const MAX_PARTICLES = 900;
  const MAX_TEXTS = 180;
  const MAX_PICKUPS = 600;
  const PAGE_PARAMS = new URLSearchParams(location.search);
  const PERF_ENABLED = PAGE_PARAMS.has("perf");
  const PERF_STRESS_ENEMIES = PERF_ENABLED ? Math.min(1000, Math.max(0, Math.floor(Number(PAGE_PARAMS.get("stress")) || 0))) : 0;
  const PERF_LOADOUT = PERF_ENABLED ? (PAGE_PARAMS.get("loadout") || "").split(",").filter(Boolean) : [];
  const PERF_GOD_MODE = PERF_ENABLED && PAGE_PARAMS.has("god");
  const PERF_AUTO_COLLECT = PERF_ENABLED && PAGE_PARAMS.has("collect");
  const PERF_START_COINS = PERF_ENABLED ? Math.min(9999, Math.max(0, Math.floor(Number(PAGE_PARAMS.get("coins")) || 0))) : 0;
  const PERF_PHASES = ["frame", "update", "buckets", "weapons", "projectiles", "enemies", "pickups", "effects", "draw"];
  const keys = new Set();
  const touchMove = { x: 0, y: 0 };
  const enemyById = new Map();
  const enemyBuckets = new Map();
  const activeEnemyBuckets = [];
  const allEnemyBuckets = [];
  const enemyQueryPool = [];
  const enemyUpdateIds = [];
  const thornBlades = [];
  const chainTargets = [];
  const chainDistances = [];
  const lightningTargets = [];
  const bladeDirections = [Math.PI, 0, -Math.PI / 2, Math.PI / 2, Math.PI * .75];
  const particlePool = [];
  const textPool = [];
  const perfTotals = Object.create(null);
  const perfMaximums = Object.create(null);
  const perfReport = { samples: 0, averages: {}, maximums: {}, load: {}, queries: {} };
  const perfQueries = { calls: 0, candidates: 0, fullScanEquivalent: 0 };
  for (const phase of PERF_PHASES) { perfTotals[phase] = 0; perfMaximums[phase] = 0; }
  const state = {
    mode: "menu",
    time: 0,
    wave: 1,
    spawnClock: 0,
    propClock: 0,
    kills: 0,
    coins: 0,
    shake: 0,
    flash: 0,
    bossSpawned: false,
    bossCount: 0,
    nextBossAt: 300,
    boss: null,
    last: performance.now(),
    enemies: [],
    projectiles: [],
    enemyShots: [],
    pickups: [],
    breakables: [],
    particles: [],
    effects: [],
    texts: [],
    pendingUpgradeAfterTalent: false,
    upgradeRerolls: 0,
    upgradeBanishes: 0,
    paidExtraUpgrades: 0,
    extraUpgradePending: false,
    banishMode: false,
    freeRerolls: 0,
    banishedUpgradeIds: new Set(),
    reviveUsed: false,
    bankedRunCoins: 0,
    hudClock: 0,
    pickupAccumulator: 0,
  };

  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let nextEntityId = 1;
  let nextStatusId = 1;
  let vignetteGradient = null;
  let healthBarBottom = 18;
  let lastRenderedMode = null;
  let lastMenuDraw = 0;
  let enemyBucketFrame = 0;
  let perfSamples = 0;
  let perfOutput = null;

  const player = {
    x: 0, y: 0, r: 15, speed: 180,
    hp: 100, maxHp: 100, invulnerable: 0,
    xp: 0, xpNext: 18, level: 1,
    damageMult: BASE_ATTACK_DAMAGE_MULT, levelDamageMult: 1, weaponDamageMult: 1, spellDamageMult: 1, cooldownMult: 1, areaMult: 1, armor: 0,
    goldMult: 1, xpMult: 1, vision: 520,
    projectileSpeed: 540, pickupRange: 78,
    regen: 0, lastDamageAt: -Infinity, facing: 1, aimX: 1, aimY: 0, weapons: {}, passives: {}, talents: {}, evolutions: {}, endlessUpgrades: {}, weaponClocks: {}, trailClock: 0,
    hasteUntil: 0, counterReadyAt: 0, lastStandReadyAt: 0, lastSpell: null, lastFlowAt: -Infinity,
  };

  const characters = [
    { id: "vanguard", icon: "⚔", name: "守火者", weapon: "blade", weaponName: "余烬剑", cost: 0, hp: 118, speed: 180, armor: 1, damage: 1.18, perk: "生命坚韧且基础伤害较高，剑刃升阶会扩展斩击方位。" },
    { id: "ranger", icon: "➶", name: "荒野游侠", weapon: "bow", weaponName: "猎风弓", cost: 0, hp: 92, speed: 195, armor: 0, damage: 1.12, perk: "移动迅捷且基础伤害较高，箭矢高速穿透成排敌人。" },
    { id: "arcanist", icon: "ϟ", name: "元素术士", weapon: "lightning", weaponName: "风暴铭文", cost: 0, hp: 82, speed: 185, armor: 0, damage: 1.02, xp: 1.08, perk: "开局掌握雷击，升级时可学习火球与寒霜新星。" },
  ];

  const weaponsCatalog = [
    { id: "blade", type: "weapon", icon: "⚔", name: "余烬剑", max: 6, description: "2/4/6级依次增加右、上、下方的三分之一圆弧。" },
    { id: "bow", type: "weapon", icon: "➶", name: "猎风弓", max: 6, description: "2级穿透，4级双箭，6级三箭并强化穿透。" },
    { id: "shuriken", type: "weapon", icon: "✦", name: "影手里剑", max: 6, description: "2级扩散，4级穿透，6级改为向四周投射。" },
    { id: "lightning", type: "weapon", icon: "ϟ", name: "风暴铭文", max: 6, exclusive: true, description: "2级增加电场，4级扩大，6级首次命中也会连锁。" },
    { id: "bomb", type: "weapon", icon: "●", name: "炼金炸弹", max: 6, description: "2级缩短引信，4级余震，6级同时投掷两颗。" },
    { id: "fireball", type: "weapon", icon: "✹", name: "熔火术", max: 6, exclusive: true, description: "2级加速，4级留下火场，6级双重施放。" },
    { id: "chopper", type: "weapon", icon: "◒", name: "回旋圣斧", max: 6, description: "2级强化返程，4级双斧，6级三斧并全额返程伤害。" },
    { id: "thorn", type: "weapon", icon: "◈", name: "荆棘轮刃", max: 6, description: "2级强化击退，4级三刃，6级四刃并加快切割。" },
    { id: "frostMine", type: "weapon", icon: "◆", name: "寒霜地雷", max: 6, description: "2级强减速，4级双雷，6级地雷可连锁引爆。" },
    { id: "crossbow", type: "weapon", icon: "➹", name: "攻城重弩", max: 6, description: "2级穿透，4级施加破甲，6级双弩齐射。" },
    { id: "poisonPot", type: "weapon", icon: "♨", name: "腐蚀毒壶", max: 6, description: "2级强减速，4级扩大毒雾，6级双壶覆盖。" },
    { id: "frostNova", type: "weapon", icon: "❄", name: "寒霜新星", max: 6, exclusive: true, description: "2级强冻结，4级扩大冰环，6级追加第二次寒潮。" },
  ];

  const passivesCatalog = [
    { id: "rapid", type: "passive", icon: "»", name: "疾速射击", max: 5, description: "武器攻击间隔和法术施放间隔缩短 8%。", apply: () => player.cooldownMult *= .92 },
    { id: "armor", type: "passive", icon: "⛨", name: "黑铁护甲", max: 5, description: "每次受到的伤害减少 2 点。", apply: () => player.armor += 2 },
    { id: "ring", type: "passive", icon: "○", name: "鎏金指环", max: 5, description: "拾取金币的收益提高 10%。", apply: () => player.goldMult *= 1.1 },
    { id: "magnet", type: "passive", icon: "⌁", name: "牵引磁石", max: 5, description: "拾取范围提高 30%。", apply: () => player.pickupRange *= 1.3 },
    { id: "sandals", type: "passive", icon: "➜", name: "逐风便鞋", max: 5, description: "移动速度提高 5%。", apply: () => player.speed *= 1.05 },
    { id: "book", type: "passive", icon: "▤", name: "荒原图鉴", max: 5, description: "获得的经验提高 10%。", apply: () => player.xpMult *= 1.1 },
    { id: "berserk", type: "passive", icon: "✹", name: "狂战烙印", max: 5, description: "武器伤害提高 8%，不影响法术。", apply: () => player.weaponDamageMult *= 1.08 },
    { id: "resonance", type: "passive", icon: "◇", name: "元素共鸣", max: 5, exclusiveTo: "arcanist", description: "全部元素法术伤害提高 8%。", apply: () => player.spellDamageMult *= 1.08 },
    { id: "eagle", type: "passive", icon: "◎", name: "鹰眼护符", max: 5, description: "所有范围伤害的作用范围提高 5%。", apply: () => player.areaMult *= 1.05 },
  ];

  const talentCatalog = [
    { id: "emberEdge", type: "talent", character: "vanguard", tier: 10, icon: "⚔", name: "炽刃架势", description: "余烬剑伤害提高 25%，并额外增加一个攻击方位。" },
    { id: "ironOath", type: "talent", character: "vanguard", tier: 10, icon: "⛨", name: "黑铁誓约", description: "最大生命提高 24，护甲提高 3。", apply: () => { player.maxHp += 24; player.hp += 24; player.armor += 3; } },
    { id: "counterFlame", type: "talent", character: "vanguard", tier: 20, icon: "✹", name: "反击余焰", description: "受到伤害时释放一次近身火焰反击，3 秒冷却。" },
    { id: "battleFever", type: "talent", character: "vanguard", tier: 20, icon: "»", name: "浴火狂热", description: "生命低于 40% 时，武器攻击间隔缩短 25%。" },
    { id: "undying", type: "talent", character: "vanguard", tier: 30, icon: "◇", name: "不灭余烬", description: "致命伤会保留 1 点生命并获得短暂无敌，45 秒冷却。" },
    { id: "warReaver", type: "talent", character: "vanguard", tier: 30, icon: "+", name: "战意汲取", description: "每击败一个敌人恢复 0.35 点生命。" },

    { id: "deadeye", type: "talent", character: "ranger", tier: 10, icon: "◎", name: "致命鹰眼", description: "武器投射物有 18% 概率造成双倍伤害。" },
    { id: "windRunner", type: "talent", character: "ranger", tier: 10, icon: "➜", name: "逐风步", description: "移动速度提高 12%，所有攻击间隔缩短 8%。", apply: () => { player.speed *= 1.12; player.cooldownMult *= .92; } },
    { id: "splitVolley", type: "talent", character: "ranger", tier: 20, icon: "➶", name: "分裂齐射", description: "猎风弓额外发射一支箭，并获得 1 次额外穿透。" },
    { id: "ballistics", type: "talent", character: "ranger", tier: 20, icon: "➹", name: "弹道专精", description: "所有武器投射物伤害提高 22%。" },
    { id: "giantSlayer", type: "talent", character: "ranger", tier: 30, icon: "◆", name: "巨兽猎手", description: "投射物对精英和 Boss 额外造成 35% 伤害。" },
    { id: "huntTempo", type: "talent", character: "ranger", tier: 30, icon: "»", name: "狩猎节奏", description: "击败敌人后，移动和攻击速度提高 15%，持续 3 秒。" },

    { id: "kindling", type: "talent", character: "arcanist", tier: 10, icon: "✹", name: "不熄火种", description: "灼烧伤害与持续时间提高 40%。" },
    { id: "conductive", type: "talent", character: "arcanist", tier: 10, icon: "ϟ", name: "导电铭文", description: "感电持续更久，连锁闪电额外命中一个目标。" },
    { id: "deepFreeze", type: "talent", character: "arcanist", tier: 20, icon: "❄", name: "极寒核心", description: "冻结持续时间和碎冰伤害提高 35%。" },
    { id: "elementCycle", type: "talent", character: "arcanist", tier: 20, icon: "◇", name: "元素轮转", description: "交替施放不同元素法术时，其他法术冷却缩短 0.2 秒。" },
    { id: "reactionMaster", type: "talent", character: "arcanist", tier: 30, icon: "✦", name: "反应大师", description: "碎冰与超载造成的伤害提高 50%。" },
    { id: "arcaneFlow", type: "talent", character: "arcanist", tier: 30, icon: "»", name: "奥术奔流", description: "元素反应使法术冷却缩短 0.2 秒，每 0.6 秒最多触发一次。" },
  ];

  const evolutionCatalog = [
    { id: "infernoBlade", type: "evolution", weaponId: "blade", requiredPassive: "berserk", icon: "⚔", name: "烈焰断罪", description: "斩击范围和伤害大幅提高，并为命中目标附加灼烧。" },
    { id: "cloudBow", type: "evolution", weaponId: "bow", requiredPassive: "eagle", icon: "➶", name: "穿云长弓", description: "箭矢最多穿透 12 个目标，并额外发射两支分裂箭。" },
    { id: "shadowDance", type: "evolution", weaponId: "shuriken", requiredPassive: "rapid", icon: "✦", name: "千影轮舞", description: "手里剑改为向四周投射，并最多穿透 8 个目标。" },
    { id: "cataclysmBomb", type: "evolution", weaponId: "bomb", requiredPassive: "eagle", icon: "●", name: "灾变火药", description: "每次爆炸后产生一次延迟的二次爆炸。" },
    { id: "beastCrossbow", type: "evolution", weaponId: "crossbow", requiredPassive: "berserk", icon: "➹", name: "巨兽猎手", description: "对精英和 Boss 的伤害及击退进一步提高。" },
    { id: "stormDomain", type: "evolution", weaponId: "lightning", requiredPassive: "resonance", icon: "ϟ", name: "雷暴领域", description: "电场扩大，并强化感电连锁。" },
    { id: "meteorSpell", type: "evolution", weaponId: "fireball", requiredPassive: "resonance", icon: "✹", name: "陨星术", description: "火球爆炸后留下持续燃烧的陨火区域。" },
    { id: "eternalNova", type: "evolution", weaponId: "frostNova", requiredPassive: "resonance", icon: "❄", name: "永冻新星", description: "冻结结束时，对本次命中的目标触发一次碎冰波。" },
    { id: "bloodMoonChopper", type: "evolution", weaponId: "chopper", requiredPassive: "rapid", icon: "◒", name: "血月飞轮", description: "额外投出一把飞斧，返程造成更高伤害并大幅提高穿透。" },
    { id: "thornCrown", type: "evolution", weaponId: "thorn", requiredPassive: "armor", icon: "◈", name: "荆棘王冠", description: "额外轮刃持续更久，扩大轨道并强化击退。" },
    { id: "eternalMinefield", type: "evolution", weaponId: "frostMine", requiredPassive: "eagle", icon: "◆", name: "永冻雷区", description: "额外布雷并扩大爆炸，任意地雷触发时连锁整片雷区。" },
    { id: "plagueCrucible", type: "evolution", weaponId: "poisonPot", requiredPassive: "book", icon: "♨", name: "瘟疫坩埚", description: "毒雾范围、持续时间和伤害提高，中毒敌人死亡时扩散小型毒雾。" },
  ];

  const endlessCatalog = [
    { id: "endlessPower", type: "endless", icon: "✦", name: "无尽威能", description: "所有伤害永久提高 4%。", apply: () => player.damageMult *= 1.04 },
    { id: "endlessVigor", type: "endless", icon: "+", name: "无尽生机", description: "最大生命提高 8，并立即恢复 8 点生命。", apply: () => { player.maxHp += 8; player.hp = Math.min(player.maxHp, player.hp + 8); } },
    { id: "endlessTempo", type: "endless", icon: "»", name: "无尽律动", description: "武器与法术间隔永久缩短 2%，最低降至基础间隔的 35%。", apply: () => player.cooldownMult = Math.max(.35, player.cooldownMult * .98) },
  ];

  const metaUpgradeCatalog = [
    { id: "health", icon: "+", name: "生命余烬", max: 5, baseCost: 60, stepCost: 50, description: "每级开局最大生命 +8" },
    { id: "damage", icon: "✦", name: "锋锐火种", max: 5, baseCost: 90, stepCost: 65, description: "每级开局伤害 +3%" },
    { id: "reroll", icon: "↻", name: "命运残页", max: 3, baseCost: 80, stepCost: 80, description: "每级每局免费重抽 +1" },
  ];

  const upgradeCatalog = [...weaponsCatalog, ...passivesCatalog];
  const characterById = Object.fromEntries(characters.map((character) => [character.id, character]));
  const weaponById = Object.fromEntries(weaponsCatalog.map((weapon) => [weapon.id, weapon]));
  const passiveById = Object.fromEntries(passivesCatalog.map((passive) => [passive.id, passive]));
  const talentById = Object.fromEntries(talentCatalog.map((talent) => [talent.id, talent]));
  const evolutionByWeapon = Object.fromEntries(evolutionCatalog.map((evolution) => [evolution.weaponId, evolution]));
  let profile = loadProfile();

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    vignetteGradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .15, width / 2, height / 2, Math.max(width, height) * .75);
    vignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGradient.addColorStop(1, "rgba(6,14,9,.30)");
    healthBarBottom = Math.max(18, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom") || "18", 10));
    lastRenderedMode = null;
  }

  function formatTime(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function readRecord(key) {
    try { return Number(localStorage.getItem(key) || 0); }
    catch { return 0; }
  }

  function writeRecord(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch { /* The game remains fully playable when storage is unavailable. */ }
  }

  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem("emberlands-profile") || "null");
      return {
        coins: Math.max(0, Number(saved?.coins ?? readRecord("emberlands-bank"))),
        selected: characterById?.[saved?.selected] ? saved.selected : "vanguard",
        unlocked: [...new Set([...characters.map((character) => character.id), ...(Array.isArray(saved?.unlocked) ? saved.unlocked : [])])],
        ranks: Object.fromEntries(characters.map((character) => [character.id, clamp(Number(saved?.ranks?.[character.id] || 0), 0, 5)])),
        meta: Object.fromEntries(metaUpgradeCatalog.map((item) => [item.id, clamp(Number(saved?.meta?.[item.id] || 0), 0, item.max)])),
      };
    } catch {
      return { coins: 0, selected: "vanguard", unlocked: characters.map((character) => character.id), ranks: Object.fromEntries(characters.map((character) => [character.id, 0])), meta: Object.fromEntries(metaUpgradeCatalog.map((item) => [item.id, 0])) };
    }
  }

  function saveProfile() {
    try { localStorage.setItem("emberlands-profile", JSON.stringify(profile)); }
    catch { writeRecord("emberlands-bank", profile.coins); }
  }

  function selectedCharacter() { return characterById[profile.selected] || characters[0]; }

  function masteryCost(character) {
    const rank = profile.ranks[character.id] || 0;
    return 35 + rank * 45;
  }

  function metaUpgradeCost(item) {
    return item.baseCost + (profile.meta[item.id] || 0) * item.stepCost;
  }

  function renderMetaShop() {
    if (!ui.metaShopItems) return;
    ui.metaShopItems.innerHTML = "";
    for (const item of metaUpgradeCatalog) {
      const level = profile.meta[item.id] || 0;
      const cost = metaUpgradeCost(item);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meta-shop-btn";
      button.disabled = level >= item.max || profile.coins < cost;
      button.title = `${item.description}（${level}/${item.max}）`;
      button.innerHTML = `<i>${item.icon}</i><strong>${item.name} ${level}/${item.max}</strong><small>${level >= item.max ? "已满级" : `${item.description} · `}<b>${level >= item.max ? "" : `● ${cost}`}</b></small>`;
      button.addEventListener("click", () => buyMetaUpgrade(item.id));
      ui.metaShopItems.append(button);
    }
  }

  function buyMetaUpgrade(id) {
    const item = metaUpgradeCatalog.find((upgrade) => upgrade.id === id);
    if (!item) return;
    const level = profile.meta[id] || 0;
    const cost = metaUpgradeCost(item);
    if (level >= item.max || profile.coins < cost) return;
    profile.coins -= cost;
    profile.meta[id] = level + 1;
    saveProfile();
    renderCharacterMenu();
  }

  function renderCharacterMenu() {
    if (!ui.roster) return;
    ui.bankCoins.textContent = profile.coins;
    ui.roster.innerHTML = "";
    characters.forEach((character) => {
      const unlocked = profile.unlocked.includes(character.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `character-card${profile.selected === character.id ? " selected" : ""}${unlocked ? "" : " locked"}`;
      card.title = unlocked ? `选择${character.name}` : `花费 ${character.cost} 金币解锁`;
      card.innerHTML = `<canvas class="portrait" width="64" height="64" aria-hidden="true"></canvas><strong>${character.name}</strong><small>${character.weaponName}</small>${unlocked ? "" : `<span class="lock-cost">● ${character.cost}</span>`}`;
      card.addEventListener("click", () => selectCharacter(character.id));
      ui.roster.append(card);
      drawCharacterPortrait(card.querySelector(".portrait"), character);
    });
    const character = selectedCharacter();
    const rank = profile.ranks[character.id] || 0;
    ui.characterName.textContent = character.name;
    ui.characterWeapon.textContent = character.weaponName;
    ui.characterPerk.textContent = character.perk;
    ui.masteryPips.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("");
    if (rank >= 5) {
      ui.masteryButton.textContent = "已满级";
      ui.masteryButton.disabled = true;
    } else {
      ui.masteryButton.textContent = `强化 · ${masteryCost(character)}`;
      ui.masteryButton.disabled = profile.coins < masteryCost(character) || !profile.unlocked.includes(character.id);
    }
    renderMetaShop();
  }

  function selectCharacter(id) {
    const character = characterById[id];
    if (!character) return;
    profile.selected = id;
    saveProfile();
    renderCharacterMenu();
  }

  function upgradeMastery() {
    const character = selectedCharacter();
    const cost = masteryCost(character);
    const rank = profile.ranks[character.id] || 0;
    if (rank >= 5 || profile.coins < cost) { tone(90, .08, "square", .025); return; }
    profile.coins -= cost;
    profile.ranks[character.id] = rank + 1;
    saveProfile();
    renderCharacterMenu();
    tone(660, .14, "sine", .04);
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function distanceSq(a, b) { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; }
  function distanceSqTo(entity, x, y) { const dx = entity.x - x; const dy = entity.y - y; return dx * dx + dy * dy; }
  function segmentPointDistanceSq(startX, startY, endX, endY, pointX, pointY) {
    const moveX = endX - startX, moveY = endY - startY;
    const moveLengthSq = moveX * moveX + moveY * moveY;
    const projection = moveLengthSq > 0 ? clamp(((pointX - startX) * moveX + (pointY - startY) * moveY) / moveLengthSq, 0, 1) : 0;
    const closestX = startX + moveX * projection, closestY = startY + moveY * projection;
    const dx = pointX - closestX, dy = pointY - closestY;
    return dx * dx + dy * dy;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function indexEnemyInBuckets(enemy) {
    const cellX = Math.floor(enemy.x / ENEMY_CELL_SIZE);
    const cellY = Math.floor(enemy.y / ENEMY_CELL_SIZE);
    let column = enemyBuckets.get(cellX);
    if (!column) {
      column = new Map();
      enemyBuckets.set(cellX, column);
    }
    let bucket = column.get(cellY);
    if (!bucket) {
      bucket = { x: cellX, y: cellY, items: [], lastUsed: enemyBucketFrame };
      column.set(cellY, bucket);
      allEnemyBuckets.push(bucket);
    }
    if (bucket.items.length === 0) activeEnemyBuckets.push(bucket);
    bucket.lastUsed = enemyBucketFrame;
    bucket.items.push(enemy);
  }

  function rebuildEnemyBuckets() {
    enemyBucketFrame += 1;
    for (const bucket of activeEnemyBuckets) bucket.items.length = 0;
    activeEnemyBuckets.length = 0;
    for (const enemy of state.enemies) indexEnemyInBuckets(enemy);
    if (enemyBucketFrame % 300 === 0) {
      for (let i = allEnemyBuckets.length - 1; i >= 0; i--) {
        const bucket = allEnemyBuckets[i];
        if (enemyBucketFrame - bucket.lastUsed <= 600) continue;
        const column = enemyBuckets.get(bucket.x);
        column?.delete(bucket.y);
        if (column?.size === 0) enemyBuckets.delete(bucket.x);
        allEnemyBuckets.splice(i, 1);
      }
    }
  }

  function collectNearbyEnemies(x, y, radius, result) {
    result.length = 0;
    const minX = Math.floor((x - radius) / ENEMY_CELL_SIZE);
    const maxX = Math.floor((x + radius) / ENEMY_CELL_SIZE);
    const minY = Math.floor((y - radius) / ENEMY_CELL_SIZE);
    const maxY = Math.floor((y + radius) / ENEMY_CELL_SIZE);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      const column = enemyBuckets.get(cellX);
      if (!column) continue;
      for (let cellY = minY; cellY <= maxY; cellY++) {
        const bucket = column.get(cellY);
        if (!bucket) continue;
        for (const enemy of bucket.items) result.push(enemy);
      }
    }
    if (PERF_ENABLED) {
      perfQueries.calls += 1;
      perfQueries.candidates += result.length;
      perfQueries.fullScanEquivalent += state.enemies.length;
    }
  }

  function acquireEnemyQuery(x, y, radius) {
    const result = enemyQueryPool.pop() || [];
    collectNearbyEnemies(x, y, radius, result);
    return result;
  }

  function releaseEnemyQuery(result) {
    result.length = 0;
    enemyQueryPool.push(result);
  }

  function clearEnemyIndex() {
    enemyById.clear();
    enemyBuckets.clear();
    activeEnemyBuckets.length = 0;
    allEnemyBuckets.length = 0;
    enemyQueryPool.length = 0;
    enemyUpdateIds.length = 0;
    chainTargets.length = 0;
    chainDistances.length = 0;
    lightningTargets.length = 0;
    enemyBucketFrame = 0;
  }

  function perfStart() { return PERF_ENABLED ? performance.now() : 0; }

  function perfEnd(phase, startedAt) {
    if (!PERF_ENABLED) return;
    const elapsed = performance.now() - startedAt;
    perfTotals[phase] += elapsed;
    perfMaximums[phase] = Math.max(perfMaximums[phase], elapsed);
  }

  function finishPerfSample() {
    if (!PERF_ENABLED) return;
    perfSamples += 1;
    if (perfSamples < 120) return;
    for (const phase of PERF_PHASES) {
      perfReport.averages[phase] = Number((perfTotals[phase] / perfSamples).toFixed(3));
      perfReport.maximums[phase] = Number(perfMaximums[phase].toFixed(3));
      perfTotals[phase] = 0;
      perfMaximums[phase] = 0;
    }
    perfReport.samples += perfSamples;
    perfReport.load = {
      enemies: state.enemies.length, projectiles: state.projectiles.length, enemyShots: state.enemyShots.length,
      pickups: state.pickups.length, effects: state.effects.length, particles: state.particles.length,
      texts: state.texts.length, activeBuckets: activeEnemyBuckets.length, retainedBuckets: allEnemyBuckets.length,
      particlePool: particlePool.length, textPool: textPool.length,
    };
    perfReport.queries = {
      calls: perfQueries.calls,
      averageCandidates: perfQueries.calls ? Number((perfQueries.candidates / perfQueries.calls).toFixed(2)) : 0,
      avoidedPercent: perfQueries.fullScanEquivalent ? Number(((1 - perfQueries.candidates / perfQueries.fullScanEquivalent) * 100).toFixed(1)) : 0,
    };
    perfQueries.calls = 0;
    perfQueries.candidates = 0;
    perfQueries.fullScanEquivalent = 0;
    perfSamples = 0;
    if (perfOutput) perfOutput.textContent = JSON.stringify(perfReport);
  }

  function addParticle(x, y, vx, vy, life, size, color) {
    if (state.particles.length >= MAX_PARTICLES) return;
    const entry = particlePool.pop() || {};
    entry.x = x; entry.y = y; entry.vx = vx; entry.vy = vy;
    entry.life = life; entry.max = life; entry.size = size; entry.color = color;
    state.particles.push(entry);
  }

  function addText(x, y, value, life, color) {
    if (state.texts.length >= MAX_TEXTS) return;
    const entry = textPool.pop() || {};
    entry.x = x; entry.y = y; entry.text = value; entry.life = life; entry.color = color;
    state.texts.push(entry);
  }

  function recycleVisuals() {
    for (const particle of state.particles) if (particlePool.length < MAX_PARTICLES) particlePool.push(particle);
    for (const text of state.texts) if (textPool.length < MAX_TEXTS) textPool.push(text);
    state.particles.length = 0;
    state.texts.length = 0;
  }

  function addPickup(item) {
    if (item.type === "xp") item.life = Infinity;
    const priorityPickup = item.type === "heart" || item.type === "purge" || item.type === "vacuum";
    if (state.pickups.length < MAX_PICKUPS || priorityPickup) {
      state.pickups.push(item);
      return;
    }
    let target = null;
    for (const pickup of state.pickups) {
      if (pickup.type !== item.type) continue;
      if (!target || distanceSq(pickup, item) < distanceSq(target, item)) target = pickup;
    }
    if (!target) { state.pickups.push(item); return; }
    target.value += item.value;
    target.life = Math.max(target.life, item.life);
    target.r = Math.min(10, target.r + .2);
  }

  function hash(x, y, salt = 0) {
    let n = Math.imul(x + salt * 1013, 374761393) + Math.imul(y - salt * 991, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function showScreen(element) {
    document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
    if (element) element.classList.add("active");
  }

  function resetGame() {
    const character = selectedCharacter();
    const rank = profile.ranks[character.id] || 0;
    const metaHealth = profile.meta.health || 0;
    const metaDamage = profile.meta.damage || 0;
    const startingMaxHp = character.hp * (1 + rank * .04) + metaHealth * 8;
    const startingWeapons = { [character.weapon]: 1 };
    for (const spec of PERF_LOADOUT) {
      const [id, rawLevel] = spec.split(":");
      if (!weaponById[id]) continue;
      startingWeapons[id] = clamp(Math.floor(Number(rawLevel) || 1), 1, weaponById[id].max);
    }
    recycleVisuals();
    Object.assign(player, {
      x: 0, y: 0, r: 15, speed: character.speed * (1 + rank * .02),
      hp: startingMaxHp, maxHp: startingMaxHp, invulnerable: PERF_GOD_MODE ? 1e9 : 0,
      xp: 0, xpNext: 18, level: 1, damageMult: character.damage * BASE_ATTACK_DAMAGE_MULT * (1 + rank * .04) * (1 + metaDamage * .03), levelDamageMult: 1, weaponDamageMult: 1, spellDamageMult: 1, cooldownMult: 1, areaMult: 1,
      armor: character.armor + rank, goldMult: 1, xpMult: character.xp || 1,
      vision: 520 + rank * 12, projectileSpeed: 540, pickupRange: PERF_AUTO_COLLECT ? 2000 : 78,
      regen: character.regen || 0, lastDamageAt: -Infinity, facing: 1, aimX: 1, aimY: 0, weapons: startingWeapons, passives: {}, talents: {}, evolutions: {}, endlessUpgrades: {}, weaponClocks: Object.fromEntries(Object.keys(startingWeapons).map((id, index) => [id, index * .18])), trailClock: 0,
      hasteUntil: 0, counterReadyAt: 0, lastStandReadyAt: 0, lastSpell: null, lastFlowAt: -Infinity,
    });
    Object.assign(state, {
      mode: "running", time: 0, wave: 1, spawnClock: .2, propClock: 10, kills: 0,
      coins: PERF_START_COINS, shake: 0, flash: 0, bossSpawned: false, bossCount: 0, nextBossAt: 300, boss: null,
      enemies: [], projectiles: [], enemyShots: [], pickups: [], breakables: [], particles: [], effects: [], texts: [], pendingUpgradeAfterTalent: false,
      upgradeRerolls: 0, upgradeBanishes: 0, paidExtraUpgrades: 0, extraUpgradePending: false, banishMode: false,
      freeRerolls: profile.meta.reroll || 0, banishedUpgradeIds: new Set(), hudClock: 0, pickupAccumulator: 0,
      reviveUsed: false, bankedRunCoins: 0,
    });
    clearEnemyIndex();
    spawnBreakables(10);
    while (state.enemies.length < PERF_STRESS_ENEMIES) spawnEnemy();
    ui.hud.classList.remove("hidden");
    if (matchMedia("(pointer: coarse)").matches) ui.touch.classList.remove("hidden");
    showScreen(null);
    updateHud();
    renderSlots();
    tone(220, 0.08, "square", 0.035);
  }

  function goHome() {
    state.mode = "menu";
    state.boss = null;
    state.bossSpawned = false;
    state.enemies.length = 0;
    state.projectiles.length = 0;
    state.enemyShots.length = 0;
    state.pickups.length = 0;
    state.breakables.length = 0;
    recycleVisuals();
    state.effects.length = 0;
    clearEnemyIndex();
    ui.hud.classList.add("hidden");
    ui.touch.classList.add("hidden");
    ui.bossWrap.classList.add("hidden");
    showScreen(ui.start);
    updateRecord();
    renderCharacterMenu();
  }

  function togglePause(forceResume = false) {
    if (state.mode === "running") {
      state.mode = "paused";
      showScreen(ui.pause);
    } else if (state.mode === "paused") {
      state.mode = "running";
      showScreen(null);
      state.last = performance.now();
    }
  }

  function updateRecord() {
    const best = readRecord("emberlands-best");
    const level = readRecord("emberlands-level");
    ui.record.textContent = best ? `最佳记录 ${formatTime(best)}  ·  最高等级 ${level}  ·  远征金币 ${profile.coins}` : `远征金币 ${profile.coins}  ·  你的第一段荒原旅途正在等待`;
    if (ui.bankCoins) ui.bankCoins.textContent = profile.coins;
  }

  function updateHud() {
    ui.time.textContent = formatTime(state.time);
    ui.level.textContent = `等级 ${player.level}`;
    ui.wave.textContent = state.boss ? `Boss ${state.bossCount}` : `威胁 ${state.wave}`;
    ui.xp.style.width = `${Math.min(100, player.xp / player.xpNext * 100)}%`;
    ui.coins.textContent = state.coins;
    if (state.boss) {
      ui.bossWrap.classList.remove("hidden");
      ui.bossFill.style.width = `${Math.max(0, state.boss.hp / state.boss.maxHp * 100)}%`;
    } else {
      ui.bossWrap.classList.add("hidden");
    }
  }

  function renderSlots() {
    ui.slots.innerHTML = "";
    for (const item of weaponsCatalog) {
      const level = player.weapons[item.id] || 0;
      if (!level) continue;
      const evolution = player.evolutions[item.id] ? evolutionByWeapon[item.id] : null;
      const slot = document.createElement("div");
      slot.className = `weapon-slot${evolution ? " evolved" : ""}`;
      slot.title = evolution ? `${evolution.name} · 已进化` : `${item.name} ${level}级`;
      slot.innerHTML = `<span>${evolution?.icon || item.icon}</span><small>${evolution ? "★" : level}</small>`;
      ui.slots.append(slot);
    }
    ui.talents.innerHTML = "";
    for (const id of Object.keys(player.talents)) {
      const talent = talentById[id];
      if (!talent) continue;
      const badge = document.createElement("div");
      badge.className = "talent-slot";
      badge.title = `${talent.name}：${talent.description}`;
      badge.textContent = talent.icon;
      ui.talents.append(badge);
    }
  }

  function readyEvolutions() {
    return evolutionCatalog.filter((evolution) =>
      player.weapons[evolution.weaponId] >= 6 &&
      (player.passives[evolution.requiredPassive] || 0) > 0 &&
      !player.evolutions[evolution.weaponId] &&
      !state.banishedUpgradeIds.has(upgradeKey(evolution)));
  }

  function upgradeKey(item) {
    return `${item.type}:${item.type === "evolution" ? item.weaponId : item.id}`;
  }

  function pickUpgrades() {
    const activeWeaponCount = Object.values(player.weapons).filter(Boolean).length;
    const character = selectedCharacter();
    const available = upgradeCatalog.filter((item) => {
      const level = item.type === "weapon" ? (player.weapons[item.id] || 0) : (player.passives[item.id] || 0);
      if (level >= item.max) return false;
      if (item.type === "weapon" && character.id === "arcanist" && !item.exclusive) return false;
      if (item.id === "berserk" && character.id === "arcanist") return false;
      if (item.exclusiveTo && character.id !== item.exclusiveTo) return false;
      if (item.type === "weapon" && item.exclusive && level === 0 && character.id !== "arcanist") return false;
      if (state.banishedUpgradeIds.has(upgradeKey(item))) return false;
      return item.type !== "weapon" || level > 0 || activeWeaponCount < 6;
    });
    const pool = [...available].sort(() => Math.random() - 0.5);
    const evolutions = readyEvolutions().sort(() => Math.random() - .5);
    if (!evolutions.length && !pool.length) {
      const endless = endlessCatalog.filter((item) => !state.banishedUpgradeIds.has(upgradeKey(item)));
      return [...(endless.length ? endless : endlessCatalog)].sort(() => Math.random() - .5);
    }
    const choices = !evolutions.length ? pool.slice(0, Math.min(3, pool.length)) : [evolutions[0], ...pool.slice(0, 2)];
    const owned = available.filter((item) =>
      (item.type === "weapon" && (player.weapons[item.id] || 0) > 0) ||
      (item.type === "passive" && (player.passives[item.id] || 0) > 0));
    if (owned.length && !choices.some((item) => owned.includes(item))) {
      const replacement = owned[Math.floor(Math.random() * owned.length)];
      const replaceIndex = choices.findIndex((item) => item.type !== "evolution");
      if (replaceIndex >= 0) choices[replaceIndex] = replacement;
    }
    return [...new Set(choices)].sort(() => Math.random() - .5);
  }

  let currentChoices = [];
  let currentChoiceContext = { shopEnabled: false };

  function rerollCost() { return 6 + state.upgradeRerolls * 4; }
  function extraUpgradeCost() { return 18 + state.paidExtraUpgrades * 12; }
  function banishCost() { return 10 + state.upgradeBanishes * 8; }

  function updateUpgradeActions() {
    const enabled = currentChoiceContext.shopEnabled;
    ui.upgradeActions.classList.toggle("hidden", !enabled);
    if (!enabled) return;
    const rerollPrice = rerollCost();
    const extraPrice = extraUpgradeCost();
    ui.rerollUpgrades.querySelector("span").textContent = state.freeRerolls > 0 ? `↻ 重抽 · ${state.freeRerolls}次免费` : "↻ 重抽";
    ui.rerollUpgrades.querySelector("small").textContent = state.freeRerolls > 0 ? "本次免费" : `● ${rerollPrice}`;
    ui.buyExtraUpgrade.querySelector("small").textContent = `● ${extraPrice}`;
    ui.banishUpgrade.querySelector("span").textContent = state.banishMode ? "取消放逐" : "⊘ 放逐";
    ui.banishUpgrade.querySelector("small").textContent = state.banishMode ? "点击卡牌确认" : `● ${banishCost()}`;
    ui.rerollUpgrades.disabled = state.freeRerolls <= 0 && state.coins < rerollPrice;
    ui.buyExtraUpgrade.disabled = state.extraUpgradePending || state.coins < extraPrice;
    ui.banishUpgrade.disabled = !state.banishMode && state.coins < banishCost();
  }

  function presentChoices(choices, kicker, title, options = {}) {
    state.mode = "levelup";
    currentChoices = choices;
    currentChoiceContext = { shopEnabled: Boolean(options.shopEnabled), paidExtra: Boolean(options.paidExtra) };
    ui.levelKicker.textContent = kicker;
    ui.levelTitle.textContent = title;
    ui.cards.innerHTML = "";
    currentChoices.forEach((item, index) => {
      const current = item.type === "weapon" ? (player.weapons[item.id] || 0) : item.type === "passive" ? (player.passives[item.id] || 0) : item.type === "endless" ? (player.endlessUpgrades[item.id] || 0) : 0;
      let footer = item.type === "evolution" ? "武器进化 · 不占槽位" : item.type === "talent" ? "职业天赋 · 不占槽位" : item.type === "endless" ? `无尽强化 · 已选 ${current} 次` : `等级 ${current} → ${current + 1}`;
      const evolution = item.type === "weapon" ? evolutionByWeapon[item.id] : null;
      if (evolution && current === item.max - 1) footer = `升至满级 · 搭配${passiveById[evolution.requiredPassive].name}可进化`;
      const card = document.createElement("button");
      card.className = `upgrade-card ${item.type}`;
      card.type = "button";
      card.innerHTML = `
        <span class="card-number">${index + 1}</span>
        <span class="card-icon">${item.icon}</span>
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <small>${footer}</small>`;
      card.addEventListener("click", () => chooseUpgrade(index));
      ui.cards.append(card);
    });
    updateUpgradeActions();
    showScreen(ui.levelScreen);
    tone(520, 0.1, "sine", 0.04);
    setTimeout(() => tone(720, 0.15, "sine", 0.035), 70);
  }

  function presentLevelUp() {
    state.extraUpgradePending = false;
    state.banishMode = false;
    presentChoices(pickUpgrades(), "余烬回应了你", "选择一项强化", { shopEnabled: true });
  }

  function presentTalentChoice(tier) {
    const character = selectedCharacter();
    const choices = talentCatalog.filter((talent) => talent.character === character.id && talent.tier === tier && !player.talents[talent.id]);
    presentChoices(choices, `${character.name} · ${tier}级天赋`, "选择职业道路");
  }

  function rerollUpgrades() {
    if (state.mode !== "levelup" || !currentChoiceContext.shopEnabled) return;
    const cost = rerollCost();
    if (state.freeRerolls > 0) state.freeRerolls -= 1;
    else {
      if (state.coins < cost) return;
      state.coins -= cost;
      state.upgradeRerolls += 1;
    }
    state.banishMode = false;
    currentChoices = pickUpgrades();
    presentChoices(currentChoices, "命运重新编织", "重新选择强化", { shopEnabled: true });
    updateHud();
  }

  function buyExtraUpgrade() {
    if (state.mode !== "levelup" || !currentChoiceContext.shopEnabled || state.extraUpgradePending) return;
    const cost = extraUpgradeCost();
    if (state.coins < cost) return;
    state.coins -= cost;
    state.paidExtraUpgrades += 1;
    state.extraUpgradePending = true;
    updateUpgradeActions();
    updateHud();
  }

  function toggleBanishUpgrade() {
    if (state.mode !== "levelup" || !currentChoiceContext.shopEnabled) return;
    if (!state.banishMode && state.coins < banishCost()) return;
    state.banishMode = !state.banishMode;
    ui.levelKicker.textContent = state.banishMode ? "放逐不会消耗本次升级" : "余烬回应了你";
    ui.levelTitle.textContent = state.banishMode ? "选择一张不再出现的卡牌" : "选择一项强化";
    ui.cards.classList.toggle("banish-mode", state.banishMode);
    updateUpgradeActions();
  }

  function skipUpgrade() {
    if (state.mode !== "levelup" || !currentChoiceContext.shopEnabled) return;
    state.banishMode = false;
    player.hp = Math.min(player.maxHp, player.hp + Math.max(12, player.maxHp * .15));
    state.coins += 5;
    addText(player.x, player.y - 28, "整备 +5金币", .9, "#a8e6a2");
    if (state.extraUpgradePending) {
      state.extraUpgradePending = false;
      presentChoices(pickUpgrades(), "金币余烬", "选择额外强化", { paidExtra: true });
      updateHud();
      return;
    }
    resumeAfterUpgrade();
  }

  function resumeAfterUpgrade() {
    state.banishMode = false;
    ui.cards.classList.remove("banish-mode");
    ui.upgradeActions.classList.add("hidden");
    showScreen(null);
    state.mode = "running";
    state.last = performance.now();
    burst(player.x, player.y, "#ffd36a", 18, 150);
    if (player.xp >= player.xpNext) levelUp();
  }

  function chooseUpgrade(index) {
    if (state.mode !== "levelup" || !currentChoices[index]) return;
    const item = currentChoices[index];
    if (state.banishMode && currentChoiceContext.shopEnabled) {
      const cost = banishCost();
      if (state.coins < cost) return;
      state.coins -= cost;
      state.upgradeBanishes += 1;
      state.banishedUpgradeIds.add(upgradeKey(item));
      state.banishMode = false;
      ui.cards.classList.remove("banish-mode");
      presentChoices(pickUpgrades(), "记忆已从余烬中抹去", "重新选择强化", { shopEnabled: true });
      updateHud();
      return;
    }
    if (item.type === "weapon") {
      const currentLevel = player.weapons[item.id] || 0;
      if (currentLevel === 0) player.weaponClocks[item.id] = .2 + Object.keys(player.weapons).length * .13;
      player.weapons[item.id] = currentLevel + 1;
    }
    else if (item.type === "passive") {
      player.passives[item.id] = (player.passives[item.id] || 0) + 1;
      item.apply();
    } else if (item.type === "evolution") {
      player.evolutions[item.weaponId] = item.id;
    } else if (item.type === "talent") {
      player.talents[item.id] = true;
      item.apply?.();
    } else if (item.type === "endless") {
      player.endlessUpgrades[item.id] = (player.endlessUpgrades[item.id] || 0) + 1;
      item.apply();
    }
    renderSlots();
    if (item.type === "talent" && state.pendingUpgradeAfterTalent) {
      state.pendingUpgradeAfterTalent = false;
      burst(player.x, player.y, "#ffd36a", 22, 165);
      presentLevelUp();
      return;
    }
    if (state.extraUpgradePending && currentChoiceContext.shopEnabled) {
      state.extraUpgradePending = false;
      burst(player.x, player.y, "#f0c766", 18, 145);
      presentChoices(pickUpgrades(), "金币余烬", "选择额外强化", { paidExtra: true });
      return;
    }
    resumeAfterUpgrade();
  }

  function levelUp() {
    player.xp -= player.xpNext;
    player.level += 1;
    player.xpNext = Math.floor(18 + player.level * player.level * 3.2);
    player.maxHp += 2;
    player.hp = Math.min(player.maxHp, player.hp + 8);
    const previousLevelDamageMult = player.levelDamageMult;
    player.levelDamageMult = Math.min(MAX_LEVEL_DAMAGE_MULT, player.levelDamageMult * 1.02);
    player.damageMult *= player.levelDamageMult / previousLevelDamageMult;
    player.speed *= 1.0025;
    if (player.level % 5 === 0) player.armor += 1;
    updateHud();
    if ([10, 20, 30].includes(player.level)) {
      state.pendingUpgradeAfterTalent = true;
      presentTalentChoice(player.level);
    } else presentLevelUp();
  }

  function spawnBreakables(count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const distance = rand(260, 900);
      state.breakables.push({
        id: nextEntityId++, type: Math.random() < .58 ? "bottle" : "chest",
        x: player.x + Math.cos(angle) * distance, y: player.y + Math.sin(angle) * distance,
        r: 14, hp: 18, hitFlash: 0,
      });
    }
  }

  function breakProp(prop, touched = false) {
    const index = state.breakables.indexOf(prop);
    if (index === -1) return;
    state.breakables.splice(index, 1);
    burst(prop.x, prop.y, prop.type === "chest" ? "#edbe51" : "#b6d7c2", 9, 130);
    if (prop.type === "bottle") {
      if (touched) {
        const healed = Math.min(16, player.maxHp - player.hp);
        player.hp += healed;
        if (healed > 0) addText(player.x, player.y - 28, `+${Math.round(healed)}`, .75, "#7de18a");
      } else addPickup({ type: "heart", x: prop.x, y: prop.y, value: 16, r: 8, life: 45 });
    } else dropBreakableLoot(prop);
    tone(prop.type === "chest" ? 680 : 280, .07, "square", .022);
  }

  function collectTouchedBreakables() {
    for (let i = state.breakables.length - 1; i >= 0; i--) {
      const prop = state.breakables[i];
      if (prop.type === "bottle" && player.hp >= player.maxHp) continue;
      const collectRadius = player.r + prop.r + 4;
      if (distanceSq(player, prop) <= collectRadius * collectRadius) breakProp(prop, true);
    }
  }

  function dropBreakableLoot(prop) {
    const chest = prop.type === "chest";
    const roll = Math.random();
    const drop = (type, value, r, life = 40) => addPickup({ type, x: prop.x + rand(-8, 8), y: prop.y + rand(-8, 8), value, r, life });
    const purgeChance = chest ? .018 : 0;
    const vacuumChance = chest ? .027 : 0;
    const xpEnd = chest ? .36 : .25;
    const coinEnd = chest ? .68 : .43;
    const heartEnd = chest ? .86 : .72;
    if (roll < purgeChance) drop("purge", 1, 11, 50);
    else if (roll < purgeChance + vacuumChance) drop("vacuum", 1, 11, 50);
    else if (roll < xpEnd) drop("xp", chest ? rand(12, 24) : rand(5, 12), chest ? 7 : 6, 50);
    else if (roll < coinEnd) drop("coin", Math.ceil((chest ? rand(5, 10) : rand(1, 4)) * player.goldMult), chest ? 8 : 7, 45);
    else if (roll < heartEnd) drop("heart", chest ? 24 : 12, 8, 45);
  }

  function annihilateCurrentEnemies() {
    let passes = 0;
    while (state.enemies.length && passes < 3) {
      passes += 1;
      for (const enemy of [...state.enemies]) killEnemy(enemy);
    }
    state.enemyShots.length = 0;
    state.shake = Math.max(state.shake, .85);
    state.flash = Math.max(state.flash, .38);
    burst(player.x, player.y, "#ffd36a", 42, 280);
    addText(player.x, player.y - 42, "荒原肃清", 1.25, "#ffe88a");
    tone(96, .32, "sawtooth", .05);
  }

  function gatherAllPickups() {
    let index = 0;
    for (const pickup of state.pickups) {
      const angle = index * 2.4;
      const radius = 8 + index % 6 * 3;
      pickup.x = player.x + Math.cos(angle) * radius;
      pickup.y = player.y + Math.sin(angle) * radius;
      pickup.life = Math.max(pickup.life, 15);
      index += 1;
    }
    burst(player.x, player.y, "#9fe8f0", 28, 180);
    addText(player.x, player.y - 42, "万物归流", 1.25, "#bdf7ff");
    tone(620, .22, "sine", .04);
  }

  function spawnEnemy(forcedType) {
    const angle = Math.random() * TAU;
    const spawnDistance = Math.max(width, height) * 0.62 + rand(80, 220);
    const wave = state.wave;
    let type = forcedType || "skull";
    const roll = Math.random();
    if (!forcedType && wave >= 2 && roll > .48) type = "snake";
    if (!forcedType && wave >= 3 && roll > .69) type = "slime";
    if (!forcedType && wave >= 11 && roll > .84) type = "octopus";
    if (!forcedType && wave >= 6 && roll > .95) type = "elite";

    const config = {
      skull: { r: 14, hp: 34, speed: 58, damage: 12, xp: 4, color: "#d9d4b9" },
      snake: { r: 12, hp: 27, speed: 92, damage: 10, xp: 5, color: "#79b35e" },
      slime: { r: 21, hp: 105, speed: 34, damage: 22, xp: 10, color: "#6ca7a5" },
      octopus: { r: 17, hp: 70, speed: 44, damage: 15, xp: 8, color: "#a173b1" },
      elite: { r: 25, hp: 210, speed: 47, damage: 26, xp: 24, color: "#d28348" },
    }[type];
    const earlyProgress = Math.min(1, state.time / 300);
    const earlyHpScale = .82 + earlyProgress * .18;
    const scale = Math.pow(1.055, Math.floor(state.time / 60)) * (1 + state.time / 420) * earlyHpScale;
    const damageScale = (.72 + earlyProgress * .28) * (1 + Math.min(.75, state.time / 1500));
    const earlyXpScale = 1.2 - earlyProgress * .2;
    const enemy = {
      id: nextEntityId++, type,
      x: player.x + Math.cos(angle) * spawnDistance,
      y: player.y + Math.sin(angle) * spawnDistance,
      r: config.r, hp: config.hp * scale, maxHp: config.hp * scale,
      speed: Math.min(MAX_ENEMY_SPEED, config.speed * Math.min(1.75, 1 + state.time / 480)),
      damage: config.damage * damageScale, xp: config.xp * earlyXpScale, color: config.color,
      attackClock: rand(0.4, 1.4), hitFlash: 0, orbitalHit: 0,
    };
    state.enemies.push(enemy);
    enemyById.set(enemy.id, enemy);
    indexEnemyInBuckets(enemy);
  }

  function spawnBoss() {
    state.bossSpawned = true;
    state.bossCount += 1;
    const angle = -Math.PI / 2 + rand(-.5, .5);
    const scale = Math.pow(1.30, state.bossCount - 1) * (1.35 + Math.max(0, state.time - 300) / 600);
    const boss = {
      id: nextEntityId++, type: "boss", x: player.x + Math.cos(angle) * 580,
      y: player.y + Math.sin(angle) * 580, r: 44, hp: 1450 * scale, maxHp: 1450 * scale,
      speed: Math.min(160, 38 + state.bossCount * 2.5), damage: 30 + state.bossCount * 3.5, xp: 120 + state.bossCount * 18, color: "#7f4a3e", attackClock: 1.5,
      hitFlash: 0, orbitalHit: 0,
    };
    state.boss = boss;
    state.enemies.push(boss);
    enemyById.set(boss.id, boss);
    indexEnemyInBuckets(boss);
    state.shake = 1;
    tone(82, 0.45, "sawtooth", 0.06);
  }

  const weaponCooldowns = { blade: .95, bow: .95, shuriken: 1.2, lightning: 1.55, bomb: 2.5, fireball: 1.45, chopper: 1.9, thorn: 3.35, frostMine: 2.5, crossbow: 2.05, poisonPot: 2.3, frostNova: 3.2 };

  function isEnemyDamageReserved(enemy) {
    if ((enemy.reservedUntil ?? 0) <= state.time) {
      enemy.reservedDamage = 0;
      return false;
    }
    return (enemy.reservedDamage ?? 0) >= Math.max(1, enemy.hp * .8);
  }

  function reserveEnemyDamage(enemy, damage, duration = .7) {
    if (!enemy || enemyById.get(enemy.id) !== enemy) return;
    if ((enemy.reservedUntil ?? 0) <= state.time) enemy.reservedDamage = 0;
    enemy.reservedDamage = (enemy.reservedDamage ?? 0) + Math.max(0, damage);
    enemy.reservedUntil = Math.max(enemy.reservedUntil ?? 0, state.time + duration);
  }

  function estimatedShotDamage(baseDamage, spell = false) {
    const talentMult = !spell && player.talents.ballistics ? 1.22 : 1;
    return baseDamage * player.damageMult * (spell ? player.spellDamageMult : player.weaponDamageMult) * talentMult;
  }

  function nearestEnemy(maxRange = player.vision) {
    let target = null, fallback = null, best = maxRange * maxRange, fallbackBest = best;
    for (const enemy of state.enemies) {
      const d = distanceSq(player, enemy);
      if (d < fallbackBest) { fallbackBest = d; fallback = enemy; }
      if (isEnemyDamageReserved(enemy)) continue;
      if (d < best) { best = d; target = enemy; }
    }
    return target || fallback;
  }

  function strongestEnemy(maxRange = player.vision) {
    let target = null, fallback = null, highestScore = -Infinity, fallbackScore = -Infinity;
    const maxRangeSq = maxRange * maxRange;
    for (const enemy of state.enemies) {
      if (distanceSq(player, enemy) > maxRangeSq) continue;
      const score = enemy.maxHp + (enemy.type === "boss" ? 10000 : enemy.type === "elite" ? 2000 : 0);
      if (score > fallbackScore) { fallbackScore = score; fallback = enemy; }
      if (isEnemyDamageReserved(enemy)) continue;
      if (score > highestScore) { highestScore = score; target = enemy; }
    }
    return target || fallback;
  }

  function angleDistance(a, b) {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  function hasBladeTarget(radius, directions) {
    for (const enemy of state.enemies) {
      const reach = radius + enemy.r;
      if (distanceSq(player, enemy) > reach * reach) continue;
      const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      for (let i = 0; i < directions; i++) {
        if (angleDistance(enemyAngle, bladeDirections[i % bladeDirections.length]) <= TAU / 6) return true;
      }
    }
    return false;
  }

  function densestEnemyTarget(maxRange, clusterRadius) {
    const maxRangeSq = maxRange * maxRange;
    const clusterRadiusSq = clusterRadius * clusterRadius;
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of state.enemies) {
      if (distanceSq(player, candidate) > maxRangeSq) continue;
      let score = candidate.type === "boss" ? 4 : candidate.type === "elite" ? 2 : 1;
      if (isEnemyDamageReserved(candidate)) score -= 5;
      for (const enemy of state.enemies) {
        if (enemy !== candidate && distanceSq(candidate, enemy) <= clusterRadiusSq) score += 1;
      }
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function bestLineAim(fallbackAngle, maxRange, halfWidth) {
    let bestAngle = fallbackAngle;
    let bestScore = 0;
    for (const candidate of state.enemies) {
      const candidateDistanceSq = distanceSq(player, candidate);
      if (candidateDistanceSq > maxRange * maxRange) continue;
      const angle = Math.atan2(candidate.y - player.y, candidate.x - player.x);
      const ux = Math.cos(angle), uy = Math.sin(angle);
      let score = 0;
      for (const enemy of state.enemies) {
        const dx = enemy.x - player.x, dy = enemy.y - player.y;
        const forward = dx * ux + dy * uy;
        if (forward < 0 || forward > maxRange) continue;
        const sideways = Math.abs(dx * uy - dy * ux);
        if (sideways <= halfWidth + enemy.r) score += isEnemyDamageReserved(enemy) ? .1 : enemy.type === "boss" ? 3 : enemy.type === "elite" ? 2 : 1;
      }
      if (score > bestScore) { bestScore = score; bestAngle = angle; }
    }
    return bestAngle;
  }

  function addProjectile(kind, angle, speed, damage, options = {}) {
    const projectileTalentMult = !options.spell && player.talents.ballistics ? 1.22 : 1;
    const multiplier = player.damageMult * (options.spell ? player.spellDamageMult : player.weaponDamageMult) * projectileTalentMult;
    const x = player.x + Math.cos(angle) * 20;
    const y = player.y + Math.sin(angle) * 20;
    const life = options.life || 2.15;
    const lobbed = Boolean(options.lobbed);
    const vx = lobbed ? ((options.targetX ?? x) - x) / life : Math.cos(angle) * speed;
    const vy = lobbed ? ((options.targetY ?? y) - y) / life : Math.sin(angle) * speed;
    state.projectiles.push({
      kind, x, y, vx, vy, angle, r: options.r || 5, damage: damage * multiplier, life, maxLife: life, age: 0,
      pierce: options.pierce || 1, splash: options.splash || 0, hits: new Set(), spin: 0,
      spinSpeed: options.spinSpeed ?? (kind === "shuriken" ? 18 : kind === "chopper" ? 12 : 7), damageActive: true,
      lobbed, arcHeight: options.arcHeight || 0, visualHeight: 0,
      returns: Boolean(options.returns), returnStarted: false, speed,
      returnPierce: options.returnPierce ?? options.pierce ?? 1,
      returnDamageMult: options.returnDamageMult ?? 1,
      returnDamagePending: false,
      knockback: options.knockback || 0, bossMult: options.bossMult || 1,
      fieldRadius: options.fieldRadius || 0, fieldDuration: options.fieldDuration || 0,
      fieldDamage: options.fieldDamage || 0, slowFactor: options.slowFactor || 1,
      element: options.element || null, evolved: options.evolved || false,
      milestoneAftershock: Boolean(options.milestoneAftershock), milestoneField: Boolean(options.milestoneField),
      exposeDuration: options.exposeDuration || 0,
      critChance: !options.spell && player.talents.deadeye ? .18 : 0,
    });
  }

  function addWeaponFlash(angle, variant, color) {
    state.effects.push({ type: "weaponFlash", variant, color, x: player.x + Math.cos(angle) * 19, y: player.y + Math.sin(angle) * 19, angle, life: .14, max: .14, radius: 28 });
  }

  function areaDamage(x, y, radius, damage, scaled = false, source = {}) {
    const radiusSq = radius * radius;
    const actualDamage = scaled ? damage : damage * player.damageMult;
    const nearbyEnemies = acquireEnemyQuery(x, y, radius + MAX_ENEMY_RADIUS);
    for (const enemy of nearbyEnemies) {
      if (enemyById.get(enemy.id) !== enemy) continue;
      const priorityMult = (enemy.type === "boss" || enemy.type === "elite") ? (source.priorityMult || 1) : 1;
      if (distanceSqTo(enemy, x, y) <= (radius + enemy.r) * (radius + enemy.r)) hurtEnemy(enemy, actualDamage * priorityMult, x, y, source);
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const prop of [...state.breakables]) {
      if (distanceSqTo(prop, x, y) <= radiusSq) breakProp(prop);
    }
    burst(x, y, source.color || "#f1a841", 16, 180);
    state.shake = Math.max(state.shake, .22);
  }

  function reduceSpellCooldowns(amount, exceptId = null) {
    for (const id of ["lightning", "fireball", "frostNova"]) {
      if (id === exceptId || player.weaponClocks[id] == null) continue;
      player.weaponClocks[id] = Math.max(0, player.weaponClocks[id] - amount);
    }
  }

  function recordSpellCast(id) {
    if (player.talents.elementCycle && player.lastSpell && player.lastSpell !== id) reduceSpellCooldowns(.2, id);
    player.lastSpell = id;
  }

  function onElementReaction() {
    if (player.talents.arcaneFlow && state.time - player.lastFlowAt >= .6) {
      player.lastFlowAt = state.time;
      reduceSpellCooldowns(.2);
    }
  }

  function reactionDamageMult() {
    return player.talents.reactionMaster ? 1.5 : 1;
  }

  function damageEnemiesInRadius(x, y, radius, damage, source = {}) {
    const nearbyEnemies = acquireEnemyQuery(x, y, radius + MAX_ENEMY_RADIUS);
    for (const target of nearbyEnemies) {
      if (enemyById.get(target.id) !== target) continue;
      const rr = radius + target.r;
      if (distanceSqTo(target, x, y) <= rr * rr) hurtEnemy(target, damage, target.x, target.y, source);
    }
    releaseEnemyQuery(nearbyEnemies);
  }

  function reactionBurst(enemy, type, label, color, radius, damage) {
    const x = enemy.x, y = enemy.y;
    damageEnemiesInRadius(x, y, radius, damage, { reaction: true });
    state.effects.push({ type: "reaction", variant: type, x, y, radius, life: .38, max: .38 });
    addText(x, y - 28, label, .8, color);
    burst(x, y, color, 18, 200);
    state.shake = Math.max(state.shake, .24);
    onElementReaction();
  }

  function triggerShatter(enemy) {
    if (enemyById.get(enemy.id) !== enemy) return;
    enemy.freezeUntil = 0;
    enemy.freezeToken = 0;
    const talentMult = player.talents.deepFreeze ? 1.35 : 1;
    const damage = (12 + player.level * 1.15) * player.damageMult * player.spellDamageMult * reactionDamageMult() * talentMult;
    reactionBurst(enemy, "shatter", "碎冰", "#c9f8ff", 54 * player.areaMult, damage);
  }

  function triggerOverload(enemy) {
    if (enemyById.get(enemy.id) !== enemy) return;
    enemy.burnUntil = 0;
    enemy.shockUntil = 0;
    const damage = (15 + player.level * 1.25) * player.damageMult * player.spellDamageMult * reactionDamageMult();
    reactionBurst(enemy, "overload", "超载", "#ffd36a", 62 * player.areaMult, damage);
  }

  function chainShock(enemy, damage, source) {
    if (source.chained || state.time - (enemy.lastShockChainAt ?? -Infinity) < .85) return;
    enemy.lastShockChainAt = state.time;
    const bonus = (player.talents.conductive ? 1 : 0) + (player.evolutions.lightning ? 1 : 0);
    const count = 1 + bonus;
    chainTargets.length = 0;
    chainDistances.length = 0;
    const nearbyEnemies = acquireEnemyQuery(enemy.x, enemy.y, 180 + MAX_ENEMY_RADIUS);
    for (const target of nearbyEnemies) {
      if (target === enemy || enemyById.get(target.id) !== target) continue;
      const targetDistance = distanceSq(target, enemy);
      if (targetDistance >= 180 * 180) continue;
      const currentCount = chainTargets.length;
      let insertAt = currentCount;
      while (insertAt > 0 && chainDistances[insertAt - 1] > targetDistance) insertAt -= 1;
      if (insertAt >= count) continue;
      const nextCount = Math.min(count, currentCount + 1);
      for (let i = nextCount - 1; i > insertAt; i--) {
        chainTargets[i] = chainTargets[i - 1];
        chainDistances[i] = chainDistances[i - 1];
      }
      chainTargets[insertAt] = target;
      chainDistances[insertAt] = targetDistance;
      chainTargets.length = nextCount;
      chainDistances.length = nextCount;
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const target of chainTargets) {
      if (enemyById.get(target.id) === target) hurtEnemy(target, damage * .38, target.x, target.y, { element: "lightning", chained: true });
    }
  }

  function applyElementState(enemy, damage, source) {
    if (enemyById.get(enemy.id) !== enemy) return;
    if (source.element === "fire") {
      if ((enemy.shockUntil ?? 0) > state.time) {
        triggerOverload(enemy);
        return;
      }
      const talentMult = player.talents.kindling ? 1.4 : 1;
      if ((enemy.burnUntil ?? 0) <= state.time) enemy.burnDamage = 0;
      enemy.burnUntil = Math.max(enemy.burnUntil ?? 0, state.time + 2.7 * talentMult);
      enemy.burnDamage = Math.max(enemy.burnDamage ?? 0, damage * .13 * talentMult);
      enemy.burnTickAt = Math.min(enemy.burnTickAt ?? Infinity, state.time + .45);
    } else if (source.element === "lightning") {
      const alreadyShocked = (enemy.shockUntil ?? 0) > state.time;
      if ((enemy.burnUntil ?? 0) > state.time) {
        triggerOverload(enemy);
        return;
      }
      enemy.shockUntil = Math.max(enemy.shockUntil ?? 0, state.time + (player.talents.conductive ? 4 : 2.8));
      if (alreadyShocked || player.evolutions.lightning || source.forceChain) chainShock(enemy, damage, source);
    } else if (source.element === "frost") {
      const resistant = enemy.type === "boss" || enemy.type === "elite";
      let duration = source.freezeDuration ?? 1.25;
      if (player.talents.deepFreeze) duration *= 1.35;
      if (resistant) duration *= .55;
      enemy.freezeUntil = Math.max(enemy.freezeUntil ?? 0, state.time + duration);
      enemy.freezeToken = source.freezeToken ?? 0;
    }
  }

  function fireWeapon(id, level) {
    const target = nearestEnemy();
    if (!target && id !== "shuriken" && id !== "thorn") return false;
    const targetAim = target ? Math.atan2(target.y - player.y, target.x - player.x) : (player.facing < 0 ? Math.PI : 0);
    const aim = targetAim;
    const movementAim = Math.atan2(player.aimY, player.aimX);

    if (id === "blade") {
      const evolved = player.evolutions.blade;
      const radius = (55 + level * 8) * player.areaMult * (evolved ? 1.10 : 1);
      const directions = 1 + Math.floor(level / 2) + (player.talents.emberEdge ? 1 : 0);
      if (!hasBladeTarget(radius, directions)) return false;
      const swingId = nextStatusId++;
      for (let i = 0; i < directions; i++) {
        const angle = bladeDirections[i % bladeDirections.length];
        state.effects.push({ type: "slash", x: player.x, y: player.y, angle, life: .22, max: .22, radius, visualRadius: radius - (i % 2) * 7, width: TAU / 3, damage: (21 + level * 7) * (player.talents.emberEdge ? 1.25 : 1) * (evolved ? 1.25 : 1), hits: new Set(), swingId, element: evolved ? "fire" : null });
      }
      tone(235, .045, "triangle", .018);
    } else if (id === "bow") {
      const evolved = player.evolutions.bow;
      const count = 1 + (level >= 4 ? 1 : 0) + (level >= 6 ? 1 : 0) + (player.talents.splitVolley ? 1 : 0) + (evolved ? 2 : 0);
      const pierce = evolved ? 12 : 1 + (level >= 2 ? 1 : 0) + (level >= 6 ? 2 : 0) + (player.talents.splitVolley ? 1 : 0);
      for (let i = 0; i < count; i++) addProjectile("arrow", aim + (i - (count - 1) / 2) * (evolved ? .11 : .08), 670, 17 + level * 5, { r: 4, pierce, life: 1.8 });
      reserveEnemyDamage(target, estimatedShotDamage(17 + level * 5) * Math.min(2, count), .65);
      addWeaponFlash(aim, "bow", "#e8d39a");
      tone(330, .035, "triangle", .014);
    } else if (id === "shuriken") {
      const evolved = player.evolutions.shuriken;
      const radial = evolved || level >= 6;
      const count = (radial ? 8 : 2) + (level >= 2 ? 2 : 0) + (level >= 4 ? 2 : 0) + (evolved ? 2 : 0);
      const pierce = evolved ? 8 : 1 + (level >= 4 ? 2 : 0) + (level >= 6 ? 2 : 0);
      for (let i = 0; i < count; i++) addProjectile("shuriken", radial ? i * TAU / count : aim + (i - (count - 1) / 2) * .16, 520, 11 + level * 4, { r: 6, pierce, life: 1.65 });
      reserveEnemyDamage(target, estimatedShotDamage(11 + level * 4) * (radial ? .5 : Math.min(2, count)), .55);
      addWeaponFlash(aim, "throw", "#d8dde0");
      tone(410, .035, "square", .012);
    } else if (id === "lightning") {
      const evolved = player.evolutions.lightning;
      const desiredCount = 1 + (level >= 2 ? 1 : 0) + (level >= 6 ? 1 : 0) + (evolved ? 1 : 0);
      lightningTargets.length = 0;
      for (let slot = 0; slot < desiredCount; slot++) {
        let bestTarget = null, bestScore = -Infinity;
        for (const enemy of state.enemies) {
          const distance = distanceSq(player, enemy);
          if (distance >= player.vision * player.vision || lightningTargets.includes(enemy)) continue;
          const priority = enemy.type === "boss" ? 5 : enemy.type === "elite" ? 2.5 : 1;
          const score = priority - distance / (player.vision * player.vision) - (isEnemyDamageReserved(enemy) ? 3 : 0);
          if (score > bestScore) { bestTarget = enemy; bestScore = score; }
        }
        if (bestTarget) lightningTargets.push(bestTarget);
      }
      const count = lightningTargets.length;
      for (let i = 0; i < count; i++) {
        const enemy = lightningTargets[i];
        const duration = 1.7 + level * .15;
        state.effects.push({ type: "lightningField", x: enemy.x, y: enemy.y, life: duration, max: duration, radius: (42 + level * 5) * player.areaMult * (level >= 4 ? 1.2 : 1) * (evolved ? 1.25 : 1), damage: 5 + level * 2, tick: 0, evolved, forceChain: level >= 6 });
        reserveEnemyDamage(enemy, estimatedShotDamage(5 + level * 2, true), .45);
      }
      recordSpellCast(id);
      tone(760, .07, "sawtooth", .02);
    } else if (id === "bomb") {
      const splash = (64 + level * 7) * player.areaMult;
      const bombTarget = densestEnemyTarget(player.vision, splash * 1.15) || target;
      const bombAim = Math.atan2(bombTarget.y - player.y, bombTarget.x - player.x);
      const distance = Math.hypot(bombTarget.x - player.x, bombTarget.y - player.y);
      const throwDistance = Math.min(distance, 250 + level * 8);
      const bombSpeed = level >= 2 ? 420 : 360;
      const bombCount = level >= 6 ? 2 : 1;
      for (let i = 0; i < bombCount; i++) {
        const castAim = bombAim + (i - (bombCount - 1) / 2) * .18;
        const targetX = player.x + Math.cos(castAim) * throwDistance;
        const targetY = player.y + Math.sin(castAim) * throwDistance;
        addProjectile("bomb", castAim, bombSpeed, 45 + level * 10, { r: 9, pierce: 999, splash, life: clamp(throwDistance / bombSpeed, .28, .82), evolved: Boolean(player.evolutions.bomb), milestoneAftershock: level >= 4, lobbed: true, targetX, targetY, arcHeight: 38, spinSpeed: 9 });
      }
      reserveEnemyDamage(bombTarget, estimatedShotDamage(45 + level * 10) * bombCount, .85);
      addWeaponFlash(bombAim, "throw", "#e0a84f");
      tone(165, .05, "square", .014);
    } else if (id === "fireball") {
      const fireTarget = densestEnemyTarget(player.vision, (56 + level * 8) * player.areaMult) || target;
      const fireAim = Math.atan2(fireTarget.y - player.y, fireTarget.x - player.x);
      const distance = Math.hypot(fireTarget.x - player.x, fireTarget.y - player.y);
      const fireSpeed = level >= 2 ? 480 : 420;
      const fireCount = level >= 6 ? 2 : 1;
      for (let i = 0; i < fireCount; i++) {
        const castAim = fireAim + (i - (fireCount - 1) / 2) * .14;
        addProjectile("fireball", castAim, fireSpeed, 24 + level * 9, { r: 8, pierce: 999, splash: (56 + level * 8) * player.areaMult, life: clamp(distance / fireSpeed, .3, 1.25), spell: true, element: "fire", evolved: Boolean(player.evolutions.fireball), milestoneField: level >= 4 });
      }
      reserveEnemyDamage(fireTarget, estimatedShotDamage(24 + level * 9, true) * fireCount, 1);
      addWeaponFlash(aim, "spell", "#ffad45");
      recordSpellCast(id);
      tone(290, .07, "sawtooth", .016);
    } else if (id === "chopper") {
      const evolved = Boolean(player.evolutions.chopper);
      const count = 1 + (level >= 4 ? 1 : 0) + (level >= 6 ? 1 : 0) + (evolved ? 1 : 0);
      const chopperAim = bestLineAim(aim, player.vision, 28 + level * 3);
      const pierce = 2 + (level >= 2 ? 2 : 0) + (level >= 6 ? 3 : 0);
      const returnDamageMult = evolved ? 1.15 : level >= 6 ? 1 : level >= 2 ? .7 : .5;
      for (let i = 0; i < count; i++) addProjectile("chopper", chopperAim + (i - (count - 1) / 2) * .14, 400, 26 + level * 9, { r: 10, pierce, returnPierce: evolved ? 14 : pierce, returnDamageMult, life: evolved ? 2.45 : 2.1, returns: true });
      reserveEnemyDamage(target, estimatedShotDamage(26 + level * 9) * Math.min(2, count), .8);
      addWeaponFlash(chopperAim, "throw", "#d7d1bd");
      tone(190, .05, "sawtooth", .013);
    } else if (id === "thorn") {
      if (state.effects.some((effect) => effect.type === "thornBurst")) return false;
      const evolved = Boolean(player.evolutions.thorn);
      const duration = (1.05 + level * .07) * (evolved ? 1.3 : 1);
      state.effects.push({
        type: "thornBurst", x: player.x, y: player.y, angle: movementAim, level,
        radius: (92 + level * 10) * player.areaMult * (evolved ? 1.18 : 1), count: 2 + (level >= 4 ? 1 : 0) + (level >= 6 ? 1 : 0) + (evolved ? 1 : 0),
        damage: (7 + level * 3.5) * (evolved ? 1.25 : 1), knockback: 18 + level * 4 + (level >= 2 ? 12 : 0) + (evolved ? 14 : 0), evolved,
        life: duration, max: duration, hitTimes: new Map(), propHitTimes: new Map(),
      });
      tone(260, .09, "sawtooth", .018);
    } else if (id === "frostMine") {
      const offset = 20;
      const evolved = Boolean(player.evolutions.frostMine);
      const mineCount = 1 + (level >= 4 ? 1 : 0) + (evolved ? 1 : 0);
      for (let i = 0; i < mineCount; i++) {
        const side = (i - (mineCount - 1) / 2) * 30;
        state.effects.push({ type: "frostMine", x: player.x - player.aimX * offset - player.aimY * side, y: player.y - player.aimY * offset + player.aimX * side, life: 16, max: 16, arm: .45 + i * .08, radius: (48 + level * 6) * player.areaMult * (evolved ? 1.22 : 1), damage: (24 + level * 8) * (evolved ? 1.25 : 1), slowFactor: Math.max(.32, .75 - level * .045 - (level >= 2 ? .12 : 0)), slowDuration: 1.2 + level * .16, chain: level >= 6 || evolved });
      }
      tone(210, .05, "triangle", .012);
    } else if (id === "crossbow") {
      const strongTarget = strongestEnemy();
      if (!strongTarget) return false;
      const strongAim = Math.atan2(strongTarget.y - player.y, strongTarget.x - player.x);
      const evolved = player.evolutions.crossbow;
      const boltCount = level >= 6 ? 2 : 1;
      const pierce = 1 + (level >= 2 ? 1 : 0) + (level >= 6 ? 2 : 0);
      for (let i = 0; i < boltCount; i++) addProjectile("bolt", strongAim + (i - (boltCount - 1) / 2) * .09, 560, 43 + level * 13, { r: 6, pierce, life: 2, knockback: 22 + level * 4 + (evolved ? 12 : 0), bossMult: evolved ? 1.65 : 1.3, exposeDuration: level >= 4 ? 3.5 : 0 });
      reserveEnemyDamage(strongTarget, estimatedShotDamage(43 + level * 13) * boltCount * (strongTarget.type === "boss" || strongTarget.type === "elite" ? (evolved ? 1.65 : 1.3) : 1), .9);
      addWeaponFlash(strongAim, "crossbow", "#f2d397");
      tone(135, .08, "square", .02);
    } else if (id === "poisonPot") {
      const evolved = Boolean(player.evolutions.poisonPot);
      const poisonTarget = densestEnemyTarget(player.vision, (56 + level * 6) * player.areaMult) || target;
      const poisonAim = Math.atan2(poisonTarget.y - player.y, poisonTarget.x - player.x);
      const distance = Math.hypot(poisonTarget.x - player.x, poisonTarget.y - player.y);
      const potCount = 1 + (level >= 6 ? 1 : 0) + (evolved ? 1 : 0);
      for (let i = 0; i < potCount; i++) {
        const castAim = poisonAim + (i - (potCount - 1) / 2) * .18;
        const targetX = player.x + Math.cos(castAim) * distance, targetY = player.y + Math.sin(castAim) * distance;
        addProjectile("poisonPot", castAim, 300, 0, { r: 8, pierce: 999, life: clamp(distance / 300, .4, 1.6), fieldRadius: (56 + level * 6) * player.areaMult * (level >= 4 ? 1.18 : 1) * (evolved ? 1.25 : 1), fieldDuration: (3.6 + level * .3 + (level >= 4 ? 1.2 : 0)) * (evolved ? 1.25 : 1), fieldDamage: (4 + level * 3) * (evolved ? 1.25 : 1), slowFactor: Math.max(.5, .88 - level * .035 - (level >= 2 ? .12 : 0)), evolved, lobbed: true, targetX, targetY, arcHeight: 52, spinSpeed: 6 });
      }
      addWeaponFlash(aim, "throw", "#a8d96f");
      tone(175, .06, "triangle", .014);
    } else if (id === "frostNova") {
      const radius = (68 + level * 8) * player.areaMult * (level >= 4 ? 1.2 : 1);
      if (distanceSq(player, target) > (radius + target.r) * (radius + target.r)) return false;
      state.effects.push({ type: "frostNova", x: player.x, y: player.y, life: .34, max: .34, radius, damage: 12 + level * 5, slowFactor: Math.max(.2, .62 - level * .045 - (level >= 2 ? .1 : 0)), slowDuration: 1.1 + level * .16 + (level >= 2 ? .35 : 0), applied: false, secondWave: level >= 6, evolved: Boolean(player.evolutions.frostNova) });
      recordSpellCast(id);
      tone(520, .11, "sine", .025);
    }
    return true;
  }

  function thornBurstPositions(effect) {
    while (thornBlades.length < effect.count) thornBlades.push({ x: 0, y: 0, angle: 0 });
    thornBlades.length = effect.count;
    const elapsed = effect.max - effect.life;
    const orbitAngle = effect.angle + elapsed * (4.8 + effect.level * .28);
    for (let index = 0; index < effect.count; index++) {
      const blade = thornBlades[index];
      blade.angle = orbitAngle + index * TAU / effect.count;
      blade.x = effect.x + Math.cos(blade.angle) * effect.radius;
      blade.y = effect.y + Math.sin(blade.angle) * effect.radius;
    }
    return thornBlades;
  }

  function updateThornBurst(effect) {
    effect.x = player.x;
    effect.y = player.y;
    const damage = effect.damage * player.damageMult * player.weaponDamageMult;
    const hitInterval = Math.max(.34, .48 - effect.level * .02);
    for (const blade of thornBurstPositions(effect)) {
      const nearbyEnemies = acquireEnemyQuery(blade.x, blade.y, 12 + MAX_ENEMY_RADIUS);
      for (const enemy of nearbyEnemies) {
        if (enemyById.get(enemy.id) !== enemy) continue;
        const rr = enemy.r + 12;
        if (distanceSq(enemy, blade) > rr * rr) continue;
        if (state.time - (effect.hitTimes.get(enemy.id) ?? -Infinity) < hitInterval) continue;
        effect.hitTimes.set(enemy.id, state.time);
        hurtEnemy(enemy, damage, blade.x, blade.y);
        if (enemyById.get(enemy.id) !== enemy) continue;
        const dx = enemy.x - player.x, dy = enemy.y - player.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const resistance = enemy.type === "boss" ? .18 : enemy.type === "elite" ? .45 : 1;
        enemy.x += dx / distance * effect.knockback * resistance;
        enemy.y += dy / distance * effect.knockback * resistance;
      }
      releaseEnemyQuery(nearbyEnemies);
      for (const prop of [...state.breakables]) {
        const rr = prop.r + 12;
        if (distanceSq(prop, blade) > rr * rr) continue;
        if (state.time - (effect.propHitTimes.get(prop.id) ?? -Infinity) < hitInterval) continue;
        effect.propHitTimes.set(prop.id, state.time);
        prop.hp -= damage;
        prop.hitFlash = .1;
        if (prop.hp <= 0) breakProp(prop);
      }
    }
  }

  function updateWeapons(dt) {
    const lowHealthFury = player.talents.battleFever && player.hp / player.maxHp < .4 ? .75 : 1;
    const huntHaste = player.hasteUntil > state.time ? .85 : 1;
    for (const [id, level] of Object.entries(player.weapons)) {
      player.weaponClocks[id] = (player.weaponClocks[id] || 0) - dt;
      if (player.weaponClocks[id] > 0) continue;
      if (fireWeapon(id, level)) {
        const cooldown = weaponCooldowns[id] * player.cooldownMult * lowHealthFury * huntHaste * Math.max(.68, 1 - (level - 1) * .025);
        player.weaponClocks[id] = id === "thorn" ? Math.max(2.2, cooldown) : cooldown;
      }
      else player.weaponClocks[id] = .15;
    }
  }

  function hurtEnemy(enemy, damage, hitX = enemy.x, hitY = enemy.y, source = {}) {
    if (enemyById.get(enemy.id) !== enemy) return false;
    if (!source.reaction && source.element !== "frost" && (enemy.freezeUntil ?? 0) > state.time) {
      triggerShatter(enemy);
      if (enemyById.get(enemy.id) !== enemy) return false;
    }
    if ((enemy.vulnerableUntil ?? 0) > state.time) damage *= 1.15;
    enemy.hp -= damage;
    enemy.hitFlash = 0.1;
    addText(hitX, hitY - 10, Math.round(damage), .55, source.critical ? "#fff2a1" : "#ffe49a");
    if (source.critical) addText(hitX, hitY - 24, "暴击", .65, "#ffd36a");
    for (let i = 0; i < 3; i++) particle(hitX, hitY, enemy.color, rand(50, 150));
    if (enemy.hp <= 0) {
      killEnemy(enemy);
      return false;
    }
    if (source.exposeDuration) enemy.vulnerableUntil = Math.max(enemy.vulnerableUntil ?? 0, state.time + source.exposeDuration);
    if (source.element && !source.reaction) applyElementState(enemy, damage, source);
    return enemyById.get(enemy.id) === enemy;
  }

  function killEnemy(enemy) {
    const index = state.enemies.indexOf(enemy);
    if (index === -1) return;
    state.enemies.splice(index, 1);
    enemyById.delete(enemy.id);
    state.kills += 1;
    if (player.talents.warReaver) player.hp = Math.min(player.maxHp, player.hp + .35);
    if (player.talents.huntTempo) player.hasteUntil = state.time + 3;
    burst(enemy.x, enemy.y, enemy.color, enemy.type === "boss" ? 44 : 10, enemy.type === "boss" ? 270 : 130);
    const gemCount = enemy.type === "boss" ? 15 : enemy.type === "elite" ? 4 : 1;
    for (let i = 0; i < gemCount; i++) {
      addPickup({
        type: "xp", x: enemy.x + rand(-14, 14), y: enemy.y + rand(-14, 14),
        value: enemy.xp * player.xpMult / gemCount, r: enemy.type === "elite" ? 7 : 5, life: 40,
      });
    }
    if (Math.random() < 0.12 || enemy.type === "elite" || enemy.type === "boss") {
      addPickup({ type: "coin", x: enemy.x, y: enemy.y, value: Math.ceil((enemy.type === "elite" ? 3 : enemy.type === "boss" ? 30 : 1) * player.goldMult), r: 7, life: 35 });
    }
    if (enemy.type === "slime") {
      for (let i = 0; i < 2; i++) spawnEnemy("snake");
    }
    if ((enemy.poisonMarkedUntil ?? 0) > state.time && enemy.poisonSpreadDamage > 0) {
      state.effects.push({ type: "poisonField", x: enemy.x, y: enemy.y, life: 2.2, max: 2.2, radius: enemy.poisonSpreadRadius || 42, damage: enemy.poisonSpreadDamage, slowFactor: .62, priorityMult: 1, tick: 0, evolved: false });
    }
    if (enemy.type === "boss") {
      state.boss = null;
      state.bossSpawned = false;
      state.nextBossAt = state.time + 120;
      state.coins += Math.ceil(20 * player.goldMult);
      state.freeRerolls += 1;
      addText(enemy.x, enemy.y - 55, "守望者已倒下", 1.2, "#ffd36a");
      addText(enemy.x, enemy.y - 76, "免费重抽 +1", 1.2, "#fff0a8");
    } else tone(120, 0.03, "square", 0.012);
  }

  function hurtPlayer(damage, sourceX, sourceY) {
    if (player.invulnerable > 0 || state.mode !== "running") return;
    const rawDamage = damage;
    damage = Math.max(1, rawDamage * .2, rawDamage - player.armor);
    player.lastDamageAt = state.time;
    if (player.talents.undying && player.hp - damage <= 0 && state.time >= player.lastStandReadyAt) {
      player.hp = 1;
      player.invulnerable = 2;
      player.lastStandReadyAt = state.time + 45;
      addText(player.x, player.y - 38, "不灭余烬", 1.1, "#ffd36a");
      burst(player.x, player.y, "#ef9d36", 26, 210);
    } else {
      player.hp -= damage;
      player.invulnerable = 0.85;
    }
    state.shake = 0.55;
    state.flash = 0.32;
    const angle = Math.atan2(player.y - sourceY, player.x - sourceX);
    player.x += Math.cos(angle) * 26;
    player.y += Math.sin(angle) * 26;
    addText(player.x, player.y - 25, `-${Math.round(damage)}`, .75, "#ff756d");
    if (player.talents.counterFlame && state.time >= player.counterReadyAt) {
      player.counterReadyAt = state.time + 3;
      state.effects.push({ type: "counterFlame", x: player.x, y: player.y, radius: 72 * player.areaMult, damage: (26 + player.level * 1.4) * player.damageMult * player.weaponDamageMult, life: .28, max: .28, applied: false });
    }
    tone(105, 0.12, "sawtooth", 0.05);
    if (player.hp <= 0) finishGame(false);
  }

  function reviveCost() {
    return REVIVE_BASE_COST + Math.floor(state.time / 90) * 10 + Math.floor(player.level / 5) * 8;
  }

  function updateReviveButton(victory = false) {
    if (!ui.revive) return;
    const available = !victory && !state.reviveUsed;
    ui.revive.classList.toggle("hidden", !available);
    if (!available) return;
    const cost = reviveCost();
    ui.revive.textContent = `金币复活 · ● ${cost}`;
    ui.revive.disabled = profile.coins < cost;
    ui.revive.title = ui.revive.disabled ? `还需要 ${cost - profile.coins} 枚远征金币` : "支付金币后原地复活，恢复 45% 生命并获得 3 秒无敌";
  }

  function reviveGame() {
    if (state.mode !== "ended" || state.reviveUsed) return;
    const cost = reviveCost();
    if (profile.coins < cost) return;
    profile.coins -= cost;
    saveProfile();
    state.reviveUsed = true;
    state.mode = "running";
    player.hp = player.maxHp * .45;
    player.invulnerable = 3;
    player.lastDamageAt = state.time;
    state.enemyShots.length = 0;
    state.projectiles.length = 0;
    for (const enemy of state.enemies) {
      const distance = Math.sqrt(distanceSq(player, enemy));
      if (distance >= 220) continue;
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const pushDistance = 245 + enemy.r;
      enemy.x = player.x + Math.cos(angle) * pushDistance;
      enemy.y = player.y + Math.sin(angle) * pushDistance;
      enemy.attackClock = Math.max(enemy.attackClock || 0, 1.1);
    }
    state.flash = .2;
    state.shake = .25;
    ui.hud.classList.remove("hidden");
    if (matchMedia("(pointer: coarse)").matches) ui.touch.classList.remove("hidden");
    showScreen(null);
    state.last = performance.now();
    updateHud();
    addText(player.x, player.y - 34, "金币复活", 1.1, "#ffe49a");
    burst(player.x, player.y, "#f0c766", 32, 220);
  }

  function finishGame(victory) {
    state.mode = "ended";
    ui.touch.classList.add("hidden");
    ui.bossWrap.classList.add("hidden");
    document.querySelector("#end-kicker").textContent = victory ? "守望者已陨落" : "余烬熄灭";
    document.querySelector("#end-title").textContent = victory ? "荒原记住了你的名字" : "你倒在了荒原";
    document.querySelector("#result-time").textContent = formatTime(state.time);
    document.querySelector("#result-level").textContent = player.level;
    document.querySelector("#result-kills").textContent = state.kills;
    document.querySelector("#result-coins").textContent = state.coins;
    const carriedCoins = Math.max(0, Math.floor(state.coins));
    const newlyBankedCoins = Math.max(0, carriedCoins - state.bankedRunCoins);
    profile.coins += newlyBankedCoins;
    state.bankedRunCoins = Math.max(state.bankedRunCoins, carriedCoins);
    saveProfile();
    const best = readRecord("emberlands-best");
    const bestLevel = readRecord("emberlands-level");
    if (state.time > best) writeRecord("emberlands-best", Math.floor(state.time));
    if (player.level > bestLevel) writeRecord("emberlands-level", player.level);
    updateReviveButton(victory);
    showScreen(ui.end);
    tone(victory ? 420 : 90, 0.5, victory ? "sine" : "sawtooth", 0.06);
  }

  function update(dt) {
    state.time += dt;
    state.wave = 1 + Math.floor(state.time / 30);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    const recoveryRate = state.time - player.lastDamageAt >= RECOVERY_DELAY
      ? Math.max(.8, player.maxHp * RECOVERY_MAX_HP_PER_SECOND)
      : 0;
    player.hp = Math.min(player.maxHp, player.hp + (player.regen + recoveryRate) * dt);
    state.shake = Math.max(0, state.shake - dt * 2.6);
    state.flash = Math.max(0, state.flash - dt * 2.4);

    let mx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + touchMove.x;
    let my = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) + touchMove.y;
    const moveLength = Math.hypot(mx, my);
    if (moveLength > 0) {
      mx /= Math.max(1, moveLength); my /= Math.max(1, moveLength);
      const talentMoveMult = player.hasteUntil > state.time ? 1.15 : 1;
      player.x += mx * player.speed * talentMoveMult * dt; player.y += my * player.speed * talentMoveMult * dt;
      player.aimX = mx; player.aimY = my;
      if (Math.abs(mx) > 0.1) player.facing = mx < 0 ? -1 : 1;
      player.trailClock -= dt;
      if (player.trailClock <= 0) {
        player.trailClock = 0.09;
        addParticle(player.x - mx * 12, player.y - my * 12 + 10, -mx * 18 + rand(-8,8), -my * 18 + rand(-8,8), .32, 3, "#aab08d");
      }
    }
    collectTouchedBreakables();

    let phaseStarted = perfStart();
    rebuildEnemyBuckets();
    perfEnd("buckets", phaseStarted);
    phaseStarted = perfStart();
    updateWeapons(dt);
    perfEnd("weapons", phaseStarted);

    state.spawnClock -= dt;
    const earlyEnemyCap = 16 + Math.min(11, state.wave) * 4;
    const maxEnemies = Math.min(180, earlyEnemyCap + Math.max(0, state.wave - 11) * 8);
    if (state.spawnClock <= 0 && state.enemies.length < maxEnemies) {
      const count = 1 + (state.wave >= 12 && Math.random() < .18 ? 1 : 0) + (state.wave >= 16 && Math.random() < .12 ? 1 : 0);
      for (let i = 0; i < count; i++) spawnEnemy();
      const earlyInterval = 1.08 - Math.min(300, state.time) * .0012;
      state.spawnClock = state.time <= 300 ? earlyInterval : Math.max(.24, .72 - (state.time - 300) * .001);
    }
    if (!state.bossSpawned && state.time >= state.nextBossAt) spawnBoss();
    state.propClock -= dt;
    if (state.propClock <= 0) {
      const retentionDistanceSq = 1400 * 1400;
      for (let i = state.breakables.length - 1; i >= 0; i--) {
        if (distanceSq(player, state.breakables[i]) > retentionDistanceSq) state.breakables.splice(i, 1);
      }
      if (state.breakables.length < 18) spawnBreakables(2);
      state.propClock = 14;
    }

    phaseStarted = perfStart();
    updateProjectiles(dt);
    perfEnd("projectiles", phaseStarted);
    phaseStarted = perfStart();
    updateEnemies(dt);
    perfEnd("enemies", phaseStarted);
    phaseStarted = perfStart();
    rebuildEnemyBuckets();
    perfEnd("buckets", phaseStarted);
    phaseStarted = perfStart();
    state.pickupAccumulator += dt;
    while (state.pickupAccumulator >= PICKUP_STEP && state.mode === "running") {
      state.pickupAccumulator -= PICKUP_STEP;
      updatePickups(PICKUP_STEP);
    }
    perfEnd("pickups", phaseStarted);
    phaseStarted = perfStart();
    updateEffects(dt);
    perfEnd("effects", phaseStarted);
    state.hudClock -= dt;
    if (state.hudClock <= 0) {
      state.hudClock = .1;
      updateHud();
    }
  }

  function createPoisonField(shot) {
    if (shot.effectCreated) return;
    shot.effectCreated = true;
    const critical = shot.critChance > 0 && Math.random() < shot.critChance;
    state.effects.push({ type: "poisonField", x: shot.x, y: shot.y, life: shot.fieldDuration, max: shot.fieldDuration, radius: shot.fieldRadius, damage: shot.fieldDamage * (critical ? 2 : 1), slowFactor: shot.slowFactor, priorityMult: player.talents.giantSlayer ? 1.35 : 1, tick: 0, evolved: shot.evolved });
    state.effects.push({ type: "blast", variant: "poison", x: shot.x, y: shot.y, radius: Math.min(46, shot.fieldRadius * .55), life: .28, max: .28 });
    if (critical) addText(shot.x, shot.y - 18, "暴击毒雾", .75, "#d9efaa");
    burst(shot.x, shot.y, "#86b75d", 10, 110);
  }

  function explodePlayerProjectile(shot) {
    if (shot.exploded) return;
    shot.exploded = true;
    const critical = shot.critChance > 0 && Math.random() < shot.critChance;
    const explosionDamage = shot.damage * (critical ? 2 : 1);
    const priorityMult = player.talents.giantSlayer ? 1.35 : 1;
    const blastVariant = shot.kind === "fireball" ? "fire" : "bomb";
    areaDamage(shot.x, shot.y, shot.splash, explosionDamage, true, { ...(shot.element ? { element: shot.element } : {}), critical, priorityMult, color: blastVariant === "fire" ? "#ef6f32" : "#e1a648" });
    state.effects.push({ type: "blast", variant: blastVariant, x: shot.x, y: shot.y, radius: shot.splash, life: .3, max: .3 });
    if (shot.kind === "bomb" && shot.evolved) {
      state.effects.push({ type: "aftershock", x: shot.x, y: shot.y, radius: shot.splash * .82, damage: explosionDamage * .55, priorityMult, life: .42, max: .42, applied: false });
    } else if (shot.kind === "bomb" && shot.milestoneAftershock) {
      state.effects.push({ type: "aftershock", x: shot.x, y: shot.y, radius: shot.splash * .72, damage: explosionDamage * .3, priorityMult, life: .38, max: .38, applied: false });
    } else if (shot.kind === "fireball" && shot.evolved) {
      state.effects.push({ type: "fireField", x: shot.x, y: shot.y, radius: shot.splash * .82, damage: explosionDamage * .12, life: 4.2, max: 4.2, tick: 0 });
    } else if (shot.kind === "fireball" && shot.milestoneField) {
      state.effects.push({ type: "fireField", x: shot.x, y: shot.y, radius: shot.splash * .68, damage: explosionDamage * .07, life: 2.4, max: 2.4, tick: 0 });
    }
  }

  function startProjectileReturn(shot, deferDamage = false) {
    if (shot.returnStarted) return;
    shot.returnStarted = true;
    shot.hits.clear();
    shot.pierce = shot.returnPierce;
    shot.damageActive = !deferDamage;
    shot.returnDamagePending = deferDamage;
  }

  function updateProjectiles(dt) {
    const nearbyEnemies = [];
    const breakableSnapshot = state.breakables.slice();
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const shot = state.projectiles[i];
      if (shot.returnDamagePending) {
        shot.returnDamagePending = false;
        shot.damageActive = true;
      }
      if (shot.returns && !shot.returnStarted && shot.age >= shot.maxLife * .48) startProjectileReturn(shot);
      let returned = false;
      if (shot.returnStarted) {
        const homeX = player.x - shot.x, homeY = player.y - shot.y;
        const homeDistance = Math.max(1, Math.hypot(homeX, homeY));
        shot.vx = homeX / homeDistance * shot.speed;
        shot.vy = homeY / homeDistance * shot.speed;
        shot.angle = Math.atan2(shot.vy, shot.vx);
        returned = homeDistance <= player.r + shot.r + 6;
      }
      const previousX = shot.x, previousY = shot.y;
      const moveDt = Math.min(dt, Math.max(0, shot.life));
      shot.x += shot.vx * moveDt; shot.y += shot.vy * moveDt; shot.life -= dt; shot.age += moveDt; shot.spin += moveDt * shot.spinSpeed;
      const travelProgress = Math.min(1, shot.age / shot.maxLife);
      shot.visualHeight = shot.lobbed ? Math.sin(travelProgress * Math.PI) * shot.arcHeight : 0;
      let removed = shot.life <= 0 || returned;
      if (removed && (shot.kind === "bomb" || shot.kind === "fireball")) explodePlayerProjectile(shot);
      if (removed && shot.kind === "poisonPot") createPoisonField(shot);
      if (!shot.lobbed) {
        const movementDistance = Math.hypot(shot.x - previousX, shot.y - previousY);
        collectNearbyEnemies(shot.x, shot.y, shot.r + MAX_ENEMY_RADIUS + movementDistance, nearbyEnemies);
        for (const enemy of nearbyEnemies) {
          if (removed || !shot.damageActive || enemyById.get(enemy.id) !== enemy || shot.hits.has(enemy.id)) continue;
          const rr = shot.r + enemy.r;
          if (segmentPointDistanceSq(previousX, previousY, shot.x, shot.y, enemy.x, enemy.y) < rr * rr) {
            shot.hits.add(enemy.id);
            if (shot.kind === "bomb" || shot.kind === "fireball") {
              explodePlayerProjectile(shot);
              removed = true;
            } else {
              const isPriorityTarget = enemy.type === "boss" || enemy.type === "elite";
              const critical = shot.critChance > 0 && Math.random() < shot.critChance;
              const returnMult = shot.returnStarted ? shot.returnDamageMult : 1;
              const damage = shot.damage * returnMult * (isPriorityTarget ? shot.bossMult : 1) * (isPriorityTarget && player.talents.giantSlayer ? 1.35 : 1) * (critical ? 2 : 1);
              hurtEnemy(enemy, damage, shot.x, shot.y, { critical, exposeDuration: shot.exposeDuration });
              if (shot.knockback > 0) {
                const length = Math.max(1, Math.hypot(shot.vx, shot.vy));
                const force = shot.knockback * (enemy.type === "boss" ? .18 : enemy.type === "elite" ? .45 : 1);
                enemy.x += shot.vx / length * force; enemy.y += shot.vy / length * force;
              }
              shot.pierce -= 1;
              if (shot.kind === "chopper" && shot.pierce <= 0) {
                if (shot.returnStarted) shot.damageActive = false;
                else startProjectileReturn(shot, true);
              } else removed = shot.pierce <= 0;
            }
          }
        }
        for (const prop of breakableSnapshot) {
          if (removed || !shot.damageActive || !state.breakables.includes(prop) || shot.hits.has(prop.id)) continue;
          const rr = shot.r + prop.r;
          if (segmentPointDistanceSq(previousX, previousY, shot.x, shot.y, prop.x, prop.y) < rr * rr) {
            shot.hits.add(prop.id);
            if (shot.kind === "bomb" || shot.kind === "fireball") {
              explodePlayerProjectile(shot);
              removed = true;
            } else {
              const returnMult = shot.returnStarted ? shot.returnDamageMult : 1;
              prop.hp -= shot.damage * returnMult;
              prop.hitFlash = .1;
              if (prop.hp <= 0) breakProp(prop);
              shot.pierce -= 1;
              if (shot.kind === "chopper" && shot.pierce <= 0) {
                if (shot.returnStarted) shot.damageActive = false;
                else startProjectileReturn(shot, true);
              } else removed = shot.pierce <= 0;
            }
          }
        }
      }
      if (removed) state.projectiles.splice(i, 1);
    }

    for (let i = state.enemyShots.length - 1; i >= 0; i--) {
      const shot = state.enemyShots[i];
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      const rr = shot.r + player.r;
      if (distanceSq(shot, player) < rr * rr) {
        hurtPlayer(shot.damage, shot.x, shot.y);
        state.enemyShots.splice(i, 1);
      } else if (shot.life <= 0) state.enemyShots.splice(i, 1);
    }
  }

  function updateEnemies(dt) {
    enemyUpdateIds.length = 0;
    for (const enemy of state.enemies) enemyUpdateIds.push(enemy.id);
    for (const enemyId of enemyUpdateIds) {
      const enemy = enemyById.get(enemyId);
      if (!enemy) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      if ((enemy.burnUntil ?? 0) > state.time && state.time >= (enemy.burnTickAt ?? 0)) {
        enemy.burnTickAt = state.time + .6;
        hurtEnemy(enemy, enemy.burnDamage || 1, enemy.x, enemy.y, { dot: true });
        if (enemyById.get(enemy.id) !== enemy) continue;
      }
      enemy.attackClock -= dt;
      const dx = player.x - enemy.x, dy = player.y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const frozen = (enemy.freezeUntil ?? 0) > state.time;
      const freezeMult = frozen ? (enemy.type === "boss" || enemy.type === "elite" ? .42 : 0) : 1;
      const moveSpeed = enemy.speed * freezeMult * ((enemy.slowUntil ?? 0) > state.time ? (enemy.slowFactor ?? 1) : 1);

      if (enemy.type === "octopus" && d < 450) {
        if (enemy.attackClock <= 0) {
          enemy.attackClock = 2.2;
          state.enemyShots.push({ x: enemy.x, y: enemy.y, vx: dx / d * 190, vy: dy / d * 190, r: 7, damage: enemy.damage, life: 3.2 });
          tone(145, 0.05, "sine", 0.012);
        }
        if (d < 230) { enemy.x -= dx / d * moveSpeed * .45 * dt; enemy.y -= dy / d * moveSpeed * .45 * dt; }
        else if (d > 320) { enemy.x += dx / d * moveSpeed * dt; enemy.y += dy / d * moveSpeed * dt; }
      } else if (enemy.type === "boss") {
        if (enemy.attackClock <= 0 && d < 620) {
          enemy.attackClock = Math.max(1.4, 2.5 - state.bossCount * .12);
          for (let i = 0; i < 7; i++) {
            const angle = i * TAU / 7 + state.time * .2;
            state.enemyShots.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 155, vy: Math.sin(angle) * 155, r: 8, damage: enemy.damage * .62, life: 4 });
          }
          tone(88, .1, "sawtooth", .024);
        }
        enemy.x += dx / d * moveSpeed * dt;
        enemy.y += dy / d * moveSpeed * dt;
      } else {
        enemy.x += dx / d * moveSpeed * dt;
        enemy.y += dy / d * moveSpeed * dt;
      }

      const rr = enemy.r + player.r;
      if (d < rr) hurtPlayer(enemy.damage, enemy.x, enemy.y);

    }
  }

  function updatePickups(dt) {
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const item = state.pickups[i];
      if (item.type !== "xp") item.life -= dt;
      const startX = item.x, startY = item.y;
      const dx = player.x - item.x, dy = player.y - item.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < player.pickupRange) {
        const speed = 170 + (player.pickupRange - d) * 4;
        item.x += dx / d * speed * dt; item.y += dy / d * speed * dt;
      }
      const collectRadius = player.r + item.r + 5;
      const moveX = item.x - startX, moveY = item.y - startY;
      const moveLengthSq = moveX * moveX + moveY * moveY;
      const projection = moveLengthSq > 0 ? clamp(((player.x - startX) * moveX + (player.y - startY) * moveY) / moveLengthSq, 0, 1) : 0;
      const closestX = startX + moveX * projection, closestY = startY + moveY * projection;
      if (distanceSqTo(player, closestX, closestY) < collectRadius * collectRadius) {
        let collectedXp = false;
        let rareEffect = null;
        if (item.type === "xp") {
          player.xp += item.value;
          collectedXp = true;
          tone(560 + Math.random() * 100, 0.025, "sine", 0.01);
        } else if (item.type === "coin") {
          state.coins += item.value;
          tone(760, 0.045, "square", 0.014);
        } else if (item.type === "heart") {
          player.hp = Math.min(player.maxHp, player.hp + item.value);
          addText(player.x, player.y - 24, `+${Math.round(item.value)}`, .65, "#7de18a");
          tone(490, .08, "sine", .018);
        } else if (item.type === "purge") rareEffect = "purge";
        else if (item.type === "vacuum") rareEffect = "vacuum";
        state.pickups.splice(i, 1);
        if (rareEffect === "purge") annihilateCurrentEnemies();
        else if (rareEffect === "vacuum") gatherAllPickups();
        if (collectedXp && player.xp >= player.xpNext && state.mode === "running") levelUp();
        if (state.mode !== "running") return;
      } else if (item.type !== "xp" && item.life <= 0) state.pickups.splice(i, 1);
    }
  }

  function particle(x, y, color, speed = 100) {
    const angle = Math.random() * TAU;
    const life = rand(.2, .55);
    addParticle(x, y, Math.cos(angle) * rand(speed * .3, speed), Math.sin(angle) * rand(speed * .3, speed), life, rand(2,5), color);
  }

  function burst(x, y, color, count, speed) { for (let i = 0; i < count; i++) particle(x, y, color, speed); }

  function tickLightningField(effect) {
    const damage = effect.damage * player.damageMult * player.spellDamageMult;
    const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS);
    for (const enemy of nearbyEnemies) {
      if (enemyById.get(enemy.id) !== enemy) continue;
      const rr = effect.radius + enemy.r;
      if (distanceSq(enemy, effect) > rr * rr) continue;
      if (state.time - (enemy.lastLightningHit ?? -Infinity) < .27) continue;
      enemy.lastLightningHit = state.time;
      hurtEnemy(enemy, damage, enemy.x, enemy.y, { element: "lightning", forceChain: effect.forceChain });
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const prop of [...state.breakables]) {
      const rr = effect.radius + prop.r;
      if (distanceSq(prop, effect) > rr * rr) continue;
      if (state.time - (prop.lastLightningHit ?? -Infinity) < .27) continue;
      prop.lastLightningHit = state.time;
      prop.hp -= damage;
      prop.hitFlash = .1;
      if (prop.hp <= 0) breakProp(prop);
    }
    for (let i = 0; i < 3; i++) particle(effect.x + rand(-effect.radius, effect.radius), effect.y + rand(-effect.radius, effect.radius), "#8edff0", 45);
  }

  function slowEnemy(enemy, factor, duration) {
    if ((enemy.slowUntil ?? 0) > state.time) enemy.slowFactor = Math.min(enemy.slowFactor ?? 1, factor);
    else enemy.slowFactor = factor;
    enemy.slowUntil = Math.max(enemy.slowUntil ?? 0, state.time + duration);
  }

  function detonateFrostMine(effect) {
    if (effect.detonated) return;
    effect.detonated = true;
    const damage = effect.damage * player.damageMult * player.weaponDamageMult;
    const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS);
    for (const enemy of nearbyEnemies) {
      if (enemyById.get(enemy.id) !== enemy) continue;
      const rr = effect.radius + enemy.r;
      if (distanceSq(enemy, effect) > rr * rr) continue;
      hurtEnemy(enemy, damage, enemy.x, enemy.y, { element: "frost", freezeDuration: effect.slowDuration * .7 });
      slowEnemy(enemy, effect.slowFactor, effect.slowDuration);
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const prop of [...state.breakables]) {
      if (distanceSq(prop, effect) > (effect.radius + prop.r) ** 2) continue;
      prop.hp -= damage; prop.hitFlash = .1;
      if (prop.hp <= 0) breakProp(prop);
    }
    burst(effect.x, effect.y, "#9ee7ee", 18, 190);
    state.effects.push({ type: "blast", variant: "frost", x: effect.x, y: effect.y, radius: effect.radius, life: .32, max: .32 });
    state.shake = Math.max(state.shake, .18);
    effect.life = 0;
    if (effect.chain) {
      for (const other of state.effects) {
        if (other === effect || other.type !== "frostMine" || other.detonated) continue;
        const chainRadius = effect.radius + other.radius + 90;
        if (distanceSq(effect, other) <= chainRadius * chainRadius) detonateFrostMine(other);
      }
    }
    tone(390, .09, "triangle", .02);
  }

  function tickPoisonField(effect) {
    const damage = effect.damage * player.damageMult * player.weaponDamageMult;
    const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS);
    for (const enemy of nearbyEnemies) {
      if (enemyById.get(enemy.id) !== enemy) continue;
      const rr = effect.radius + enemy.r;
      if (distanceSq(enemy, effect) > rr * rr) continue;
      if (state.time - (enemy.lastPoisonHit ?? -Infinity) < .45) continue;
      enemy.lastPoisonHit = state.time;
      const priorityMult = (enemy.type === "boss" || enemy.type === "elite") ? (effect.priorityMult || 1) : 1;
      hurtEnemy(enemy, damage * priorityMult, enemy.x, enemy.y);
      if (effect.evolved && enemyById.get(enemy.id) === enemy) {
        enemy.poisonMarkedUntil = state.time + 1;
        enemy.poisonSpreadDamage = damage * .55;
        enemy.poisonSpreadRadius = effect.radius * .48;
      }
      slowEnemy(enemy, effect.slowFactor, .7);
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const prop of [...state.breakables]) {
      if (distanceSq(prop, effect) > (effect.radius + prop.r) ** 2) continue;
      if (state.time - (prop.lastPoisonHit ?? -Infinity) < .45) continue;
      prop.lastPoisonHit = state.time;
      prop.hp -= damage; prop.hitFlash = .1;
      if (prop.hp <= 0) breakProp(prop);
    }
  }

  function tickFrostNova(effect, dt) {
    if (!effect.initialized) {
      effect.initialized = true;
      effect.actualDamage = effect.damage * player.damageMult * player.spellDamageMult;
      effect.freezeToken = nextStatusId++;
      effect.hits = new Set();
      effect.propHits = new Set();
      effect.affectedTargets = [];
      burst(effect.x, effect.y, "#c5f5ff", 22, 210);
    }
    const progress = 1 - Math.max(0, effect.life - dt) / effect.max;
    const currentRadius = effect.radius * (.28 + progress * .72);
    const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, currentRadius + MAX_ENEMY_RADIUS);
    for (const enemy of nearbyEnemies) {
      if (enemyById.get(enemy.id) !== enemy || effect.hits.has(enemy.id)) continue;
      const rr = currentRadius + enemy.r;
      if (distanceSq(enemy, effect) > rr * rr) continue;
      effect.hits.add(enemy.id);
      hurtEnemy(enemy, effect.actualDamage, enemy.x, enemy.y, { element: "frost", freezeDuration: effect.slowDuration, freezeToken: effect.freezeToken });
      if (enemyById.get(enemy.id) === enemy) effect.affectedTargets.push({ id: enemy.id, token: effect.freezeToken, shatterAt: enemy.freezeUntil, done: false });
      const resistant = enemy.type === "boss" || enemy.type === "elite";
      slowEnemy(enemy, resistant ? Math.max(.5, effect.slowFactor) : .08, effect.slowDuration * (resistant ? .65 : 1));
    }
    releaseEnemyQuery(nearbyEnemies);
    for (const prop of [...state.breakables]) {
      if (effect.propHits.has(prop.id) || distanceSq(prop, effect) > (currentRadius + prop.r) ** 2) continue;
      effect.propHits.add(prop.id);
      prop.hp -= effect.actualDamage; prop.hitFlash = .1;
      if (prop.hp <= 0) breakProp(prop);
    }
  }

  function finalizeFrostNova(effect) {
    if (effect.finalized) return;
    effect.finalized = true;
    if (effect.secondWave) {
      damageEnemiesInRadius(effect.x, effect.y, effect.radius * .9, effect.actualDamage * .45, { element: "frost", freezeDuration: effect.slowDuration * .45 });
      burst(effect.x, effect.y, "#d8fbff", 18, 170);
    }
    if (!effect.evolved || !effect.affectedTargets?.length) return;
    const shatterDamage = effect.actualDamage * .75 * (player.talents.deepFreeze ? 1.35 : 1) * reactionDamageMult();
    let maxDelay = .2;
    for (const target of effect.affectedTargets) maxDelay = Math.max(maxDelay, target.shatterAt - state.time);
    state.effects.push({ type: "eternalShatter", x: effect.x, y: effect.y, radius: effect.radius, damage: shatterDamage, targets: effect.affectedTargets, life: maxDelay + .2, max: maxDelay + .2 });
  }

  function updateEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        if (particlePool.length < MAX_PARTICLES) particlePool.push(p);
      }
    }
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const text = state.texts[i]; text.y -= 28 * dt; text.life -= dt;
      if (text.life <= 0) {
        state.texts.splice(i, 1);
        if (textPool.length < MAX_TEXTS) textPool.push(text);
      }
    }
    for (let i = state.effects.length - 1; i >= 0; i--) {
      const effect = state.effects[i];
      if (effect.type === "thornBurst") {
        updateThornBurst(effect);
      } else if (effect.type === "slash") {
        const slashProgress = Math.min(1, (1 - Math.max(0, effect.life - dt) / effect.max) * 1.65);
        const sweepStart = -effect.width / 2;
        const sweepEnd = sweepStart + effect.width * slashProgress;
        const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS);
        for (const enemy of nearbyEnemies) {
          if (enemyById.get(enemy.id) !== enemy) continue;
          if (effect.hits.has(enemy.id)) continue;
          if (enemy.lastBladeSwing === effect.swingId) continue;
          const dx = enemy.x - effect.x, dy = enemy.y - effect.y;
          const rr = effect.radius + enemy.r;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= rr * rr) continue;
          const angle = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(angle - effect.angle), Math.cos(angle - effect.angle));
          if (delta >= sweepStart && delta <= sweepEnd) {
            effect.hits.add(enemy.id);
            enemy.lastBladeSwing = effect.swingId;
            hurtEnemy(enemy, effect.damage * player.damageMult * player.weaponDamageMult, enemy.x, enemy.y, effect.element ? { element: effect.element } : {});
          }
        }
        releaseEnemyQuery(nearbyEnemies);
        for (const prop of [...state.breakables]) {
          if (effect.hits.has(prop.id)) continue;
          if (prop.lastBladeSwing === effect.swingId) continue;
          const dx = prop.x - effect.x, dy = prop.y - effect.y;
          const rr = effect.radius + prop.r;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= rr * rr) continue;
          const angle = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(angle - effect.angle), Math.cos(angle - effect.angle));
          if (delta >= sweepStart && delta <= sweepEnd) {
            effect.hits.add(prop.id);
            prop.lastBladeSwing = effect.swingId;
            prop.hp -= effect.damage * player.damageMult * player.weaponDamageMult;
            prop.hitFlash = .1;
            if (prop.hp <= 0) breakProp(prop);
          }
        }
      } else if (effect.type === "lightningField") {
        effect.tick -= dt;
        if (effect.tick <= 0) {
          effect.tick = .30;
          tickLightningField(effect);
        }
      } else if (effect.type === "frostMine") {
        effect.arm -= dt;
        if (effect.arm <= 0) {
          let triggered = false;
          const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, 22 + MAX_ENEMY_RADIUS);
          for (const enemy of nearbyEnemies) {
            if (enemyById.get(enemy.id) === enemy && distanceSq(enemy, effect) < (enemy.r + 22) ** 2) {
              triggered = true;
              break;
            }
          }
          releaseEnemyQuery(nearbyEnemies);
          if (triggered) detonateFrostMine(effect);
        }
      } else if (effect.type === "poisonField") {
        effect.tick -= dt;
        if (effect.tick <= 0) { effect.tick = .5; tickPoisonField(effect); }
      } else if (effect.type === "fireField") {
        effect.tick -= dt;
        if (effect.tick <= 0) {
          effect.tick = .5;
          const nearbyEnemies = acquireEnemyQuery(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS);
          for (const enemy of nearbyEnemies) {
            if (enemyById.get(enemy.id) !== enemy) continue;
            const rr = effect.radius + enemy.r;
            if (distanceSq(enemy, effect) <= rr * rr) hurtEnemy(enemy, effect.damage, enemy.x, enemy.y, { element: "fire" });
          }
          releaseEnemyQuery(nearbyEnemies);
          for (let j = 0; j < 4; j++) particle(effect.x + rand(-effect.radius, effect.radius), effect.y + rand(-effect.radius, effect.radius), "#ed7432", 55);
        }
      } else if (effect.type === "aftershock" && !effect.applied && effect.life <= .16) {
        effect.applied = true;
        areaDamage(effect.x, effect.y, effect.radius, effect.damage, true, { priorityMult: effect.priorityMult || 1 });
      } else if (effect.type === "counterFlame" && !effect.applied) {
        effect.applied = true;
        damageEnemiesInRadius(effect.x, effect.y, effect.radius, effect.damage, { element: "fire" });
        burst(effect.x, effect.y, "#ef9d36", 20, 190);
      } else if (effect.type === "eternalShatter") {
        let shattered = 0;
        for (const target of effect.targets) {
          if (target.done || state.time < target.shatterAt) continue;
          target.done = true;
          const enemy = enemyById.get(target.id);
          if (!enemy || enemy.freezeToken !== target.token) continue;
          enemy.freezeUntil = 0;
          enemy.freezeToken = 0;
          hurtEnemy(enemy, effect.damage, enemy.x, enemy.y, { reaction: true });
          shattered += 1;
        }
        if (shattered > 0) {
          addText(effect.x, effect.y - 28, "永冻碎裂", .9, "#c9f8ff");
          burst(effect.x, effect.y, "#c9f8ff", Math.min(30, 10 + shattered * 2), 220);
          onElementReaction();
        }
        if (effect.targets.every((target) => target.done)) effect.life = 0;
      } else if (effect.type === "frostNova") {
        tickFrostNova(effect, dt);
      }
      effect.life -= dt;
      if (effect.life <= 0) {
        if (effect.type === "frostNova") finalizeFrostNova(effect);
        else if (effect.type === "frostMine" && !effect.detonated) burst(effect.x, effect.y, "#83cbd4", 8, 65);
        state.effects.splice(i, 1);
      }
    }
    for (const prop of state.breakables) prop.hitFlash = Math.max(0, prop.hitFlash - dt);
  }

  function camera() {
    if (state.mode === "menu") return { x: Math.sin(performance.now() / 9000) * 55, y: Math.cos(performance.now() / 11000) * 45 };
    return { x: player.x, y: player.y };
  }

  function draw() {
    const cam = camera();
    const shake = state.shake > 0 ? state.shake * 7 : 0;
    const ox = width / 2 - cam.x + rand(-shake, shake);
    const oy = height / 2 - cam.y + rand(-shake, shake);
    const left = cam.x - width / 2 - 120;
    const right = cam.x + width / 2 + 120;
    const top = cam.y - height / 2 - 120;
    const bottom = cam.y + height / 2 + 120;
    const isVisible = (entity, padding = 0) => entity.x + padding >= left && entity.x - padding <= right && entity.y + padding >= top && entity.y - padding <= bottom;
    drawGround(cam, ox, oy);
    ctx.save();
    ctx.translate(ox, oy);

    for (const prop of state.breakables) if (isVisible(prop, prop.r)) drawBreakable(prop);
    for (const item of state.pickups) if (isVisible(item, item.r)) drawPickup(item);
    for (const shot of state.projectiles) if (isVisible(shot, shot.r + (shot.visualHeight || 0))) drawPlayerShot(shot);
    for (const shot of state.enemyShots) if (isVisible(shot, shot.r)) drawEnemyShot(shot);
    for (const enemy of state.enemies) if (isVisible(enemy, enemy.r)) drawEnemy(enemy);
    for (const effect of state.effects) if (isVisible(effect, (effect.radius || 24) + 160)) drawEffect(effect);
    if (state.mode !== "menu") drawPlayer(player);
    for (const p of state.particles) {
      if (!isVisible(p, p.size)) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const item of state.texts) {
      if (!isVisible(item, 40)) continue;
      ctx.globalAlpha = Math.min(1, item.life * 2.5);
      ctx.fillStyle = "#1a1510"; ctx.fillText(item.text, item.x + 1, item.y + 2);
      ctx.fillStyle = item.color; ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (state.mode !== "menu") drawHealthBar();
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(170, 28, 20, ${state.flash * .28})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawGround(cam, ox, oy) {
    ctx.fillStyle = "#45684a";
    ctx.fillRect(0, 0, width, height);
    const tile = 96;
    const minX = Math.floor((cam.x - width / 2 - tile) / tile);
    const maxX = Math.floor((cam.x + width / 2 + tile) / tile);
    const minY = Math.floor((cam.y - height / 2 - tile) / tile);
    const maxY = Math.floor((cam.y + height / 2 + tile) / tile);
    for (let tx = minX; tx <= maxX; tx++) {
      for (let ty = minY; ty <= maxY; ty++) {
        const x = Math.round(tx * tile + ox), y = Math.round(ty * tile + oy);
        const n = hash(tx, ty);
        if (n > .8) {
          ctx.fillStyle = n > .92 ? "#3d5d44" : "#4b704e";
          ctx.fillRect(x, y, tile, tile);
        }
        drawGroundDetail(x, y, tx, ty);
      }
    }
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGroundDetail(x, y, tx, ty) {
    const n = hash(tx, ty, 3);
    const px = x + 10 + hash(tx, ty, 4) * 75;
    const py = y + 10 + hash(tx, ty, 5) * 75;
    if (n < .34) {
      ctx.fillStyle = "#294b36";
      ctx.fillRect(px, py, 2, 7); ctx.fillRect(px + 4, py + 2, 2, 6); ctx.fillRect(px - 3, py + 4, 2, 5);
    } else if (n > .87 && n < .95) {
      ctx.fillStyle = "#72584a";
      ctx.fillRect(px - 8, py - 3, 16, 7); ctx.fillRect(px - 3, py - 7, 10, 5);
      ctx.fillStyle = "#4b3e36"; ctx.fillRect(px - 5, py + 4, 11, 3);
    } else if (n >= .95) {
      ctx.fillStyle = "#ddd2aa"; ctx.fillRect(px, py, 3, 3);
      ctx.fillStyle = "#d98272"; ctx.fillRect(px - 2, py - 2, 2, 2); ctx.fillRect(px + 4, py - 1, 2, 2);
      ctx.fillStyle = "#3d5c3e"; ctx.fillRect(px + 1, py + 3, 1, 5);
    }
  }

  function drawCharacterPortrait(portrait, character) {
    const portraitCtx = portrait.getContext("2d");
    portraitCtx.imageSmoothingEnabled = false;
    portraitCtx.clearRect(0, 0, portrait.width, portrait.height);
    portraitCtx.save();
    portraitCtx.translate(32, 39);
    portraitCtx.scale(1.12, 1.12);
    drawCharacterSprite(portraitCtx, character.id, character.id === "arcanist" ? .8 : 0);
    portraitCtx.restore();
  }

  function drawCharacterSprite(drawCtx, characterId, time = 0) {
    drawCtx.save();
    drawCtx.fillStyle = "rgba(7,12,9,.35)";
    drawCtx.fillRect(-15, 12, 30, 7);

    if (characterId === "vanguard") {
      // Broad armor, ember crest and a heavy sword make the frontline role readable at game scale.
      drawCtx.fillStyle = "#6f3028"; drawCtx.fillRect(-12, -8, 24, 23);
      drawCtx.fillStyle = "#252b2a"; drawCtx.fillRect(-10, 8, 8, 12); drawCtx.fillRect(3, 8, 8, 12);
      drawCtx.fillStyle = "#151918"; drawCtx.fillRect(-11, 17, 10, 4); drawCtx.fillRect(2, 17, 11, 4);
      drawCtx.fillStyle = "#4b514d"; drawCtx.fillRect(-13, -10, 26, 20);
      drawCtx.fillStyle = "#747a72"; drawCtx.fillRect(-10, -7, 20, 5); drawCtx.fillRect(-8, 1, 16, 7);
      drawCtx.fillStyle = "#343936"; drawCtx.fillRect(-18, -9, 7, 10); drawCtx.fillRect(11, -9, 7, 10);
      drawCtx.fillStyle = "#a34f36"; drawCtx.fillRect(-3, -5, 6, 12);
      drawCtx.fillStyle = "#efad43"; drawCtx.fillRect(-1, -3, 3, 7);
      drawCtx.fillStyle = "#8b9187"; drawCtx.fillRect(-9, -22, 18, 14); drawCtx.fillRect(-7, -25, 14, 5);
      drawCtx.fillStyle = "#3a3d39"; drawCtx.fillRect(-8, -17, 16, 4); drawCtx.fillRect(-6, -12, 12, 3);
      drawCtx.fillStyle = "#ffd36a"; drawCtx.fillRect(4, -16, 3, 2);
      drawCtx.fillStyle = "#8c372b"; drawCtx.fillRect(-3, -30, 6, 7);
      drawCtx.fillStyle = "#e17732"; drawCtx.fillRect(2, -28, 4, 5);
      drawCtx.fillStyle = "#68432d"; drawCtx.fillRect(11, -4, 7, 6); drawCtx.fillRect(14, -7, 3, 12);
      drawCtx.fillStyle = "#d6d1bd"; drawCtx.fillRect(18, -5, 13, 8);
      drawCtx.fillStyle = "#f3ead0"; drawCtx.fillRect(29, -3, 5, 4);
      drawCtx.fillStyle = "#9a5e34"; drawCtx.fillRect(18, 4, 10, 3);
    } else if (characterId === "ranger") {
      // A hood, back quiver and recurved bow distinguish the agile ranged silhouette.
      drawCtx.fillStyle = "#5b3b29"; drawCtx.fillRect(-15, -18, 6, 25);
      drawCtx.fillStyle = "#d9c887"; drawCtx.fillRect(-15, -23, 2, 10); drawCtx.fillRect(-11, -24, 2, 11);
      drawCtx.fillStyle = "#c0aa68"; drawCtx.fillRect(-17, -25, 6, 4); drawCtx.fillRect(-13, -26, 6, 4);
      drawCtx.fillStyle = "#263a2c"; drawCtx.fillRect(-9, 8, 7, 12); drawCtx.fillRect(3, 8, 7, 12);
      drawCtx.fillStyle = "#18251c"; drawCtx.fillRect(-10, 17, 9, 4); drawCtx.fillRect(2, 17, 10, 4);
      drawCtx.fillStyle = "#315e3c";
      drawCtx.beginPath(); drawCtx.moveTo(-11, -9); drawCtx.lineTo(11, -9); drawCtx.lineTo(15, 14); drawCtx.lineTo(-14, 14); drawCtx.closePath(); drawCtx.fill();
      drawCtx.fillStyle = "#4d8b55"; drawCtx.fillRect(-8, -7, 16, 15); drawCtx.fillRect(-12, 7, 24, 5);
      drawCtx.fillStyle = "#7d5836"; drawCtx.fillRect(-12, 4, 24, 4);
      drawCtx.fillStyle = "#d3a66f"; drawCtx.fillRect(-7, -18, 14, 12);
      drawCtx.fillStyle = "#244d33"; drawCtx.fillRect(-10, -21, 20, 8); drawCtx.fillRect(-12, -17, 6, 12); drawCtx.fillRect(7, -17, 5, 12);
      drawCtx.fillStyle = "#193422"; drawCtx.fillRect(-7, -11, 14, 5);
      drawCtx.fillStyle = "#d8d06d"; drawCtx.fillRect(3, -15, 3, 2);
      drawCtx.strokeStyle = "#a77a44"; drawCtx.lineWidth = 3;
      drawCtx.beginPath(); drawCtx.moveTo(20, -15); drawCtx.quadraticCurveTo(31, 0, 20, 16); drawCtx.stroke();
      drawCtx.strokeStyle = "#ddd7b2"; drawCtx.lineWidth = 1;
      drawCtx.beginPath(); drawCtx.moveTo(20, -15); drawCtx.lineTo(20, 16); drawCtx.stroke();
      drawCtx.fillStyle = "#d9c887"; drawCtx.fillRect(8, -1, 22, 2);
      drawCtx.fillStyle = "#efe7bd"; drawCtx.fillRect(28, -3, 6, 6);
    } else {
      // Long robes, a rune staff and orbiting elemental motes identify the caster.
      drawCtx.fillStyle = "#202d46";
      drawCtx.beginPath(); drawCtx.moveTo(-10, -8); drawCtx.lineTo(10, -8); drawCtx.lineTo(15, 19); drawCtx.lineTo(-15, 19); drawCtx.closePath(); drawCtx.fill();
      drawCtx.fillStyle = "#365e87"; drawCtx.fillRect(-11, -10, 22, 17); drawCtx.fillRect(-15, -7, 6, 13); drawCtx.fillRect(9, -7, 6, 13);
      drawCtx.fillStyle = "#63b7d2"; drawCtx.fillRect(-9, 5, 18, 4); drawCtx.fillRect(-2, -7, 4, 13);
      drawCtx.fillStyle = "#182138"; drawCtx.fillRect(-13, 14, 26, 6);
      drawCtx.fillStyle = "#d3a570"; drawCtx.fillRect(-7, -19, 14, 12);
      drawCtx.fillStyle = "#273e64"; drawCtx.fillRect(-10, -23, 20, 7); drawCtx.fillRect(-12, -20, 5, 12); drawCtx.fillRect(7, -20, 5, 12);
      drawCtx.fillStyle = "#16243d"; drawCtx.fillRect(-7, -12, 14, 5);
      drawCtx.fillStyle = "#9fe8f0"; drawCtx.fillRect(3, -16, 3, 2);
      drawCtx.fillStyle = "#714d36"; drawCtx.fillRect(18, -18, 4, 38); drawCtx.fillRect(15, 15, 10, 4);
      drawCtx.fillStyle = "rgba(118,200,232,.28)"; drawCtx.fillRect(12, -29, 16, 16);
      drawCtx.fillStyle = "#77d8ed"; drawCtx.fillRect(15, -26, 10, 10);
      drawCtx.fillStyle = "#e9fbff"; drawCtx.fillRect(18, -23, 4, 4);
      const moteColors = ["#e86c35", "#8ee4f0", "#d9efff"];
      for (let i = 0; i < moteColors.length; i++) {
        const angle = time * 1.8 + i * TAU / moteColors.length;
        const mx = Math.round(Math.cos(angle) * 23);
        const my = Math.round(-4 + Math.sin(angle) * 12);
        drawCtx.globalAlpha = .42; drawCtx.fillStyle = moteColors[i]; drawCtx.fillRect(mx - 4, my - 4, 8, 8);
        drawCtx.globalAlpha = 1; drawCtx.fillRect(mx - 2, my - 2, 4, 4);
      }
    }
    drawCtx.restore();
  }

  function drawPlayer(p) {
    const character = selectedCharacter();
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 16) % 2 === 0;
    const recovering = p.hp < p.maxHp && state.time - p.lastDamageAt >= RECOVERY_DELAY;
    if (recovering) {
      const pulse = .5 + Math.sin(state.time * 4) * .18;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#73d78a";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y), 22 + Math.sin(state.time * 4) * 2, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (blink) ctx.globalAlpha = .35;
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(p.facing, 1);
    drawCharacterSprite(ctx, character.id, state.time);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy) {
    const x = Math.round(enemy.x), y = Math.round(enemy.y);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(8,12,9,.3)"; ctx.fillRect(-enemy.r*.8, enemy.r*.55, enemy.r*1.6, enemy.r*.45);
    const color = enemy.hitFlash > 0 ? "#fff1d6" : enemy.color;
    if (enemy.type === "skull") {
      ctx.fillStyle = color; ctx.fillRect(-10,-12,20,19); ctx.fillRect(-7,7,5,10); ctx.fillRect(3,7,5,10);
      ctx.fillStyle = "#28251f"; ctx.fillRect(-6,-5,4,4); ctx.fillRect(3,-5,4,4); ctx.fillRect(-3,3,6,3);
    } else if (enemy.type === "snake") {
      ctx.fillStyle = color; ctx.fillRect(-13,-5,25,11); ctx.fillRect(7,-10,11,13); ctx.fillRect(-17,2,9,7);
      ctx.fillStyle = "#dddf99"; ctx.fillRect(11,-7,3,3); ctx.fillStyle = "#34572e"; ctx.fillRect(-6,-3,5,3);
    } else if (enemy.type === "slime") {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0,1,enemy.r,Math.PI,0); ctx.lineTo(enemy.r,12); ctx.lineTo(-enemy.r,12); ctx.fill();
      ctx.fillStyle = "#d0ebe0"; ctx.fillRect(-9,-4,5,4); ctx.fillRect(5,-4,5,4);
    } else if (enemy.type === "elite") {
      ctx.fillStyle = color; ctx.fillRect(-enemy.r*.72,-enemy.r*.62,enemy.r*1.44,enemy.r*1.35);
      ctx.fillRect(-enemy.r,-5,enemy.r*.35,enemy.r*.8); ctx.fillRect(enemy.r*.65,-5,enemy.r*.35,enemy.r*.8);
      ctx.fillStyle = "#ffd06a";
      ctx.fillRect(-10,-12,6,5); ctx.fillRect(5,-12,6,5); ctx.fillRect(-8,8,16,4);
    } else if (enemy.type === "octopus") {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0,0,enemy.r,0,TAU); ctx.fill();
      ctx.fillRect(-15,8,6,14); ctx.fillRect(-4,9,7,16); ctx.fillRect(8,8,6,14);
      ctx.fillStyle = "#d0a6d6"; ctx.fillRect(-9,-7,5,4); ctx.fillRect(4,-7,5,4);
      ctx.fillStyle = "#402846"; ctx.fillRect(-5,4,10,7);
    } else {
      ctx.fillStyle = color; ctx.fillRect(-34,-31,68,64);
      ctx.fillStyle = "#b9a984"; ctx.fillRect(-39,-35,16,12); ctx.fillRect(23,-35,16,12); ctx.fillRect(-5,-43,10,14);
      ctx.fillStyle = "#e59b45"; ctx.fillRect(-19,-13,11,7); ctx.fillRect(8,-13,11,7);
      ctx.fillStyle = "#2a1916"; ctx.fillRect(-14,10,28,8);
    }
    ctx.restore();
    ctx.save(); ctx.translate(x, y);
    if ((enemy.burnUntil ?? 0) > state.time) {
      ctx.fillStyle = "rgba(238,93,38,.82)";
      ctx.fillRect(-enemy.r * .65, -enemy.r - 7, 5, 8); ctx.fillRect(2, -enemy.r - 11, 5, 11); ctx.fillRect(enemy.r * .45, -enemy.r - 5, 4, 7);
      ctx.fillStyle = "#ffd36a"; ctx.fillRect(3, -enemy.r - 7, 3, 6);
    }
    if ((enemy.shockUntil ?? 0) > state.time) {
      ctx.strokeStyle = "rgba(126,224,245,.9)"; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(0, 0, enemy.r + 5 + Math.sin(state.time * 10) * 2, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if ((enemy.freezeUntil ?? 0) > state.time) {
      ctx.strokeStyle = "rgba(207,249,255,.86)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, enemy.r + 4, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#d7f8ff"; ctx.fillRect(-enemy.r, enemy.r - 1, 6, 6); ctx.fillRect(enemy.r - 5, enemy.r - 4, 5, 7);
    }
    ctx.restore();
    if (enemy.type === "elite" && enemy.hp < enemy.maxHp) drawWorldBar(enemy, 40, enemy.r + 12);
  }

  function drawWorldBar(entity, barWidth, yOffset) {
    ctx.fillStyle = "#171714"; ctx.fillRect(entity.x - barWidth/2, entity.y - yOffset, barWidth, 5);
    ctx.fillStyle = "#d75b4f"; ctx.fillRect(entity.x - barWidth/2 + 1, entity.y - yOffset + 1, (barWidth-2) * Math.max(0,entity.hp/entity.maxHp), 3);
  }

  function drawPlayerShot(shot) {
    ctx.save();
    ctx.translate(Math.round(shot.x), Math.round(shot.y));
    if (shot.lobbed) {
      const shadowScale = 1 - Math.min(.45, shot.visualHeight / 120);
      ctx.globalAlpha = .28 * shadowScale;
      ctx.fillStyle = "#111611";
      ctx.beginPath(); ctx.ellipse(0, 4, 10 * shadowScale, 5 * shadowScale, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(0, -shot.visualHeight);
      const heightScale = 1 + shot.visualHeight * .0025;
      ctx.scale(heightScale, heightScale);
    }
    ctx.rotate(shot.angle ?? Math.atan2(shot.vy, shot.vx));
    if (shot.kind === "arrow") {
      ctx.strokeStyle = "rgba(236,226,189,.28)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-23, 0); ctx.lineTo(-11, 0); ctx.stroke();
      ctx.fillStyle = "#9b6a3e"; ctx.fillRect(-13, -1, 22, 2);
      ctx.fillStyle = "#eee3bd"; ctx.beginPath(); ctx.moveTo(9, -4); ctx.lineTo(16, 0); ctx.lineTo(9, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#c75b45"; ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-18, -4); ctx.lineTo(-11, -2); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-18, 4); ctx.lineTo(-11, 2); ctx.closePath(); ctx.fill();
    } else if (shot.kind === "shuriken") {
      ctx.rotate(shot.spin);
      ctx.fillStyle = "#c8cdd1"; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const r = i % 2 === 0 ? 10 : 3; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#626a70"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#333a3e"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
    } else if (shot.kind === "bomb") {
      ctx.rotate(shot.spin);
      ctx.fillStyle = "#1f2421"; ctx.beginPath(); ctx.arc(0, 1, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#59605b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-1, 0, 6, .6, 4.7); ctx.stroke();
      ctx.fillStyle = "#82522c"; ctx.fillRect(5, -8, 4, 6);
      ctx.strokeStyle = "#d6b363"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, -8); ctx.quadraticCurveTo(12, -12, 10, -15); ctx.stroke();
      ctx.fillStyle = shot.life < .28 ? "#fff1a0" : "#ef8a35"; ctx.fillRect(8, -17, 4, 4);
    } else if (shot.kind === "fireball") {
      const flicker = Math.sin(state.time * 34 + shot.x * .03) * 3;
      ctx.fillStyle = "rgba(218,64,29,.28)"; ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(-25 - flicker, 0); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e85a29"; ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(-15 - flicker, 0); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,169,58,.35)"; ctx.beginPath(); ctx.arc(3, 0, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f06d2f"; ctx.beginPath(); ctx.arc(3, 0, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffe083"; ctx.beginPath(); ctx.arc(5, -1, 5, 0, TAU); ctx.fill();
    } else if (shot.kind === "chopper") {
      ctx.rotate(shot.spin);
      ctx.fillStyle = "#80573e"; ctx.fillRect(-13, -2, 26, 4);
      ctx.fillStyle = "#d8d3c4";
      ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-12, -12); ctx.lineTo(-17, -9); ctx.lineTo(-13, -1); ctx.lineTo(-5, 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(5, 3); ctx.lineTo(12, 12); ctx.lineTo(17, 9); ctx.lineTo(13, 1); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#747871"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#c59862"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    } else if (shot.kind === "bolt") {
      ctx.strokeStyle = "rgba(226,213,170,.22)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-11, 0); ctx.stroke();
      ctx.fillStyle = "#5e3e30"; ctx.fillRect(-12, -2, 22, 4);
      ctx.fillStyle = "#d7d0bd"; ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(18, 0); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b14c3f"; ctx.fillRect(-15, -5, 5, 10);
    } else if (shot.kind === "poisonPot") {
      ctx.rotate(shot.spin * .7);
      ctx.fillStyle = "#2b3c30"; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.lineTo(9, 7); ctx.lineTo(5, 11); ctx.lineTo(-5, 11); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#79a957"; ctx.fillRect(-6, 0, 12, 8);
      ctx.fillStyle = "#b9db79"; ctx.fillRect(-4, 1, 3, 6);
      ctx.fillStyle = "#d5c29b"; ctx.fillRect(-4, -12, 8, 5);
      ctx.strokeStyle = "#56794a"; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillStyle = "#f2a33c"; ctx.fillRect(-9,-4,13,8); ctx.fillStyle = "#fff2ad"; ctx.fillRect(1,-2,10,4);
    }
    ctx.restore();
  }

  function drawBreakable(prop) {
    ctx.save(); ctx.translate(Math.round(prop.x), Math.round(prop.y));
    if (prop.type === "chest") {
      ctx.fillStyle = prop.hitFlash > 0 ? "#fff1d6" : "#7f4c2b"; ctx.fillRect(-15,-9,30,20);
      ctx.fillStyle = "#c58b3d"; ctx.fillRect(-15,-4,30,5); ctx.fillRect(-3,-9,6,20);
      ctx.fillStyle = "#f0c85c"; ctx.fillRect(-2,-1,4,6);
    } else {
      ctx.fillStyle = prop.hitFlash > 0 ? "#fff1d6" : "#9ec7b4"; ctx.fillRect(-6,-13,12,21); ctx.fillRect(-3,-18,6,6);
      ctx.fillStyle = "#d4efe2"; ctx.fillRect(-3,-10,3,13); ctx.fillStyle="#4c725f";ctx.fillRect(-5,8,10,3);
    }
    ctx.restore();
  }

  function drawThornBurst(effect) {
    const blades = thornBurstPositions(effect);
    const elapsed = effect.max - effect.life;
    const alpha = Math.min(1, elapsed * 7, effect.life * 5);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(200,225,139,.3)"; ctx.lineWidth = 2; ctx.setLineDash([5, 8]);
    ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    for (let index = 0; index < blades.length; index++) {
      const blade = blades[index];
      ctx.save(); ctx.translate(blade.x, blade.y); ctx.rotate(state.time * 9 + index * 1.7);
      ctx.fillStyle = "rgba(8,14,9,.25)"; ctx.beginPath(); ctx.ellipse(1, 4, 11, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#b7d47a"; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16; const r = i % 2 === 0 ? 12 : 8; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#edf1b2"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#526b46"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f3efb8"; ctx.beginPath(); ctx.arc(-1, -1, 1.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEffect(effect) {
    if (effect.type === "thornBurst") {
      drawThornBurst(effect);
    } else if (effect.type === "weaponFlash") {
      const progress = 1 - effect.life / effect.max;
      ctx.save(); ctx.translate(effect.x, effect.y); ctx.rotate(effect.angle); ctx.globalAlpha = 1 - progress;
      if (effect.variant === "bow") {
        ctx.strokeStyle = effect.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-3, 0, 14, -1.05, 1.05); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(8 + progress * 6, 0); ctx.lineTo(4, 12); ctx.stroke();
      } else if (effect.variant === "crossbow") {
        ctx.strokeStyle = effect.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(5, 0); ctx.lineTo(-8, 10); ctx.stroke();
        ctx.fillStyle = "#76503a"; ctx.fillRect(-11, -2, 22 - progress * 7, 4);
      } else {
        ctx.strokeStyle = effect.color; ctx.lineWidth = effect.variant === "spell" ? 5 : 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18 + progress * 10, 0); ctx.stroke();
        ctx.fillStyle = effect.color; ctx.beginPath(); ctx.arc(12 + progress * 6, 0, effect.variant === "spell" ? 6 : 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else if (effect.type === "blast") {
      const progress = 1 - effect.life / effect.max;
      const color = effect.variant === "fire" ? "#ff8b3d" : effect.variant === "frost" ? "#bdeff5" : effect.variant === "poison" ? "#a7d66d" : "#f0bd61";
      const radius = effect.radius * (.18 + progress * .82);
      ctx.save(); ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = effect.variant === "fire" ? "rgba(230,73,31,.18)" : effect.variant === "poison" ? "rgba(107,151,73,.18)" : effect.variant === "frost" ? "rgba(158,231,238,.16)" : "rgba(240,189,97,.13)";
      ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 7 - progress * 5; ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (effect.type === "lightningField") {
      ctx.save();
      const age = effect.max - effect.life;
      const pulse = .5 + Math.sin(state.time * 18 + effect.x * .02) * .12;
      ctx.globalAlpha = Math.min(1, effect.life / .35) * pulse;
      ctx.fillStyle = "rgba(72,184,220,.16)"; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#77d8ed"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const phase = Math.floor(state.time * 24 + effect.x * .07);
      for (let branch = 0; branch < 3; branch++) {
        const angle = branch * TAU / 3 + Math.sin(phase + branch * 2.1) * .45;
        ctx.globalAlpha = .42 + (branch === phase % 3 ? .4 : 0);
        ctx.strokeStyle = branch === phase % 3 ? "#e9fbff" : "#79dff0"; ctx.lineWidth = branch === phase % 3 ? 2.5 : 1.5;
        ctx.beginPath(); ctx.moveTo(effect.x, effect.y);
        for (let step = 1; step <= 4; step++) {
          const length = effect.radius * step / 4;
          const wobble = Math.sin(phase * 1.7 + branch * 4 + step * 5) * 8;
          ctx.lineTo(effect.x + Math.cos(angle) * length + Math.cos(angle + Math.PI / 2) * wobble, effect.y + Math.sin(angle) * length + Math.sin(angle + Math.PI / 2) * wobble);
        }
        ctx.stroke();
      }
      if (age < .24) {
        ctx.globalAlpha = 1 - age / .24;
        ctx.strokeStyle = "#f2fcff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(effect.x - 10, effect.y - 160);
        for (let step = 1; step <= 7; step++) ctx.lineTo(effect.x + Math.sin(phase + step * 3.7) * 15, effect.y - 160 + step * 23);
        ctx.stroke();
      }
      ctx.restore();
    } else if (effect.type === "slash") {
      const progress = 1 - effect.life / effect.max;
      const sweepEnd = -effect.width / 2 + effect.width * Math.min(1, progress * 1.65);
      const visualRadius = effect.visualRadius || effect.radius;
      ctx.save(); ctx.globalAlpha = Math.min(1, effect.life / effect.max * 1.8); ctx.translate(effect.x, effect.y); ctx.rotate(effect.angle);
      ctx.strokeStyle = effect.element ? "#ffb04b" : "#fff1b0"; ctx.lineWidth = effect.element ? 9 : 7; ctx.beginPath(); ctx.arc(0, 0, visualRadius, -effect.width / 2, sweepEnd); ctx.stroke();
      ctx.strokeStyle = effect.element ? "#ef6332" : "#d7923e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, visualRadius - 7, -effect.width / 2, sweepEnd); ctx.stroke();
      ctx.strokeStyle = "rgba(255,246,211,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(visualRadius * .92, 0); ctx.stroke(); ctx.restore();
    } else if (effect.type === "frostMine") {
      const armed = effect.arm <= 0;
      const pulse = armed ? .75 + Math.sin(state.time * 8 + effect.x) * .2 : .4;
      ctx.save(); ctx.globalAlpha = pulse; ctx.translate(effect.x, effect.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = armed ? "#bdeff5" : "#55757a";
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(5, -5); ctx.lineTo(13, 0); ctx.lineTo(5, 5); ctx.lineTo(0, 13); ctx.lineTo(-5, 5); ctx.lineTo(-13, 0); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = armed ? "#f3ffff" : "#8fb7bd"; ctx.fillRect(-4, -4, 8, 8);
      if (armed) { ctx.strokeStyle = "#d8fbff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(state.time * 7) * 2, 0, TAU); ctx.stroke(); }
      ctx.restore();
    } else if (effect.type === "poisonField") {
      ctx.save(); ctx.globalAlpha = .24 * (effect.life / effect.max); ctx.fillStyle = "#6f9f55"; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = .62 * (effect.life / effect.max); ctx.strokeStyle = "#a8d96f"; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const angle = i * 2.4 + effect.x * .01;
        const distance = effect.radius * (.25 + (i % 3) * .22);
        const bubbleY = Math.sin(state.time * 2.8 + i) * 7;
        ctx.globalAlpha = .22 + (i % 2) * .12; ctx.fillStyle = i % 2 ? "#b8df78" : "#527b48";
        ctx.beginPath(); ctx.arc(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance + bubbleY, 4 + (i % 3), 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else if (effect.type === "frostNova") {
      ctx.save(); ctx.globalAlpha = effect.life / effect.max; const progress = 1 - effect.life / effect.max; const radius = effect.radius * (.28 + progress * .72);
      ctx.strokeStyle = "#c9f8ff"; ctx.lineWidth = 6 - progress * 3; ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, TAU); ctx.stroke(); ctx.strokeStyle = "#71cbdc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(effect.x, effect.y, Math.max(4, radius - 9), 0, TAU); ctx.stroke();
      ctx.fillStyle = "#dffcff";
      for (let i = 0; i < 10; i++) { const angle = i * TAU / 10; const x = effect.x + Math.cos(angle) * radius, y = effect.y + Math.sin(angle) * radius; ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -3); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.restore();
    } else if (effect.type === "eternalShatter") {
      ctx.save(); ctx.globalAlpha = .65 * (effect.life / effect.max); const progress = 1 - effect.life / effect.max;
      ctx.strokeStyle = "#d9fbff"; ctx.lineWidth = 4; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.82 + progress * .18), 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    } else if (effect.type === "fireField") {
      ctx.save(); ctx.globalAlpha = .2 * Math.min(1, effect.life); ctx.fillStyle = "#c94727"; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = .68 * Math.min(1, effect.life); ctx.strokeStyle = "#ef9d36"; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.1 + effect.x * .013;
        const distance = effect.radius * (.25 + (i % 3) * .23);
        const flame = 5 + Math.sin(state.time * 12 + i) * 3;
        const x = effect.x + Math.cos(angle) * distance, y = effect.y + Math.sin(angle) * distance;
        ctx.fillStyle = i % 2 ? "#ffb13f" : "#e9602e"; ctx.beginPath(); ctx.moveTo(x - 4, y + 5); ctx.quadraticCurveTo(x, y - flame - 5, x + 4, y + 5); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else if (effect.type === "aftershock" || effect.type === "counterFlame") {
      ctx.save(); ctx.globalAlpha = effect.life / effect.max; const progress = 1 - effect.life / effect.max;
      ctx.strokeStyle = effect.type === "aftershock" ? "#ffd36a" : "#ef8138"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.45 + progress * .55), 0, TAU); ctx.stroke(); ctx.restore();
    } else if (effect.type === "reaction") {
      ctx.save(); ctx.globalAlpha = effect.life / effect.max; const progress = 1 - effect.life / effect.max;
      ctx.strokeStyle = effect.variant === "shatter" ? "#c9f8ff" : "#ffd36a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.35 + progress * .65), 0, TAU); ctx.stroke();
      if (effect.variant === "overload") { ctx.strokeStyle = "#79dff0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.55 + progress * .35), 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawEnemyShot(shot) {
    ctx.fillStyle = "rgba(92,42,111,.35)"; ctx.beginPath(); ctx.arc(shot.x,shot.y,shot.r+5,0,TAU); ctx.fill();
    ctx.fillStyle = "#c581d0"; ctx.beginPath(); ctx.arc(shot.x,shot.y,shot.r,0,TAU); ctx.fill();
  }

  function drawPickup(item) {
    const bob = Math.sin(state.time * 5 + item.x) * 2;
    if (item.type === "coin") {
      ctx.fillStyle = "#87521e"; ctx.beginPath(); ctx.arc(item.x,item.y+bob,item.r+2,0,TAU); ctx.fill();
      ctx.fillStyle = "#f2bd3f"; ctx.beginPath(); ctx.arc(item.x,item.y+bob,item.r,0,TAU); ctx.fill();
      ctx.fillStyle = "#fff1a0"; ctx.fillRect(item.x-1,item.y+bob-item.r+2,2,item.r*2-4);
    } else if (item.type === "heart") {
      ctx.fillStyle = "#7c2630"; ctx.fillRect(item.x-7,item.y+bob-4,14,10); ctx.fillRect(item.x-5,item.y+bob+5,10,5);
      ctx.fillStyle = "#ef6c73"; ctx.fillRect(item.x-5,item.y+bob-6,5,5); ctx.fillRect(item.x+1,item.y+bob-6,5,5);
    } else if (item.type === "purge") {
      ctx.save(); ctx.translate(item.x, item.y + bob); ctx.rotate(state.time * 1.8);
      ctx.fillStyle = "rgba(255,174,68,.24)"; ctx.beginPath(); ctx.arc(0, 0, item.r + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e75d36"; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const angle = i * TAU / 16; const radius = i % 2 ? 6 : 11; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffe38a"; ctx.fillRect(-2, -7, 4, 14); ctx.fillRect(-7, -2, 14, 4); ctx.restore();
    } else if (item.type === "vacuum") {
      ctx.save(); ctx.translate(item.x, item.y + bob);
      ctx.fillStyle = "rgba(111,223,235,.22)"; ctx.beginPath(); ctx.arc(0, 0, item.r + 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#8ee7ef"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 9, .2, Math.PI - .2); ctx.stroke();
      ctx.fillStyle = "#e5ffff"; ctx.fillRect(-11, -2, 5, 8); ctx.fillRect(6, -2, 5, 8); ctx.restore();
    } else {
      ctx.save(); ctx.translate(item.x,item.y+bob); ctx.rotate(Math.PI/4);
      ctx.fillStyle = "rgba(167,136,255,.25)"; ctx.fillRect(-item.r-3,-item.r-3,item.r*2+6,item.r*2+6);
      ctx.fillStyle = "#9a7bea"; ctx.fillRect(-item.r,-item.r,item.r*2,item.r*2);
      ctx.fillStyle = "#d9c9ff"; ctx.fillRect(-item.r+2,-item.r+2,2,item.r); ctx.restore();
    }
  }

  function drawHealthBar() {
    const barWidth = Math.min(210, width * .34), barHeight = 13;
    const x = width/2 - barWidth/2, y = height - healthBarBottom;
    ctx.fillStyle = "rgba(8,12,9,.85)"; ctx.fillRect(x-2,y-2,barWidth+4,barHeight+4);
    ctx.fillStyle = "#ece2c5"; ctx.fillRect(x,y,barWidth,barHeight);
    ctx.fillStyle = player.hp/player.maxHp > .3 ? "#d95b50" : "#f0a33b";
    ctx.fillRect(x+2,y+2,(barWidth-4)*Math.max(0,player.hp/player.maxHp),barHeight-4);
    ctx.fillStyle = "#fff4de"; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign="center";
    ctx.fillText(`${Math.max(0,Math.ceil(player.hp))} / ${player.maxHp}`,width/2,y+10);
  }

  function tone() {}

  function loop(now) {
    const dt = Math.min(.034, (now - state.last) / 1000 || 0);
    state.last = now;
    if (state.mode === "running") {
      const frameStarted = perfStart();
      const updateStarted = perfStart();
      update(dt);
      perfEnd("update", updateStarted);
      const drawStarted = perfStart();
      draw();
      perfEnd("draw", drawStarted);
      perfEnd("frame", frameStarted);
      finishPerfSample();
      lastRenderedMode = state.mode;
    } else if (state.mode === "menu") {
      if (now - lastMenuDraw >= 33) {
        lastMenuDraw = now;
        draw();
        lastRenderedMode = state.mode;
      }
    } else if (lastRenderedMode !== state.mode) {
      draw();
      lastRenderedMode = state.mode;
    }
    requestAnimationFrame(loop);
  }

  function handleKeyDown(event) {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space" && state.mode === "menu") resetGame();
    else if (event.code === "Escape" && ["running","paused"].includes(state.mode)) togglePause();
    else if (state.mode === "levelup" && ["Digit1","Digit2","Digit3"].includes(event.code)) chooseUpgrade(Number(event.code.at(-1)) - 1);
  }

  function setupJoystick() {
    let pointerId = null;
    const move = (event) => {
      if (event.pointerId !== pointerId) return;
      const rect = ui.joystickBase.getBoundingClientRect();
      let dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
      const max = rect.width * .34, length = Math.hypot(dx,dy);
      if (length > max) { dx = dx / length * max; dy = dy / length * max; }
      touchMove.x = dx / max; touchMove.y = dy / max;
      ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const end = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null; touchMove.x = 0; touchMove.y = 0;
      ui.joystickKnob.style.transform = "translate(-50%, -50%)";
    };
    ui.joystickBase.addEventListener("pointerdown", (event) => { pointerId = event.pointerId; ui.joystickBase.setPointerCapture(pointerId); move(event); });
    ui.joystickBase.addEventListener("pointermove", move);
    ui.joystickBase.addEventListener("pointerup", end);
    ui.joystickBase.addEventListener("pointercancel", end);
  }

  document.querySelector("#start-btn").addEventListener("click", resetGame);
  document.querySelector("#pause-btn").addEventListener("click", togglePause);
  document.querySelector("#resume-btn").addEventListener("click", () => togglePause(true));
  document.querySelector("#restart-pause-btn").addEventListener("click", resetGame);
  document.querySelector("#restart-btn").addEventListener("click", resetGame);
  document.querySelector("#home-btn").addEventListener("click", goHome);
  ui.masteryButton.addEventListener("click", upgradeMastery);
  ui.rerollUpgrades.addEventListener("click", rerollUpgrades);
  ui.buyExtraUpgrade.addEventListener("click", buyExtraUpgrade);
  ui.banishUpgrade.addEventListener("click", toggleBanishUpgrade);
  ui.skipUpgrade.addEventListener("click", skipUpgrade);
  ui.revive.addEventListener("click", reviveGame);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => { keys.clear(); if (state.mode === "running") togglePause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && state.mode === "running") togglePause(); });

  resize();
  setupJoystick();
  updateRecord();
  renderCharacterMenu();
  if (PERF_ENABLED) {
    perfOutput = document.createElement("output");
    perfOutput.id = "perf-output";
    perfOutput.hidden = true;
    document.body.append(perfOutput);
    window.__emberPerf = {
      report: perfReport,
      snapshot: () => ({
        samples: perfReport.samples,
        averages: { ...perfReport.averages },
        maximums: { ...perfReport.maximums },
        load: { ...perfReport.load },
        queries: { ...perfReport.queries },
      }),
      fillEnemies: (requested = 180) => {
        const target = clamp(Math.floor(requested), 1, 1000);
        while (state.enemies.length < target) spawnEnemy();
        rebuildEnemyBuckets();
        return state.enemies.length;
      },
    };
  }
  requestAnimationFrame(loop);
})();
