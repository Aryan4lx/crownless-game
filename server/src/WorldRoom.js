import { Room } from 'colyseus';
import { WorldState, Player, ResourceNode } from './Schema.js';

const BUILDINGS = {
  barracks: { label: '⚡', gold: 100, wood: 50, duration: 5000 },
  smithy:   { label: '🔨', gold: 150, wood: 100, duration: 6000 },
  farm:     { label: '🌾', gold: 80,  wood: 0,   duration: 4000 },
  mine:     { label: '⛏️', gold: 120, wood: 0,   duration: 5500 },
};

const LEVEL_FIELD = { barracks: 'barracksLvl', smithy: 'smithyLvl', farm: 'farmLvl', mine: 'mineLvl' };
const costFor = (b, lvl) => ({ gold: Math.round(b.gold * (lvl + 1)), wood: Math.round(b.wood * (lvl + 1)) });
const PENDING = new Map();

export default class WorldRoom extends Room {
  maxClients = 500;
  state = new WorldState();
  patchRate = 50;

  onCreate() {
    for (const t of ['gold','food','wood']) {
      const ids = new Map();
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
    this.clock.setInterval(() => this.state.players.forEach((p) => this.tickPlayer(p)), 250);
    this.clock.setInterval(() => {
      this.state.players.forEach((p) => {
        p.gold += 5 + p.mineLvl * 10;
        p.food += 2 + p.farmLvl * 8;
        p.wood += 2;
        p.army = Math.min(p.army + p.barracksLvl * 2, p.barracksLvl * 100);
      });
    }, 5000);
    this.onMessage('build', (c, d) => this.build(c, d));
    this.onMessage('move', (c, d) => this.move(c, d));
    this.onMessage('stop', (c) => this.stop(c));
    this.onMessage('attack', (c, d) => this.attack(c, d));
  }

  processBuilds() {
    const now = Date.now();
    for (const [pid, b] of PENDING.entries()) {
      if (now >= b.finish) {
        const p = this.state.players.get(pid);
        if (p) {
          p[LEVEL_FIELD[b.kind]] = b.lvl;
          this.broadcast('built', { kind: b.kind, lvl: b.lvl });
        }
        PENDING.delete(pid);
      }
    }
  }

  build(c, d) {
    const pid = c.sessionId;
    const p = this.state.players.get(pid);
    if (!p || !BUILDINGS[d.kind]) return;
    const b = BUILDINGS[d.kind];
    const lvl = p[LEVEL_FIELD[d.kind]];
    const cost = costFor(b, lvl);
    if (p.gold < cost.gold || p.wood < cost.wood) return;
    p.gold -= cost.gold;
    p.wood -= cost.wood;
    PENDING.set(pid, { kind: d.kind, lvl: lvl + 1, finish: Date.now() + b.duration });
    c.send('buildStart', { kind: d.kind, lvl: lvl + 1, duration: b.duration });
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
    if (p.isMoving) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = 15; // 60px/s * 0.25s
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

    // Gather
    if (!p.gatheringNodeId) {
      let best = null, bestDist = 30;
      this.state.nodes.forEach((n) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bestDist) { bestDist = d; best = n; }
      });
      if (best) p.gatheringNodeId = best.id;
    }
    if (p.gatheringNodeId) {
      const node = this.state.nodes.get(p.gatheringNodeId);
      if (node && node.amount > 0) {
        const take = Math.min(node.amount, 10 * (1 + p.smithyLvl * 0.25));
        node.amount -= take;
        if (node.type === 'gold') p.gold += take;
        else if (node.type === 'food') p.food += take;
        else p.wood += take;
        if (node.amount <= 0) { this.state.nodes.delete(node.id); p.gatheringNodeId = ''; }
      } else {
        p.gatheringNodeId = '';
      }
    }
  }

  resolveBattle(attacker) {
    const defender = this.state.players.get(attacker.attackTarget);
    attacker.attackTarget = '';
    if (!defender) return;

    const atk = attacker.army, def = defender.army;
    let msg;
    if (atk > def) {
      const lost = Math.round(atk * 0.3);
      attacker.army = atk - lost;
      const loot = Math.round(defender.gold * 0.2);
      defender.army = 0;
      defender.gold -= loot;
      attacker.gold += loot;
      msg = `⚔️ ${attacker.name} defeated ${defender.name}! Looted ${loot} gold.`;
    } else {
      attacker.army = Math.max(0, Math.round(atk * 0.2));
      defender.army = Math.max(0, def - Math.round(def * 0.4));
      msg = `🛡️ ${defender.name} repelled ${attacker.name}'s attack!`;
    }
    this.broadcast('battle', { text: msg });
  }

  onJoin(c, o) {
    const p = new Player();
    p.name = o.name || `Player-${c.sessionId.slice(0, 6)}`;
    p.faction = o.faction || 'sultan';
    p.x = 512 + (Math.random() * 200 - 100);
    p.y = 512 + (Math.random() * 200 - 100);
    this.state.players.set(c.sessionId, p);
  }

  onLeave(c) {
    this.state.players.delete(c.sessionId);
    PENDING.delete(c.sessionId);
  }
}