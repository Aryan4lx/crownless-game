// Second-player test client — joins, marches to a resource node, dumps state
import { Client } from 'colyseus.js';

const client = new Client('ws://[::1]:2567');
const t0 = Date.now();
const ts = () => `t=${Math.round((Date.now() - t0) / 1000)}s`;

try {
  const room = await client.joinOrCreate('world', { name: 'BotKhan', faction: 'khan' });
  console.log(ts(), 'BOT JOINED:', room.sessionId);

  setInterval(() => {
    const s = room.state;
    const ps = s?.players;
    let me = null;
    if (ps?.get) me = ps.get(room.sessionId);
    else if (ps?.forEach) ps.forEach((p, k) => { if (k === room.sessionId) me = p; });

    let meInfo = me
      ? `${me.name} gold=${Math.round(me.gold)} food=${Math.round(me.food)} wood=${Math.round(me.wood)} gather=${me.gatheringNodeId || '-'} moving=${me.isMoving} @${Math.round(me.x)},${Math.round(me.y)}`
      : 'NO-ME';

    let nodeInfo = '';
    const ns = s?.nodes;
    const firstThree = [];
    if (ns?.forEach) ns.forEach((n) => { if (firstThree.length < 3) firstThree.push(`${n.id}:${n.type}:${Math.round(n.amount)}`); });
    nodeInfo = firstThree.join(' ');

    console.log(ts(), 'ME:', meInfo, '| NODES:', nodeInfo);
  }, 2000);

  // March to the first node after 3s
  setTimeout(() => {
    const s = room.state;
    const ns = s?.nodes;
    let target = null;
    if (ns?.forEach) ns.forEach((n) => { if (!target) target = n; });
    if (target) {
      room.send('move', { x: target.x, y: target.y });
      console.log(ts(), `BOT MARCHES to ${target.id} (${target.type}) at ${Math.round(target.x)},${Math.round(target.y)}`);
    } else {
      console.log(ts(), 'NO NODES IN STATE');
    }
  }, 3000);

  setTimeout(async () => {
    await room.leave();
    console.log(ts(), 'BOT LEFT (self)');
    process.exit(0);
  }, 40000);
} catch (e) {
  console.error(ts(), 'BOT FAILED:', e.message);
  process.exit(1);
}
