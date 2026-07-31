import express from 'express';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WorldRoom } from './src/WorldRoom.js';

const app = express();
const port = process.env.PORT || 2567;

const gameServer = new Server({
  express: app,
  pingInterval: 3000,
});

gameServer.define('world', WorldRoom);

app.use('/monitor', monitor());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: Date.now() });
});

gameServer.listen(port).then(() => {
  console.log(`⚔️  Crownless server running on port ${port}`);
  console.log(`📊  Monitor: http://localhost:${port}/monitor`);
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err.message);
});
