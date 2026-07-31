import { Room, Server } from 'colyseus';
import { WorldState, Player } from './Schema.js';

export class WorldRoom extends Room {
  maxClients = 500;
  state = new WorldState();
  patchRate = 50; // 20 ticks/sec

  onCreate(options) {
    console.log(`[${new Date().toISOString()}] WorldRoom created`);

    this.clock.setInterval(() => {
      this.state.serverTime = Date.now();
    }, 1000);

    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.isMoving = true;
      }
    });

    this.onMessage('stop', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.isMoving = false;
    });
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
