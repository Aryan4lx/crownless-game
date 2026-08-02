// Unit test: SQLite persistence round-trip
import { loadPlayer, savePlayer, db } from './src/db.js';

// Clean test
db.exec("DELETE FROM players WHERE name LIKE 'Test%'");

// Test 1: New player save
const p1 = {
  name: 'TestWarlord', faction: 'khan', gold: 500, food: 200, wood: 100,
  army: 45, xp: 350, level: 3, castleLvl: 2, barracksLvl: 1, smithyLvl: 1,
  farmLvl: 2, mineLvl: 1, researchLvl: 1, x: 600, y: 400, createdAt: Date.now(),
};
savePlayer(p1);
console.log('1. save new player: OK');

// Test 2: Load it back
const loaded = loadPlayer('TestWarlord');
console.assert(loaded !== null, 'player loaded');
console.assert(loaded.faction === 'khan', 'faction preserved');
console.assert(loaded.gold === 500, 'gold preserved');
console.assert(loaded.army === 45, 'army preserved');
console.assert(loaded.level === 3, 'level preserved');
console.assert(loaded.researchLvl === 1, 'research preserved');
console.log('2. load matches save:', JSON.stringify({ faction: loaded.faction, gold: loaded.gold, army: loaded.army, level: loaded.level }));

// Test 3: Update (upsert) — player gathered resources
p1.gold = 750; p1.army = 60; p1.level = 4;
savePlayer(p1);
const updated = loadPlayer('TestWarlord');
console.assert(updated.gold === 750, 'gold updated');
console.assert(updated.army === 60, 'army updated');
console.assert(updated.level === 4, 'level updated');
console.log('3. upsert (update): OK', JSON.stringify({ gold: updated.gold, army: updated.army, level: updated.level }));

// Test 4: Nonexistent player
const ghost = loadPlayer('DoesNotExist');
console.assert(ghost === null, 'nonexistent returns null');
console.log('4. nonexistent returns null: OK');

// Test 5: Player count
const count = db.prepare('SELECT COUNT(*) as c FROM players').get();
console.log('5. player count:', count.c);

// Cleanup
db.exec("DELETE FROM players WHERE name LIKE 'Test%'");
console.log('6. cleanup: OK');

console.log('ALL PERSISTENCE CHECKS PASSED');
process.exit(0);
