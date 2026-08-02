import { Room } from 'colyseus';
import { WorldState, Player, ResourceNode, Camp } from './Schema.js';
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

// Faction asymmetries: economic / military / speed identity
const FACTION_BONUS = {
  sultan: { label: 'Silk Road', gold: 1.1, gather: 1.0, march: 1.0, research: 0.8 },
  tsar:   { label: 'Amur Guard', gold: 1.0, gather: 1.05, march: 1.0, research: 1.0 },
  king:   { label: 'Knight Orders', gold: 1.0, gather: 1.0, march: 1.2, research: 1.0 },
  khan:   { label: 'Steppe Horde', gold: 1.0, gather: 1.15, march: 1.25, research: 1.0 },
};

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
    // Auto-save all players every 30s
    this.clock.setInterval(() => {
      this.state.players.forEach((p) => savePlayer(p));
    }, 30000);
    // World upkeep: regenerate nodes + respawn camps
    this.clock.setInterval(() => {
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
    this.onMessage('train', (c) => this.handleTrain(c));
  }

  handleTrain(c) {
    const p = this.state.players.get(c.sessionId);
    if (!p || p.barracksLvl < 1) return;
    const cost = 20 * (1 + p.army); // food, scales with army size
    if (p.food < cost) return;
    p.food -= cost;
    p.army += 1;
    this.gainXP(p, 5);
    c.send('train', { army: p.army });
  }

  handleChat(c, d) {
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
    const acc = this.state.players.get(c.sessionId);
    if (!acc || acc.army <= 0) return;
    const def = this.state.players.get(d.target);
    if (def) {
      if (acc === def) return;
      const dist = Math.hypot(def.x - acc.x, def.y - acc.y);
      if (dist > 600) return;
      acc.attackTarget = d.target;
      acc.targetX = def.x;
      acc.targetY = def.y;
    } else {
      const camp = this.state.camps.get(d.target);
      if (!camp || !camp.alive) return;
      const dist = Math.hypot(camp.x - acc.x, camp.y - acc.y);
      if (dist > 600) return;
      acc.attackTarget = d.target;
      acc.targetX = camp.x;
      acc.targetY = camp.y;
    }
    acc.isMoving = true;
    acc.gatheringNodeId = '';
  }

  tickPlayer(p) {
    const fb = FACTION_BONUS[p.faction] || FACTION_BONUS.sultan;
    if (p.isMoving) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = 15 * fb.march;
      if (dist <= step) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.isMoving = false;
        if (p.attackTarget) this.resolveBattle(p);
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
        if (node.type === 'gold') p.gold += take;
        else if (node.type === 'food') p.food += take;
        else p.wood += take;
        this.gainXP(p, 2);
      }
    }
  }

  resolveBattle(attacker) {
    const targetId = attacker.attackTarget;
    attacker.attackTarget = '';
    if (!targetId) return;
    let msg;
    const def = this.state.players.get(targetId);
    if (def) {
      const atk = attacker.army, defA = def.army;
      if (atk > defA) {
        attacker.army -= Math.round(atk * 0.3);
        const loot = Math.round(def.gold * 0.2);
        def.army = 0;
        def.gold -= loot;
        attacker.gold += loot;
        this.gainXP(attacker, 40);
        msg = `⚔️ ${attacker.name} defeated ${def.name}!`;
      } else {
        attacker.army = Math.max(0, Math.round(atk * 0.2));
        def.army = Math.max(0, defA - Math.round(defA * 0.4));
        this.gainXP(attacker, 15);
        msg = `🛡️ ${def.name} defended!`;
      }
    } else {
      const camp = this.state.camps.get(targetId);
      if (!camp || !camp.alive) return;
      const atk = attacker.army, defA = camp.army;
      const tierSpec = CAMP_TIERS[(camp.tier || 1) - 1] || CAMP_TIERS[0];
      if (atk > defA) {
        attacker.army -= Math.round(atk * 0.25);
        camp.alive = false;
        camp.army = 0;
        camp.respawnAt = Date.now() + tierSpec.respawn;
        attacker.gold += camp.lootGold;
        attacker.wood += camp.lootWood;
        this.gainXP(attacker, Math.round(50 * tierSpec.xpMul));
        msg = `⚔️ ${attacker.name} razed ${camp.name}! +${camp.lootGold}g +${camp.lootWood}w`;
      } else {
        attacker.army = Math.max(0, Math.round(atk * 0.3));
        camp.army = Math.max(0, defA - Math.round(defA * 0.3));
        this.gainXP(attacker, Math.round(15 * tierSpec.xpMul));
        msg = `🛡️ ${camp.name} repelled ${attacker.name}!`;
      }
    }
    this.state.battleLog.push(msg);
    if (this.state.battleLog.length > 10) this.state.battleLog.shift();
    this.broadcast('battle', { text: msg });
    this.broadcast('battleLog', this.state.battleLog.slice());
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
  }
}