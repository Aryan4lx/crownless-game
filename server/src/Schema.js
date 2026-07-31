import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

// ── Player: synced to all clients ───────────────────────────────────
class Player extends Schema {
  constructor() {
    super();
    this.name = '';
    this.faction = '';
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.castleLvl = 1;
    this.isMoving = false;
    this.gold = 100;
    this.food = 50;
    this.wood = 50;
    this.gatheringNodeId = '';
    this.barracksLvl = 0;
    this.smithyLvl = 0;
    this.farmLvl = 0;
    this.mineLvl = 0;
    this.army = 0;
  }
}

defineTypes(Player, {
  name: 'string',
  faction: 'string',
  x: 'number',
  y: 'number',
  targetX: 'number',
  targetY: 'number',
  castleLvl: 'number',
  isMoving: 'boolean',
  gold: 'number',
  food: 'number',
  wood: 'number',
  gatheringNodeId: 'string',
  barracksLvl: 'number',
  smithyLvl: 'number',
  farmLvl: 'number',
  mineLvl: 'number',
  army: 'number',
});

// ── ResourceNode: world harvestable ─────────────────────────────────
class ResourceNode extends Schema {
  constructor() {
    super();
    this.id = '';
    this.type = 'gold'; // gold | food | wood
    this.x = 0;
    this.y = 0;
    this.amount = 0;
  }
}

defineTypes(ResourceNode, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  amount: 'number',
});

// ── WorldState: the room state ──────────────────────────────────────
class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.nodes = new MapSchema();
    this.serverTime = 0;
  }
}

defineTypes(WorldState, {
  players: { map: Player },
  nodes: { map: ResourceNode },
  serverTime: 'number',
});

export { Player, ResourceNode, WorldState };
