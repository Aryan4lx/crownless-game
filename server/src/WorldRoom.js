import { Room } from 'colyseus';
import { WorldState, Player, ResourceNode } from './Schema.js';

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
        this.state.nodes.set(n.id, n);
      }
    }
    this.clock.setInterval(() => this.state.serverTime = Date.now(), 1000);
    this.clock.setInterval(() => this.processBuilds(), 500);
    this.clock.setInterval(() => this.broadcast('rank', this.getRankings()), 2000);
    this.clock.setInterval(() => this.state.players.forEach((p) => this.tickPlayer(p)), 250);
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
      .map(p => ({ name: p.name, score: p.gold + p.army * 10 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  processBuilds() {
    const now = Date.now();
    for (const [pid, b] of PENDING.entries()) {
      if (now >= b.finish) {
        const p = this.state.players.get(pid);
        if (p) {
          p[LEVEL_FIELD[b.kind]] = (p[LEVEL_FIELD[b.kind]] || 0) + 1;
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
    const def = this.state.players.get(d.target);
    if (!acc || !def || acc === def || acc.army <= 0) return;
    const dist = Math.hypot(def.x - acc.x, def.y - acc.y);
    if (dist > 600) return;
    acc.attackTarget = d.target;
    acc.targetX = def.x;
    acc.targetY = def.y;
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
      }
    }
  }

  resolveBattle(attacker) {
    const defender = this.state.players.get(attacker.attackTarget);
    attacker.attackTarget = '';
    if (!defender) return;
    const atk = attacker.army, def = defender.army;
    if (atk > def) {
      attacker.army -= Math.round(atk * 0.3);
      const loot = Math.round(defender.gold * 0.2);
      defender.army = 0;
      defender.gold -= loot;
      attacker.gold += loot;
      this.broadcast('battle', { text: `⚔️ ${attacker.name} defeated ${defender.name}!` });
    } else {
      attacker.army = Math.max(0, Math.round(atk * 0.2));
      defender.army = Math.max(0, def - Math.round(def * 0.4));
      this.broadcast('battle', { text: `🛡️ ${defender.name} defended!` });
    }
  }

  onJoin(c, o) {
    const p = new Player();
    p.name = o.name || `Player-${c.sessionId.slice(0, 6)}`;
    p.faction = FACTION_BONUS[o.faction] ? o.faction : 'sultan';
    p.x = 512 + (Math.random() * 200 - 100);
    p.y = 512 + (Math.random() * 200 - 100);
    this.state.players.set(c.sessionId, p);
  }
}