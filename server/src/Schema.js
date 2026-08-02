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
    this.attackTarget = '';
    this.researchLvl = 0;
    this.barracksLvl = 0;
    this.smithyLvl = 0;
    this.farmLvl = 0;
    this.mineLvl = 0;
    this.army = 0;
    this.xp = 0;
    this.level = 1;
    this.createdAt = 0;
    this.isReturning = false;
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
  attackTarget: 'string',
  barracksLvl: 'number',
  smithyLvl: 'number',
  farmLvl: 'number',
  mineLvl: 'number',
  researchLvl: 'number',
  army: 'number',
  xp: 'number',
  level: 'number',
  createdAt: 'number',
  isReturning: 'boolean',
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
    this.maxAmount = 0;
  }
}

defineTypes(ResourceNode, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  amount: 'number',
  maxAmount: 'number',
});

// ── Camp: neutral PvE target ────────────────────────────────────────
class Camp extends Schema {
  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.tier = 1;
    this.x = 0;
    this.y = 0;
    this.army = 30;
    this.maxArmy = 30;
    this.lootGold = 150;
    this.lootWood = 100;
    this.alive = true;
    this.respawnAt = 0;
  }
}

defineTypes(Camp, {
  id: 'string',
  name: 'string',
  tier: 'number',
  x: 'number',
  y: 'number',
  army: 'number',
  maxArmy: 'number',
  lootGold: 'number',
  lootWood: 'number',
  alive: 'boolean',
  respawnAt: 'number',
});

// ── WorldState: the room state ──────────────────────────────────────
class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.nodes = new MapSchema();
    this.camps = new MapSchema();
    this.serverTime = 0;
    this.battleLog = [];
  }
}

defineTypes(WorldState, {
  players: { map: Player },
  nodes: { map: ResourceNode },
  camps: { map: Camp },
  serverTime: 'number',
  battleLog: ['string'],
});

export { Player, ResourceNode, Camp, WorldState };
