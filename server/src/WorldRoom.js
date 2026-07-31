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
        p.gold += p.castleLvl * 5;
        p.food += p.castleLvl * 2;
        p.wood += p.castleLvl * 2;
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

    this.onMessage('stop', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isMoving = false;
        player.gatheringNodeId = '';
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
        const take = Math.min(node.amount, GATHER_PER_TICK);
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
