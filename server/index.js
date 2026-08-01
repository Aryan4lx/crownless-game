import express from 'express';
import http from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
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

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 3000,
  }),
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

httpServer.listen(port, () => {
  console.log(`⚔️  Crownless server running on port ${port}`);
  console.log(`📊  Monitor: http://localhost:${port}/monitor`);
});
