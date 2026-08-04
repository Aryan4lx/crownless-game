import { Room } from 'colyseus';
import { WorldState, Player, ResourceNode, Camp, March } from './Schema.js';
import { loadPlayer, savePlayer } from './db.js';

const BUILDINGS = {
  barracks: { label: '⚡', gold: 100, wood: 50, duration: 5000 },
  smithy:   { label: '🔨', gold: 150, wood: 100, duration: 6000 },
  farm:     { label: '🌾', gold: 80,  wood: 0,   duration: 4000 },
  mine:     { label: '⛏️', gold: 120, wood: 0,   duration: 5500 },
};

const LEVEL_FIELD = {
  barracks: 'barracksLvl',
  smithy: 'smithyLvl',
  farm: 'farmLvl',
  mine: 'mineLvl',
  lab: 'researchLvl',
};

const PENDING = new Map();

// Rock-paper-scissors combat: Infantry > Cavalry > Archers > Infantry
// Each type deals 1.5x damage to its counter, takes 0.6x from its counter
const TROOP_TYPES = ['infantry', 'archers', 'cavalry'];
const COUNTERS = { infantry: 'cavalry', archers: 'infantry', cavalry: 'archers' };
const TROOP_LABELS = { infantry: 'Spearman', archers: 'Archer', cavalry: 'Horseman' };
const TROOP_ICONS = { infantry: '🛡️', archers: '🏹', cavalry: '🐎' };

// Faction asymmetries: economic / military / speed identity
const FACTION_BONUS = {
  sultan: { label: 'Silk Road', gold: 1.1, gather: 1.0, march: 1.0, research: 0.8 },
  tsar:   { label: 'Amur Guard', gold: 1.0, gather: 1.05, march: 1.0, research: 1.0 },
  king:   { label: 'Knight Orders', gold: 1.0, gather: 1.0, march: 1.2, research: 1.0 },
  khan:   { label: 'Steppe Horde', gold: 1.0, gather: 1.15, march: 1.25, research: 1.0 },
};

// Anti-cheat: per-session rate limits (ms between actions of each type)
// If a client sends actions faster than this, the excess is silently dropped.
// Tuned so a human playing normally never hits them, but a script spamming does.
const RATE_LIMITS = {
  move:    200,   // 5 moves/sec max (human click rate ~2/sec)
  build:   1000,  // 1 build/sec
  attack:  500,   // 2 attacks/sec
  chat:    1500,  // ~40 msgs/min — fast chat, blocks spam bots
  train:   300,   // ~3 trains/sec (training is already food-gated)
  research: 1000, // 1 research/sec
};
const rateBuckets = new Map(); // sessionId -> { action: lastTimestamp }

function rateLimited(sessionId, action) {
  const now = Date.now();
  let bucket = rateBuckets.get(sessionId);
  if (!bucket) { bucket = {}; rateBuckets.set(sessionId, bucket); }
  const limit = RATE_LIMITS[action];
  if (limit && bucket[action] && (now - bucket[action]) < limit) {
    return true; // RATE LIMITED — drop the action
  }
  bucket[action] = now;
  return false;
}

// Camp tier definitions: difficulty + reward scaling
const CAMP_TIERS = [
  { tier: 1, name: 'Raiders',   army: [18, 28],   lootMul: 1.0, xpMul: 1.0, respawn: 60000 },
  { tier: 2, name: 'Brigands',  army: [35, 50],   lootMul: 2.0, xpMul: 1.5, respawn: 120000 },
  { tier: 3, name: 'Warband',   army: [60, 85],   lootMul: 4.0, xpMul: 2.5, respawn: 240000 },
  { tier: 4, name: 'Warlord',   army: [120, 160], lootMul: 10.0, xpMul: 5.0, respawn: 600000 },
];

export default class WorldRoom extends Room {
  maxClients = 500;
  state = new WorldState();
  patchRate = 50;

  // Crown config: build-up phase, claim radius, Sovereign bonuses
  static CROWN_BUILDUP_MS = 300000; // 5 min build-up (demo scale; production = 30 days)
  static CROWN_RADIUS = 50;
  static CROWN_HOLD_MS = 180000;    // 3 min hold to win (demo; production = 3 days Sovereign)
  static CROWN_BONUS = { gold: 1.5, gather: 1.3, research: 0.7 }; // Sovereign bonuses while holding

  onCreate() {
    // Spawn resource nodes: 8 of each type, scattered
    for (const t of ['gold', 'food', 'wood']) {
      for (let i = 0; i < 8; i++) {
        const n = new ResourceNode();
        n.id = `${t}-${i}`;
        n.type = t;
        n.x = 64 + Math.random() * (1024 - 128);
        n.y = 64 + Math.random() * (1024 - 128);
        n.amount = t === 'gold' ? 500 : 400;
        n.maxAmount = n.amount;
        this.state.nodes.set(n.id, n);
      }
    }
    // Spawn NPC camps — tiered difficulty ring
    // 4 T1 inner ring, 3 T2 mid ring, 2 T3 outer ring, 1 T4 boss
    const layout = [
      { tier: 0, count: 4, rad: [180, 260] },
      { tier: 1, count: 3, rad: [320, 400] },
      { tier: 2, count: 2, rad: [440, 480] },
      { tier: 3, count: 1, rad: [510, 510] },
    ];
    let campIdx = 0;
    layout.forEach((ring) => {
      const spec = CAMP_TIERS[ring.tier];
      for (let i = 0; i < ring.count; i++) {
        const ang = (campIdx / 10) * Math.PI * 2 + Math.random() * 0.4;
        const rad = ring.rad[0] + Math.random() * (ring.rad[1] - ring.rad[0]);
        const camp = new Camp();
        const army = spec.army[0] + Math.floor(Math.random() * (spec.army[1] - spec.army[0] + 1));
        camp.id = `camp-${campIdx}`;
        camp.name = `${spec.name}${ring.tier === 3 ? ' Stronghold' : ' Camp'}`;
        camp.tier = spec.tier;
        camp.x = Math.max(60, Math.min(964, 512 + Math.cos(ang) * rad));
        camp.y = Math.max(60, Math.min(964, 512 + Math.sin(ang) * rad));
        camp.maxArmy = army;
        camp.army = army;
        camp.lootGold = Math.round((120 + army * 6) * spec.lootMul);
        camp.lootWood = Math.round((60 + army * 4) * spec.lootMul);
        this.state.camps.set(camp.id, camp);
        campIdx++;
      }
    });
    this.clock.setInterval(() => this.state.serverTime = Date.now(), 1000);
    this.clock.setInterval(() => this.processBuilds(), 500);
    this.clock.setInterval(() => this.broadcast('rank', this.getRankings()), 2000);
    this.clock.setInterval(() => this.state.players.forEach((p) => this.tickPlayer(p)), 250);
    // Move march entities toward targets
    this.clock.setInterval(() => this.tickMarches(), 100);
    // Auto-save all players every 30s
    this.clock.setInterval(() => {
      this.state.players.forEach((p) => savePlayer(p));
    }, 30000);
    // World upkeep: regenerate nodes, respawn camps, manage Crown
    this.clock.setInterval(() => {
      // Activate Crown after build-up phase
      if (!this.state.crownActive && this.state.serverTime >= WorldRoom.CROWN_BUILDUP_MS) {
        this.state.crownActive = true;
        const msg = '👑 The Crown awakens! March to the center to claim it!';
        this.state.battleLog.push(msg);
        if (this.state.battleLog.length > 10) this.state.battleLog.shift();
        this.broadcast('battle', { text: msg });
        this.broadcast('battleLog', this.state.battleLog.slice());
      }
      // Check if Crown holder has held long enough for Sovereignty
      if (this.state.crownHolder && this.state.crownClaimedAt > 0) {
        const heldFor = Date.now() - this.state.crownClaimedAt;
        if (heldFor >= WorldRoom.CROWN_HOLD_MS) {
          const msg = `👑👑 ${this.state.crownHolder} is now SOVEREIGN of the Realm! Victory!`;
          this.state.battleLog.push(msg);
          if (this.state.battleLog.length > 10) this.state.battleLog.shift();
          this.broadcast('battle', { text: msg });
          this.broadcast('battleLog', this.state.battleLog.slice());
          this.broadcast('crownVictory', { name: this.state.crownHolder });
          // Reset Crown for next contender
          this.state.crownHolder = '';
          this.state.crownClaimedAt = 0;
        }
      }
      // Regenerate nodes
      this.state.nodes.forEach((n) => {
        if (n.amount < n.maxAmount) {
          n.amount = Math.min(n.maxAmount, n.amount + Math.ceil(n.maxAmount * 0.05));
        }
      });
      this.state.camps.forEach((camp) => {
        if (!camp.alive && Date.now() >= camp.respawnAt) {
          camp.alive = true;
          camp.army = camp.maxArmy;
        }
      });
    }, 10000);
    this.onMessage('build', (c, d) => this.handleBuild(c, d));
    this.onMessage('move', (c, d) => this.move(c, d));
    this.onMessage('stop', (c) => this.stop(c));
    this.onMessage('attack', (c, d) => this.attack(c, d));
    this.onMessage('research', (c) => this.handleResearch(c));
    this.onMessage('chat', (c, d) => this.handleChat(c, d));
    this.onMessage('train', (c, d) => this.handleTrain(c, d));
    this.onMessage('claimCrown', (c) => this.claimCrown(c));
  }

  // The Crown: center monument. Build-up phase, then claimable.
  // First player to stand on it for CROWN_HOLD_MS becomes Sovereign.
  claimCrown(c) {
    if (rateLimited(c.sessionId, 'attack')) return; // reuse attack cooldown
    if (!this.state.crownActive) {
      c.send('battle', { text: '👑 The Crown is dormant. Build-up phase not over.' });
      return;
    }
    if (this.state.crownHolder) {
      c.send('battle', { text: `👑 ${this.state.crownHolder} holds The Crown! Defeat them first.` });
      return;
    }
    const p = this.state.players.get(c.sessionId);
    if (!p || p.army < 10) {
      c.send('battle', { text: '👑 Need at least 10 troops to claim The Crown.' });
      return;
    }
    const dist = Math.hypot(p.x - 512, p.y - 512);
    if (dist > 80) {
      c.send('battle', { text: '👑 Must be at the center to claim The Crown.' });
      return;
    }
    this.state.crownHolder = p.name;
    this.state.crownClaimedAt = Date.now();
    const msg = `👑 ${p.name} has claimed The Crown! Holding for Sovereignty...`;
    this.state.battleLog.push(msg);
    if (this.state.battleLog.length > 10) this.state.battleLog.shift();
    this.broadcast('battle', { text: msg });
    this.broadcast('battleLog', this.state.battleLog.slice());
  }

  handleTrain(c, d) {
    if (rateLimited(c.sessionId, 'train')) return;
    const p = this.state.players.get(c.sessionId);
    if (!p || p.barracksLvl < 1) return;
    const troopType = (d?.troopType && TROOP_TYPES.includes(d.troopType)) ? d.troopType : 'infantry';
    const totalArmy = p.infantry + p.archers + p.cavalry;
    const cost = 20 * (1 + totalArmy); // food, scales with army size
    if (p.food < cost) return;
    p.food -= cost;
    p[troopType] += 1;
    p.army = p.infantry + p.archers + p.cavalry;
    this.gainXP(p, 5);
    c.send('train', { army: p.army, troopType });
  }

  handleChat(c, d) {
    if (rateLimited(c.sessionId, 'chat')) return;
    const pid = c.sessionId;
    const player = this.state.players.get(pid);
    if (!player) return;
    this.broadcast('chat', { name: player.name, message: d.message, timestamp: Date.now() });
  }

  getRankings() {
    return Array.from(this.state.players.values())
      .map(p => ({ name: p.name, level: p.level, score: p.gold + p.army * 10 + p.level * 500 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // XP progression: linear thresholds, +50g reward per level-up
  gainXP(p, amt) {
    if (!p) return;
    p.xp += amt;
    let leveled = false;
    while (p.xp >= p.level * 100) {
      p.xp -= p.level * 100;
      p.level += 1;
      p.gold += 50 * p.level;
      leveled = true;
    }
    if (leveled) this.broadcast('levelup', { name: p.name, level: p.level });
  }

  processBuilds() {
    const now = Date.now();
    for (const [pid, b] of PENDING.entries()) {
      if (now >= b.finish) {
        const p = this.state.players.get(pid);
        if (p) {
          p[LEVEL_FIELD[b.kind]] = (p[LEVEL_FIELD[b.kind]] || 0) + 1;
          this.gainXP(p, 25);
          this.broadcast('built', { kind: b.kind, lvl: p[LEVEL_FIELD[b.kind]] });
        }
        PENDING.delete(pid);
      }
    }
    this.broadcast('buildProgress', Array.from(PENDING.entries()).map(([pid, b]) => ({
      pid, kind: b.kind, finish: b.finish
    })));
  }

  handleBuild(c, d) {
    if (rateLimited(c.sessionId, 'build')) return;
    const p = this.state.players.get(c.sessionId);
    if (!p || !BUILDINGS[d.kind]) return;
    const b = BUILDINGS[d.kind];
    const lvl = p[LEVEL_FIELD[d.kind]] || 0;
    const cost = { gold: Math.round(b.gold * (lvl + 1)), wood: Math.round(b.wood * (lvl + 1)) };
    if (p.gold < cost.gold || p.wood < cost.wood) return;
    p.gold -= cost.gold;
    p.wood -= cost.wood;
    PENDING.set(c.sessionId, { kind: d.kind, lvl: lvl + 1, finish: Date.now() + b.duration });
    c.send('buildStart', { kind: d.kind, lvl: lvl + 1, duration: b.duration });
  }

  handleResearch(c) {
    if (rateLimited(c.sessionId, 'research')) return;
    const p = this.state.players.get(c.sessionId);
    if (!p || p.smithyLvl < 1) return;
    const fb = FACTION_BONUS[p.faction] || FACTION_BONUS.sultan;
    const lvl = p.researchLvl || 0;
    const cost = { gold: 200 * (lvl + 1), wood: 200 * (lvl + 1) };
    if (p.gold < cost.gold || p.wood < cost.wood) return;
    p.gold -= cost.gold;
    p.wood -= cost.wood;
    const duration = Math.round(10000 * fb.research);
    PENDING.set(c.sessionId, { kind: 'lab', lvl: lvl + 1, finish: Date.now() + duration });
    this.gainXP(p, 30);
    c.send('buildStart', { kind: 'lab', lvl: lvl + 1, duration });
  }

  move(c, d) {
    if (rateLimited(c.sessionId, 'move')) return;
    const p = this.state.players.get(c.sessionId);
    if (!p) return;
    p.targetX = Math.max(0, Math.min(1024, d.x));
    p.targetY = Math.max(0, Math.min(1024, d.y));
    p.isMoving = true;
    p.gatheringNodeId = '';
  }

  stop(c) {
    const p = this.state.players.get(c.sessionId);
    if (p) { p.isMoving = false; p.gatheringNodeId = ''; }
  }

  attack(c, d) {
    if (rateLimited(c.sessionId, 'attack')) return;
    const acc = this.state.players.get(c.sessionId);
    if (!acc || acc.army <= 0) return;
    // Can only have 1 active march
    const hasMarch = Array.from(this.state.marches.values()).some(m => m.ownerId === c.sessionId && !m.returning);
    if (hasMarch) {
      c.send('battle', { text: '⚔️ You already have a marching army. Wait for it to return.' });
      return;
    }
    const fb = FACTION_BONUS[acc.faction] || FACTION_BONUS.sultan;
    let targetX, targetY, targetType, targetId;
    const def = this.state.players.get(d.target);
    if (def) {
      if (acc === def) return;
      targetType = 'player';
      targetId = d.target;
      targetX = def.x;
      targetY = def.y;
    } else {
      const camp = this.state.camps.get(d.target);
      if (!camp || !camp.alive) return;
      targetType = 'camp';
      targetId = d.target;
      targetX = camp.x;
      targetY = camp.y;
    }
    const dist = Math.hypot(targetX - acc.x, targetY - acc.y);
    if (dist > 800) return;
    // Create march entity — all troops go
    const march = new March();
    march.id = `march-${c.sessionId}-${Date.now()}`;
    march.ownerId = c.sessionId;
    march.ownerName = acc.name;
    march.faction = acc.faction;
    march.fromX = acc.x;
    march.fromY = acc.y;
    march.toX = targetX;
    march.toY = targetY;
    march.x = acc.x;
    march.y = acc.y;
    march.targetId = targetId;
    march.targetType = targetType;
    march.infantry = acc.infantry;
    march.archers = acc.archers;
    march.cavalry = acc.cavalry;
    march.totalArmy = acc.army;
    march.speed = 8 * fb.march;
    march.createdAt = Date.now();
    // Troops leave the castle
    acc.infantry = 0;
    acc.archers = 0;
    acc.cavalry = 0;
    acc.army = 0;
    this.state.marches.set(march.id, march);
  }

  // Move marches toward targets, resolve on arrival
  tickMarches() {
    const toDelete = [];
    this.state.marches.forEach((march) => {
      if (march.arrived) return;
      const dx = march.toX - march.x;
      const dy = march.toY - march.y;
      const dist = Math.hypot(dx, dy);
      const step = march.speed;
      if (dist <= step) {
        march.x = march.toX;
        march.y = march.toY;
        march.arrived = true;
        if (!march.returning) {
          this.resolveMarchBattle(march);
        } else {
          // Survivors returned home
          const owner = this.state.players.get(march.ownerId);
          if (owner) {
            owner.infantry += march.infantry;
            owner.archers += march.archers;
            owner.cavalry += march.cavalry;
            owner.army = owner.infantry + owner.archers + owner.cavalry;
          }
          toDelete.push(march.id);
        }
      } else {
        march.x += (dx / dist) * step;
        march.y += (dy / dist) * step;
      }
    });
    toDelete.forEach(id => this.state.marches.delete(id));
  }

  // Rock-paper-scissors combat resolution
  // Effective power: each troop type gets 1.5x vs its counter, 0.6x vs its predator
  resolveMarchBattle(march) {
    let msg;
    const atkI = march.infantry, atkA = march.archers, atkC = march.cavalry;
    const def = this.state.players.get(march.targetId);
    if (def) {
      // --- PvP combat ---
      const defI = def.infantry, defA = def.archers, defC = def.cavalry;
      // Calculate effective attack power with RPS multipliers
      const atkPower = this.rpsPower(atkI, atkA, atkC, defI, defA, defC);
      const defPower = this.rpsPower(defI, defA, defC, atkI, atkA, atkC);
      const totalDef = defI + defA + defC;
      if (atkPower > defPower) {
        // Attacker wins — ratio of survivors
        const ratio = 1 - (defPower / atkPower) * 0.6;
        const surviveI = Math.round(atkI * ratio);
        const surviveA = Math.round(atkA * ratio);
        const surviveC = Math.round(atkC * ratio);
        march.infantry = surviveI;
        march.archers = surviveA;
        march.cavalry = surviveC;
        march.totalArmy = surviveI + surviveA + surviveC;
        const loot = Math.round(def.gold * 0.2);
        def.infantry = 0; def.archers = 0; def.cavalry = 0; def.army = 0;
        def.gold -= loot;
        // Send loot home with survivors
        const owner = this.state.players.get(march.ownerId);
        if (owner) owner.gold += loot;
        this.gainXP(owner, 40);
        // Crown drops if holder is zeroed
        if (this.state.crownHolder === def.name) {
          this.state.crownHolder = '';
          this.state.crownClaimedAt = 0;
          this.pushBattleLog(`👑 ${def.name} lost The Crown in defeat!`);
          this.broadcast('battle', { text: `👑 ${def.name} lost The Crown!` });
        }
        msg = `⚔️ ${march.ownerName} defeated ${def.name}! (+${loot}g)`;
        // Start return march
        this.startReturnMarch(march);
      } else {
        // Defender wins — attacker shattered
        const ratio = 1 - (atkPower / defPower) * 0.6;
        def.infantry = Math.round(defI * ratio);
        def.archers = Math.round(defA * ratio);
        def.cavalry = Math.round(defC * ratio);
        def.army = def.infantry + def.archers + def.cavalry;
        march.infantry = 0; march.archers = 0; march.cavalry = 0;
        march.totalArmy = 0;
        const owner = this.state.players.get(march.ownerId);
        this.gainXP(owner, 15);
        msg = `🛡️ ${def.name} repelled ${march.ownerName}!`;
        // No survivors to return — delete march
        this.state.marches.delete(march.id);
      }
    } else {
      // --- Camp combat ---
      const camp = this.state.camps.get(march.targetId);
      if (!camp || !camp.alive) { this.state.marches.delete(march.id); return; }
      const tierSpec = CAMP_TIERS[(camp.tier || 1) - 1] || CAMP_TIERS[0];
      const campPower = camp.army;
      const atkPower = march.totalArmy * 1.1; // players slightly stronger than camps
      if (atkPower > campPower) {
        const ratio = Math.max(0.3, 1 - (campPower / atkPower) * 0.5);
        march.infantry = Math.round(atkI * ratio);
        march.archers = Math.round(atkA * ratio);
        march.cavalry = Math.round(atkC * ratio);
        march.totalArmy = march.infantry + march.archers + march.cavalry;
        camp.alive = false;
        camp.army = 0;
        camp.respawnAt = Date.now() + tierSpec.respawn;
        const owner = this.state.players.get(march.ownerId);
        if (owner) {
          owner.gold += camp.lootGold;
          owner.wood += camp.lootWood;
          this.gainXP(owner, Math.round(50 * tierSpec.xpMul));
        }
        msg = `⚔️ ${march.ownerName} razed ${camp.name}! +${camp.lootGold}g +${camp.lootWood}w`;
        this.startReturnMarch(march);
      } else {
        const ratio = Math.max(0.2, 1 - (atkPower / campPower) * 0.5);
        camp.army = Math.round(campPower * ratio);
        march.infantry = Math.round(atkI * 0.3);
        march.archers = Math.round(atkA * 0.3);
        march.cavalry = Math.round(atkC * 0.3);
        march.totalArmy = march.infantry + march.archers + march.cavalry;
        const owner = this.state.players.get(march.ownerId);
        this.gainXP(owner, Math.round(15 * tierSpec.xpMul));
        msg = `🛡️ ${camp.name} repelled ${march.ownerName}!`;
        if (march.totalArmy > 0) this.startReturnMarch(march);
        else this.state.marches.delete(march.id);
      }
    }
    this.pushBattleLog(msg);
    this.broadcast('battle', { text: msg });
  }

  startReturnMarch(march) {
    if (march.totalArmy <= 0) {
      this.state.marches.delete(march.id);
      return;
    }
    march.returning = true;
    march.arrived = false;
    const owner = this.state.players.get(march.ownerId);
    if (owner) {
      march.toX = owner.x;
      march.toY = owner.y;
    } else {
      // Owner left — delete
      this.state.marches.delete(march.id);
    }
  }

  // Calculate effective combat power with rock-paper-scissors multipliers
  // Each attacking type gets 1.5x vs the type it counters, 0.6x vs its predator
  rpsPower(I, A, C, dI, dA, dC) {
    const totalDef = dI + dA + dC;
    if (totalDef === 0) return I + A + C;
    // Weight each attacking type's effectiveness against the defender composition
    const infEff = I * (1.5 * (dC / totalDef) + 0.6 * (dA / totalDef) + 1.0 * (dI / totalDef));
    const arcEff = A * (1.5 * (dI / totalDef) + 0.6 * (dC / totalDef) + 1.0 * (dA / totalDef));
    const cavEff = C * (1.5 * (dA / totalDef) + 0.6 * (dI / totalDef) + 1.0 * (dC / totalDef));
    return infEff + arcEff + cavEff;
  }

  pushBattleLog(msg) {
    this.state.battleLog.push(msg);
    if (this.state.battleLog.length > 10) this.state.battleLog.shift();
    this.broadcast('battleLog', this.state.battleLog.slice());
  }

  tickPlayer(p) {
    const fb = FACTION_BONUS[p.faction] || FACTION_BONUS.sultan;
    // Sovereign gets bonus gold/gather/research while holding the Crown
    const isSovereign = this.state.crownHolder === p.name;
    const crownMul = isSovereign ? WorldRoom.CROWN_BONUS : { gold: 1, gather: 1, research: 1 };
    if (p.isMoving) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = 15 * fb.march;
      if (dist <= step) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.isMoving = false;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
    if (p.isMoving) return;

    if (p.gatheringNodeId) {
      const node = this.state.nodes.get(p.gatheringNodeId);
      if (node && node.amount > 0) {
        const take = Math.min(node.amount, 10 * (1 + p.smithyLvl * 0.25) * fb.gather);
        node.amount -= take;
        if (node.type === 'gold') p.gold += take * crownMul.gold;
        else if (node.type === 'food') p.food += take;
        else p.wood += take * crownMul.gather;
        this.gainXP(p, 2);
      }
    }
  }

  onJoin(c, o) {
    // Try loading saved player from DB; create new if first time
    const saved = loadPlayer(o.name);
    const p = new Player();
    if (saved) {
      // Returning player — restore state
      p.name = saved.name;
      p.faction = saved.faction;
      p.gold = saved.gold;
      p.food = saved.food;
      p.wood = saved.wood;
      p.army = saved.army;
      p.infantry = saved.infantry || 0;
      p.archers = saved.archers || 0;
      p.cavalry = saved.cavalry || 0;
      p.xp = saved.xp;
      p.level = saved.level;
      p.castleLvl = saved.castleLvl;
      p.barracksLvl = saved.barracksLvl;
      p.smithyLvl = saved.smithyLvl;
      p.farmLvl = saved.farmLvl;
      p.mineLvl = saved.mineLvl;
      p.researchLvl = saved.researchLvl;
      p.x = saved.x;
      p.y = saved.y;
      p.createdAt = saved.createdAt;
      p.isReturning = true;
    } else {
      // New player
      p.name = o.name || `Player-${c.sessionId.slice(0, 6)}`;
      p.faction = FACTION_BONUS[o.faction] ? o.faction : 'sultan';
      p.x = 512 + (Math.random() * 200 - 100);
      p.y = 512 + (Math.random() * 200 - 100);
      p.createdAt = Date.now();
    }
    this.state.players.set(c.sessionId, p);
  }

  onLeave(c) {
    const p = this.state.players.get(c.sessionId);
    if (p) {
      savePlayer(p);
      console.log(`[DB] saved ${p.name} on disconnect`);
    }
    this.state.players.delete(c.sessionId);
    rateBuckets.delete(c.sessionId); // clean up rate-limit memory
  }
}