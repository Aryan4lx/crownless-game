import { Room } from 'colyseus';
import { WorldState, Player, ResourceNode } from './Schema.js';

const MAP_SIZE = 1024;
const SPEED = 60;            // px per second
const SIM_TICK_MS = 250;     // movement + gathering sim
const GATHER_RADIUS = 30;    // px
const GATHER_PER_TICK = 10;  // units per 250ms

const NODE_SPAWNS = [
  { type: 'gold', count: 8, amount: 500 },
  { type: 'food', count: 8, amount: 400 },
  { type: 'wood', count: 8, amount: 400 },
];

// Building costs scale with next level: cost(level) = base * (level + 1)
const BUILDINGS = {
  barracks: { label: 'Barracks', icon: '⚔️', gold: 100, wood: 50, desc: 'Trains army (2/s per level)' },
  smithy:   { label: 'Smithy',   icon: '🔨', gold: 150, wood: 100, desc: '+25% gather speed per level' },
  farm:     { label: 'Farm',     icon: '🌾', gold: 80,  wood: 0,   desc: '+8 food per 5s per level' },
  mine:     { label: 'Mine',     icon: '⛏️', gold: 120, wood: 0,   desc: '+10 gold per 5s per level' },
};

const LEVEL_FIELD = {
  barracks: 'barracksLvl',
  smithy: 'smithyLvl',
  farm: 'farmLvl',
  mine: 'mineLvl',
};

const costFor = (building, level) => ({
  gold: Math.round(building.gold * (level + 1)),
  wood: Math.round(building.wood * (level + 1)),
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class WorldRoom extends Room {
  maxClients = 500;
  state = new WorldState();
  patchRate = 50; // 20 patches/sec

  onCreate(options) {
    console.log(`[${new Date().toISOString()}] WorldRoom created`);
    this.spawnNodes();

    this.clock.setInterval(() => {
      this.state.serverTime = Date.now();
    }, 1000);

    // Movement + gathering simulation
    this.clock.setInterval(() => {
      this.state.players.forEach((p) => this.tickPlayer(p));
    }, SIM_TICK_MS);

    // Passive economy production (castle production)
    this.clock.setInterval(() => {
      this.state.players.forEach((p) => {
        p.gold += p.castleLvl * 5 + p.mineLvl * 10;
        p.food += p.castleLvl * 2 + p.farmLvl * 8;
        p.wood += p.castleLvl * 2;
        p.army = Math.min(p.army + p.barracksLvl * 2, p.barracksLvl * 100);
      });
    }, 5000);

    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.targetX = clamp(data.x, 0, MAP_SIZE);
      player.targetY = clamp(data.y, 0, MAP_SIZE);
      player.isMoving = true;
      player.gatheringNodeId = ''; // moving cancels gathering
    });

    this.onMessage('build', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !BUILDINGS[data.building]) return;
      const b = BUILDINGS[data.building];
      const field = LEVEL_FIELD[data.building];
      const level = player[field];
      const cost = costFor(b, level);
      if (player.gold < cost.gold || player.wood < cost.wood) return;
      player.gold -= cost.gold;
      player.wood -= cost.wood;
      player[field] = level + 1;
      client.send('built', { building: data.building, level: level + 1 });
      console.log(`[${client.sessionId}] built ${data.building} → lvl ${level + 1}`);
    });

    this.onMessage('attack', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      const target = this.state.players.get(data.target);
      if (!player || !target || target === player) return;
      if (player.army <= 0) return;
      if (Math.hypot(target.x - player.x, target.y - player.y) > 600) return; // range limit
      player.attackTarget = data.target;
      player.targetX = target.x;
      player.targetY = target.y;
      player.isMoving = true;
      player.gatheringNodeId = '';
      console.log(`[${client.sessionId}] ${player.name} attacks ${target.name}`);
    });

    this.onMessage('stop', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isMoving = false;
        player.gatheringNodeId = '';
        player.attackTarget = '';
      }
    });
  }

  spawnNodes() {
    let id = 0;
    for (const { type, count, amount } of NODE_SPAWNS) {
      for (let i = 0; i < count; i++) {
        const node = new ResourceNode();
        node.id = `${type}-${id++}`;
        node.type = type;
        node.x = 64 + Math.random() * (MAP_SIZE - 128);
        node.y = 64 + Math.random() * (MAP_SIZE - 128);
        node.amount = amount;
        this.state.nodes.set(node.id, node);
      }
    }
    console.log(`[nodes] spawned ${this.state.nodes.size} resource nodes`);
  }

  tickPlayer(p) {
    // Server-side movement toward target
    if (p.isMoving) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = (SPEED * SIM_TICK_MS) / 1000;
      if (dist <= step) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.isMoving = false;
        // Arrived at an attack target → resolve battle
        if (p.attackTarget) this.resolveBattle(p);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }

    // Gathering: only when stationary
    if (p.isMoving) return;

    if (!p.gatheringNodeId) {
      // Find nearest node within gather radius
      let best = null;
      let bestDist = GATHER_RADIUS;
      this.state.nodes.forEach((n) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      });
      if (best) p.gatheringNodeId = best.id;
    }

    if (p.gatheringNodeId) {
      const node = this.state.nodes.get(p.gatheringNodeId);
      if (node && node.amount > 0) {
        const take = Math.min(node.amount, GATHER_PER_TICK * (1 + p.smithyLvl * 0.25));
        node.amount -= take;
        if (node.type === 'gold') p.gold += take;
        else if (node.type === 'food') p.food += take;
        else p.wood += take;
        if (node.amount <= 0) {
          this.state.nodes.delete(node.id);
          p.gatheringNodeId = '';
        }
      } else {
        p.gatheringNodeId = '';
      }
    }
  }

  resolveBattle(attacker) {
    const defender = this.state.players.get(attacker.attackTarget);
    attacker.attackTarget = '';
    if (!defender) return; // target left mid-march

    const atk = attacker.army;
    const def = defender.army;
    let msg;

    if (atk > def) {
      // Attacker wins: defender army wiped, attacker loses 30%, loot 20% gold
      const lost = Math.round(atk * 0.3);
      attacker.army = atk - lost;
      const loot = Math.round(defender.gold * 0.2);
      defender.army = 0;
      defender.gold -= loot;
      attacker.gold += loot;
      msg = `⚔️ ${attacker.name} defeated ${defender.name}! Looted ${loot} gold.`;
    } else {
      // Defender holds: attacker routed (loses 80%), defender loses 40%
      attacker.army = Math.max(0, Math.round(atk * 0.2));
      defender.army = Math.max(0, def - Math.round(def * 0.4));
      msg = `🛡️ ${defender.name} repelled ${attacker.name}'s attack!`;
    }

    console.log(`[battle] ${msg}`);
    this.broadcast('battle', { text: msg });
  }

  onJoin(client, options) {
    const player = new Player();
    player.name = options.name || `Player-${client.sessionId.slice(0, 6)}`;
    player.faction = options.faction || 'sultan';
    player.x = 512 + (Math.random() * 200 - 100);
    player.y = 512 + (Math.random() * 200 - 100);
    this.state.players.set(client.sessionId, player);
    console.log(`[${client.sessionId}] ${player.name} (${player.faction}) joined at (${player.x}, ${player.y})`);
  }

  onLeave(client, consented) {
    this.state.players.delete(client.sessionId);
    console.log(`[${client.sessionId}] Player left`);
  }

  onDispose() {
    console.log('WorldRoom disposed');
  }
}
