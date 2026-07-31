// Attacker bot — builds barracks, waits for army, attacks the first other player
import { Client } from 'colyseus.js';

const client = new Client('ws://[::1]:2567');
const t0 = Date.now();
const ts = () => `t=${Math.round((Date.now() - t0) / 1000)}s`;

const room = await client.joinOrCreate('world', { name: 'Warlord', faction: 'tsar' });
console.log(ts(), 'ATTACKER JOINED:', room.sessionId);

room.onMessage('battle', (m) => console.log(ts(), 'BATTLE:', m.text));

const me = () => {
  const ps = room.state?.players;
  let m = null;
  if (ps?.get) m = ps.get(room.sessionId);
  else if (ps?.forEach) ps.forEach((p, k) => { if (k === room.sessionId) m = p; });
  return m;
};

// Build barracks ASAP, then smithy
const buildTimer = setInterval(() => {
  const m = me();
  if (!m) return;
  if (m.barracksLvl === 0 && m.gold >= 100 && m.wood >= 50) {
    room.send('build', { kind: 'barracks' });
    console.log(ts(), 'built barracks');
  }
}, 1000);

// When army >= 25, attack the nearest other player
const attackTimer = setInterval(() => {
  const m = me();
  if (!m || m.army < 8 || m.attackTarget || m.isMoving) return;
  let target = null, targetId = null, best = 600;
  const ps = room.state?.players;
  if (ps?.forEach) ps.forEach((p, k) => {
    if (k === room.sessionId) return;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < best) { best = d; target = p; targetId = k; }
  });
  if (target) {
    console.log(ts(), `ATTACKING ${target.name} (army ${m.army} vs ${target.army}) at ${Math.round(target.x)},${Math.round(target.y)}`);
    room.send('attack', { target: targetId });
    clearInterval(buildTimer);
    clearInterval(attackTimer);
  }
}, 2000);

setInterval(() => {
  const m = me();
  console.log(ts(), 'ME:', m ? `army=${m.army} gold=${Math.round(m.gold)} b=${m.barracksLvl} atk=${m.attackTarget || '-'}` : 'GONE');
}, 3000);

setTimeout(async () => {
  await room.leave();
  console.log(ts(), 'ATTACKER LEFT');
  process.exit(0);
}, 90000);
