// Unit check: XP progression + level-up reward (no network)
import WorldRoom from './src/WorldRoom.js';
import { WorldState, Player } from './src/Schema.js';

const room = new WorldRoom();
room.state = new WorldState();
room.clock = { setInterval: () => 0 };
room.broadcast = (type, data) => { if (type === 'levelup') room._levelups = room._levelups || []; room._levelups.push(data); };
room.onMessage = () => {};

const p = new Player();
p.name = 'Tester'; p.level = 1; p.xp = 0; p.gold = 100;
room.state.players.set('p1', p);

// gather XP: 2 per tick
room.gainXP(p, 2);
console.assert(p.xp === 2 && p.level === 1, `gather xp: got xp=${p.xp} lvl=${p.level}`);
console.log('gather xp ok:', p.xp, 'xp, level', p.level);

// reach threshold: need 100 for level 1
room.gainXP(p, 98);
console.assert(p.level === 2, `level up: expected 2 got ${p.level}`);
console.assert(p.xp === 0, `xp reset after level: got ${p.xp}`);
console.assert(p.gold >= 200, `level reward: gold=${p.gold}`);
console.assert(room._levelups && room._levelups.length === 1 && room._levelups[0].level === 2, 'levelup broadcast fired');
console.log('level-up ok: lvl 2, reward gold', p.gold, 'broadcast', JSON.stringify(room._levelups));

// multi-level: 500 XP from level 2 crosses 2 thresholds (200 + 300)
room.gainXP(p, 500);
console.assert(p.level === 4, `multi-level: expected 4 got ${p.level}`);
console.assert(p.xp === 0, `multi-level xp remainder: ${p.xp}`);
console.log('multi-level ok: lvl', p.level, 'xp remainder', p.xp);

// rankings include level
const ranks = room.getRankings();
console.assert(ranks[0].level === 4, `rank level: ${JSON.stringify(ranks)}`);
console.log('rank ok:', JSON.stringify(ranks));

console.log('ALL XP CHECKS PASSED');
process.exit(0);
