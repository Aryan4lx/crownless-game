import { Client, Room } from 'colyseus.js';

declare global {
  interface Window {
    __room: any;
  }
}

// const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://[::1]:3000';
const SERVER_URL = `ws://${window.location.host}`;

export const client = new Client(SERVER_URL);

export let room: Room | null = null;

export async function joinWorld(name: string, faction: string) {
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

export function sendMove(x: number, y: number) {
  room?.send('move', { x, y });
}

export function sendStop() {
  room?.send('stop');
}

export function sendBuild(building: string) {
  room?.send('build', { kind: building });
}

export function sendAttack(targetId: string) {
  room?.send('attack', { target: targetId });
}

export function sendResearch() {
  room?.send('research');
}

export function sendChat(message: string) {
  room?.send('chat', { message });
}

export function sendTrain() {
  room?.send('train');
}

export function claimCrown() {
  room?.send('claimCrown');
}
