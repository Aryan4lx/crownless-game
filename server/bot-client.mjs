// Second-player test client — foreground run, full connection logging
import { Client } from 'colyseus.js';

const client = new Client('ws://[::1]:2567');
const t0 = Date.now();
const ts = () => `t=${Math.round((Date.now() - t0) / 1000)}s`;

try {
  const room = await client.joinOrCreate('world', { name: 'BotKhan', faction: 'khan' });
  console.log(ts(), 'BOT JOINED:', room.sessionId);

  room.onLeave((code) => console.log(ts(), 'ROOM ONLEAVE code=', code));
  room.onError((code, msg) => console.log(ts(), 'ROOM ONERROR code=', code, 'msg=', msg));

  // Hook raw socket close
  if (room.connection && room.connection.ws) {
    const ws = room.connection.ws;
    ws.onclose = (e) => console.log(ts(), 'WS CLOSE code=', e.code, 'reason=', e.reason);
  }

  setInterval(() => {
    try {
      const s = room.state;
      const names = [];
      const ps = s?.players;
      if (ps?.forEach) ps.forEach((p, k) => names.push(`${k}:${p?.name}`));
      else if (ps) Object.entries(ps).forEach(([k, p]) => names.push(`${k}:${p?.name}`));
      console.log(ts(), 'STATE:', names.join(' | ') || '(empty)');
    } catch (e) {
      console.log(ts(), 'STATE READ FAILED:', e.message);
    }
  }, 2000);

  setTimeout(() => {
    room.send('move', { x: 700, y: 300 });
    console.log(ts(), 'BOT MOVED to 700,300');
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
