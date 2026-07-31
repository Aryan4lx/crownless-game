import { Client } from 'colyseus.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://[::1]:2567';

export const client = new Client(SERVER_URL);

export let room = null;

export async function joinWorld(name, faction) {
  room = await client.joinOrCreate('world', { name, faction });
  console.log(`[Crownless] Joined world as ${name} (${faction})`);
  room.onLeave((code) => console.log(`[Crownless] ROOM LEAVE code=${code}`));
  room.onError((code, msg) => console.log(`[Crownless] ROOM ERROR code=${code} msg=${msg}`));
  window.__room = room; // debug hook
  return room;
}

export function leaveWorld() {
  if (room) {
    room.leave();
    room = null;
  }
}

export function sendMove(x, y) {
  room?.send('move', { x, y });
}

export function sendStop() {
  room?.send('stop');
}
