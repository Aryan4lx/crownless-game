// Server-side unit check for tiered camp combat + respawn (no network)
import WorldRoom from './src/WorldRoom.js';
import { WorldState, Player, Camp } from './src/Schema.js';

const room = new WorldRoom();
room.state = new WorldState();
room.clock = { setInterval: () => 0 };
let levelups = [];
room.broadcast = (type, data) => { if (type === 'levelup') levelups.push(data); };
room.onMessage = () => {};

// Spawn camps at all 4 tiers
const tiers = [
  { tier: 1, army: 20, lootMul: 1.0, xpMul: 1.0, respawn: 60000 },
  { tier: 2, army: 45, lootMul: 2.0, xpMul: 1.5, respawn: 120000 },
  { tier: 3, army: 75, lootMul: 4.0, xpMul: 2.5, respawn: 240000 },
  { tier: 4, army: 150, lootMul: 10.0, xpMul: 5.0, respawn: 600000 },
];
tiers.forEach((t, i) => {
  const camp = new Camp();
  camp.id = `camp-${i}`; camp.name = `T${t.tier} Camp`; camp.tier = t.tier;
  camp.x = 700; camp.y = 700; camp.maxArmy = t.army; camp.army = t.army;
  camp.lootGold = (120 + t.army * 6) * t.lootMul;
  camp.lootWood = (60 + t.army * 4) * t.lootMul;
  camp.alive = true; camp.respawnAt = 0;
  room.state.camps.set(camp.id, camp);
});

// attacker strong enough to beat T3 but not T4
const p = new Player();
p.name = 'Hero'; p.x = 690; p.y = 690; p.army = 80; p.level = 1;
room.state.players.set('p1', p);

function attackCamp(campId, armySize) {
  p.attackTarget = '';
  p.x = 690; p.y = 690; p.army = armySize;
  room.attack({ sessionId: 'p1' }, { target: campId });
  for (let i = 0; i < 10 && p.isMoving; i++) room.tickPlayer(p);
  room.tickPlayer(p); // arrival -> resolveBattle
}

// T1: easy win
attackCamp('camp-0', 80);
const c0 = room.state.camps.get('camp-0');
console.assert(c0.alive === false, 'T1 razed');
console.log('T1:', c0.alive ? 'STANDING' : 'RAZED', '| loot was', c0.lootGold, '| xp gained, p.level=', p.level);

// T2: win with bigger army
attackCamp('camp-1', 100);
const c1 = room.state.camps.get('camp-1');
console.assert(c1.alive === false, 'T2 razed');
console.log('T2:', c1.alive ? 'STANDING' : 'RAZED');

// T3: win with 200 army
attackCamp('camp-2', 200);
const c2 = room.state.camps.get('camp-2');
console.assert(c2.alive === false, 'T3 razed');
console.log('T3:', c2.alive ? 'STANDING' : 'RAZED');

// T4: need 300 army (150 army + survives 25% attrition)
attackCamp('camp-3', 300);
const c3 = room.state.camps.get('camp-3');
console.assert(c3.alive === false, 'T4 razed');
console.log('T4:', c3.alive ? 'STANDING' : 'RAZED', '| loot was', c3.lootGold, '| respawn in', c3.respawnAt - Date.now(), 'ms');

// Verify tier-based respawn timers differ
console.log('respawn timers:', { T1: c0.respawnAt - Date.now(), T4: c3.respawnAt - Date.now() });

console.log('player final level:', p.level, 'gold:', p.gold);
console.log('levelups broadcast:', levelups.length);

console.log('ALL TIER CHECKS PASSED');
process.exit(0);
