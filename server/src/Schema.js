import { Schema, MapSchema, type, defineTypes } from '@colyseus/schema';

// ── Player: synced to all clients ───────────────────────────────────
class Player extends Schema {
  constructor() {
    super();
    this.name = '';
    this.faction = '';
    this.x = 0;
    this.y = 0;
    this.castleLvl = 1;
    this.isMoving = false;
  }
}

defineTypes(Player, {
  name: 'string',
  faction: 'string',
  x: 'number',
  y: 'number',
  castleLvl: 'number',
  isMoving: 'boolean',
});

// ── WorldState: the room state ──────────────────────────────────────
class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.serverTime = 0;
  }
}

defineTypes(WorldState, {
  players: { map: Player },
  serverTime: 'number',
});

export { Player, WorldState };
