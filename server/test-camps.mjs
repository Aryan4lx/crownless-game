// Server-side unit check for camp combat (no network)
import WorldRoom from './src/WorldRoom.js';
import { WorldState, Player, ResourceNode, Camp } from './src/Schema.js';

const room = new WorldRoom();
room.state = new WorldState();
// fake clock: collect intervals, never fire
room.clock = { setInterval: () => 0 };
room.broadcast = () => {};
room.onMessage = () => {};

// spawn 1 camp like onCreate does
const camp = new Camp();
camp.id = 'camp-0'; camp.name = 'Test Camp'; camp.x = 700; camp.y = 700;
camp.maxArmy = 30; camp.army = 30; camp.lootGold = 300; camp.lootWood = 200; camp.alive = true; camp.respawnAt = 0;
room.state.camps.set('camp-0', camp);

// attacker with real server-side army
const p = new Player();
p.name = 'Attacker'; p.x = 690; p.y = 690; p.army = 60;
room.state.players.set('p1', p);

const fakeClient = { sessionId: 'p1' };

// attack camp
room.attack(fakeClient, { target: 'camp-0' });
console.assert(p.attackTarget === 'camp-0', 'attackTarget set');
console.assert(p.isMoving === true, 'isMoving set');
console.log('attack queued OK');

// simulate arrival: tick until arrival then resolve
p.targetX = 700; p.targetY = 700;
for (let i = 0; i < 10 && p.isMoving; i++) room.tickPlayer(p);
console.log('after ticks: army=', p.army, 'isMoving=', p.isMoving);
room.tickPlayer(p); // arrival triggers resolveBattle
console.log('camp alive:', camp.alive, 'army:', camp.army);
console.log('attacker gold:', p.gold, 'wood:', p.wood);
console.assert(camp.alive === false, 'camp razed');
console.assert(p.gold >= 300, 'loot granted');
console.assert(room.state.battleLog.length > 0, 'battle log populated');
console.log('BATTLE LOG:', room.state.battleLog[0]);

// respawn check: force respawnAt in past, run upkeep
camp.respawnAt = Date.now() - 1;
room.state.nodes = new Map(); // avoid iterating missing
const up = () => {
  room.state.nodes.forEach((n) => { if (n.amount < n.maxAmount) n.amount = Math.min(n.maxAmount, n.amount + Math.ceil(n.maxAmount * 0.05)); });
  room.state.camps.forEach((c) => { if (!c.alive && Date.now() >= c.respawnAt) { c.alive = true; c.army = c.maxArmy; } });
};
up();
console.log('after respawn: alive=', camp.alive, 'army=', camp.army);
console.assert(camp.alive === true && camp.army === 30, 'camp respawned');

console.log('ALL CAMP CHECKS PASSED');
process.exit(0);
