import express from 'express';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import path from 'path';
import { fileURLToPath } from 'url';
import WorldRoom from './src/WorldRoom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const gameServer = new Server({
  express: app,
  pingInterval: 3000,
});

gameServer.define('world', WorldRoom);

app.use('/monitor', monitor());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: Date.now() });
});

// Serve the built client if present (same-origin: WS + static on one port)
const dist = path.join(__dirname, '../client/dist');
app.use(express.static(dist));
app.get('/', (req, res) => res.sendFile(path.join(dist, 'index.html')));

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
