// Verify persistence: join as existing player, verify state loaded
import { Client } from 'colyseus.js';
import { loadPlayer } from './src/db.js';

const client = new Client('ws://localhost:3000');
console.log('JOINING as returning player...');
const room = await client.joinOrCreate('world', { name: 'PersistentLord', faction: 'tsar' });
await new Promise(r => setTimeout(r, 1500));

const p = room.state.players.get(room.sessionId);
console.log('CONNECTED:', {
  name: p.name, faction: p.faction, gold: Math.round(p.gold),
  army: p.army, level: p.level, xp: Math.round(p.xp),
});

// Check DB directly
const saved = loadPlayer('PersistentLord');
console.log('DB state:', saved ? { gold: Math.round(saved.gold), army: saved.army, level: saved.level } : 'NOT FOUND');

// Send a chat to show we survive
room.send('chat', { message: 'persistence test' });
await new Promise(r => setTimeout(r, 500));
console.log('chat sent OK');

process.exit(0);