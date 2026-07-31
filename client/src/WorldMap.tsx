import { useEffect, useRef, useState } from 'react';
import { sendMove, sendBuild, sendAttack, sendResearch, leaveWorld } from './network';
import './WorldMap.css';

const MAP_SIZE = 1024;
const TERRAIN_SEED = 1337;

const FACTION_COLORS: Record<string, string> = {
  sultan: '#d4a64a',
  tsar: '#b8334a',
  king: '#3a5fa8',
  khan: '#8a7a5a',
};

interface BuildingDef { label: string; icon: string; gold: number; wood: number; desc: string; }

const BUILDINGS: Record<string, BuildingDef> = {
  barracks: { label: 'Barracks', icon: '⚔️', gold: 100, wood: 50, desc: 'Trains army' },
  smithy:   { label: 'Smithy',   icon: '🔨', gold: 150, wood: 100, desc: '+25% gather speed' },
  farm:     { label: 'Farm',     icon: '🌾', gold: 80,  wood: 0,   desc: '+8 food/5s' },
  mine:     { label: 'Mine',     icon: '⛏️', gold: 120, wood: 0,   desc: '+10 gold/5s' },
};

const LEVEL_FIELD: Record<string, string> = {
  barracks: 'barracksLvl',
  smithy: 'smithyLvl',
  farm: 'farmLvl',
  mine: 'mineLvl',
};

const costFor = (b: { gold: number; wood: number }, level: number) => ({
  gold: Math.round(b.gold * (level + 1)),
  wood: Math.round(b.wood * (level + 1)),
});

// ── Deterministic value noise (same terrain on every client) ────────
function hash2(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let v = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * smoothNoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / norm;
}

// ── Procedural castle sprite ────────────────────────────────────────
function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, isMe: boolean) {
  const s = isMe ? 1.15 : 1;
  ctx.save();
  ctx.translate(x, y);

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 10 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // keep base
  ctx.fillStyle = '#3d3d42';
  ctx.fillRect(-14 * s, -12 * s, 28 * s, 20 * s);

  // crenellations
  ctx.fillStyle = '#4a4a50';
  for (let i = -3; i < 4; i += 2) {
    ctx.fillRect(i * 5 * s - 3 * s, -18 * s, 5 * s, 6 * s);
  }

  // gate
  ctx.fillStyle = '#241f14';
  ctx.beginPath();
  ctx.arc(0, 6 * s, 5 * s, Math.PI, 0);
  ctx.fill();

  // keep tower
  ctx.fillStyle = color;
  ctx.fillRect(-8 * s, -28 * s, 16 * s, 18 * s);
  ctx.fillStyle = shade(color, -25);
  ctx.beginPath();
  ctx.moveTo(-11 * s, -28 * s);
  ctx.lineTo(0, -40 * s);
  ctx.lineTo(11 * s, -28 * s);
  ctx.closePath();
  ctx.fill();

  // flag
  ctx.strokeStyle = '#c9c4ba';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -40 * s);
  ctx.lineTo(0, -50 * s);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -50 * s);
  ctx.lineTo(11 * s, -46 * s);
  ctx.lineTo(0, -42 * s);
  ctx.closePath();
  ctx.fill();

  if (isMe) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ── Procedural node icons ───────────────────────────────────────────
function drawNode(ctx: CanvasRenderingContext2D, x: number, y: number, type: string, amount: number) {
  ctx.save();
  ctx.translate(x, y);

  // soft glow
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();

  if (type === 'gold') {
    ctx.fillStyle = '#e8c34a';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a1e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#8a6a1e';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(-1, -1);
    ctx.stroke();
  } else if (type === 'food') {
    ctx.strokeStyle = '#b8d08a';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4, 6);
      ctx.quadraticCurveTo(i * 5, -2, i * 3, -8);
      ctx.stroke();
      ctx.fillStyle = '#d8e0a0';
      ctx.beginPath();
      ctx.arc(i * 4, -8, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // wood — stacked logs
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? '#7a5a34' : '#8a6a3e';
      const off = i === 1 ? 0 : (i === 0 ? -1.2 : 1.2);
      ctx.beginPath();
      ctx.roundRect(-7, -4 + i * 4.5 + off * 0.6, 14, 4.5, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // amount pill
  const label = String(Math.round(amount));
  ctx.font = 'bold 9px sans-serif';
  const w = ctx.measureText(label).width + 8;
  ctx.fillStyle = 'rgba(10,10,11,0.8)';
  ctx.beginPath();
  ctx.roundRect(-w / 2, 10, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = '#e0ddd5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 16.5);
  ctx.restore();
}

// ── Build the terrain once into an offscreen canvas ─────────────────
function buildTerrain() {
  const c = document.createElement('canvas');
  c.width = MAP_SIZE;
  c.height = MAP_SIZE;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;

  // low-res noise field, scaled up for soft patches
  const small = document.createElement('canvas');
  small.width = 256;
  small.height = 256;
  const sctx = small.getContext('2d') as CanvasRenderingContext2D;
  const img = sctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = x / 256, ny = y / 256;
      const g = fbm(nx * 3, ny * 3, TERRAIN_SEED);
      const d = fbm(nx * 6 + 5, ny * 6 + 5, TERRAIN_SEED + 7);
      let r = 24, gg = 32, b = 18;          // base grass dark
      if (g > 0.55) { r = 30; gg = 44; b = 22; }        // lush
      else if (g < 0.3) { r = 18; gg = 22; b = 14; }    // shadow
      if (d > 0.62) { r = 44; gg = 36; b = 22; }        // dirt patch
      const i = (y * 256 + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, MAP_SIZE, MAP_SIZE);

  // subtle large-scale mottling
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < 400; i++) {
    const x = hash2(i, 1, 99) * MAP_SIZE;
    const y = hash2(i, 2, 99) * MAP_SIZE;
    const r = 8 + hash2(i, 3, 99) * 40;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // forests — clusters of pines
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const f = fbm((x / 256) * 4 + 11, (y / 256) * 4 + 11, TERRAIN_SEED + 23);
      if (f > 0.64) {
        const px = (x / 256) * MAP_SIZE + (hash2(x, y, 5) - 0.5) * 12;
        const py = (y / 256) * MAP_SIZE + (hash2(x, y, 6) - 0.5) * 12;
        const s = 5 + hash2(x, y, 7) * 5;
        ctx.fillStyle = '#1c2a16';
        ctx.beginPath();
        ctx.moveTo(px, py - s * 2);
        ctx.lineTo(px - s, py);
        ctx.lineTo(px + s, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#26381c';
        ctx.beginPath();
        ctx.moveTo(px, py - s * 2.8);
        ctx.lineTo(px - s * 0.7, py - s * 0.8);
        ctx.lineTo(px + s * 0.7, py - s * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // mountains — NW ridge
  for (let i = 0; i < 60; i++) {
    const px = hash2(i, 8, 77) * 380 + 20;
    const py = hash2(i, 9, 77) * 380 + 20;
    const s = 14 + hash2(i, 10, 77) * 22;
    ctx.fillStyle = '#45464c';
    ctx.beginPath();
    ctx.moveTo(px - s, py);
    ctx.lineTo(px, py - s * 1.4);
    ctx.lineTo(px + s, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a5c64';
    ctx.beginPath();
    ctx.moveTo(px, py - s * 1.4);
    ctx.lineTo(px + s * 0.5, py - s * 0.4);
    ctx.lineTo(px + s, py);
    ctx.closePath();
    ctx.fill();
    // snow cap
    ctx.fillStyle = 'rgba(230,232,240,0.85)';
    ctx.beginPath();
    ctx.moveTo(px - s * 0.25, py - s * 1.05);
    ctx.lineTo(px, py - s * 1.4);
    ctx.lineTo(px + s * 0.25, py - s * 1.05);
    ctx.closePath();
    ctx.fill();
  }

  return c;
}

interface PlayerState {
  name: string; faction: string; x: number; y: number;
  tx: number; ty: number; isMoving: boolean; castleLvl: number;
  gold: number; food: number; wood: number; gatheringNodeId: string;
  barracksLvl: number; smithyLvl: number; farmLvl: number; mineLvl: number; army: number;
}
interface NodeState { id: string; type: string; x: number; y: number; amount: number; }

export default function WorldMap({ room }: { room: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement>(null);
  const [players, setPlayers] = useState(new Map());
  const [ranks, setRanks] = useState([]);
  const [buildProgress, setBuildProgress] = useState<any[]>([]);
  const [myId, setMyId] = useState('');
  const [playerCount, setPlayerCount] = useState(0);
  const [battleMsg, setBattleMsg] = useState('');
  const playersRef = useRef(new Map());
  const nodesRef = useRef(new Map());

  // Read players from room state, generically (works for MapSchema or plain object)
  const syncPlayers = () => {
    const s = room?.state;
    if (!s || !s.players) return;

    const newMap = new Map<string, PlayerState>();
    const ps = s.players;

    const addEntry = (key: string, p: any) => {
      if (!p) return;
      newMap.set(key, {
        name: p.name ?? '?',
        faction: p.faction ?? 'sultan',
        x: p.x ?? 0,
        y: p.y ?? 0,
        tx: p.targetX ?? p.x ?? 0,
        ty: p.targetY ?? p.y ?? 0,
        isMoving: p.isMoving ?? false,
        castleLvl: p.castleLvl ?? 1,
        gold: p.gold ?? 0,
        food: p.food ?? 0,
        wood: p.wood ?? 0,
        gatheringNodeId: p.gatheringNodeId ?? '',
        barracksLvl: p.barracksLvl ?? 0,
        smithyLvl: p.smithyLvl ?? 0,
        farmLvl: p.farmLvl ?? 0,
        mineLvl: p.mineLvl ?? 0,
        army: p.army ?? 0,
      });
    };

    if (ps instanceof Map) {
      ps.forEach((p: any, k: string) => addEntry(k, p));
    } else if (ps.forEach) {
      ps.forEach((p: any, k: string) => addEntry(k, p));
    } else if (typeof ps === 'object') {
      Object.entries(ps).forEach(([k, p]) => addEntry(k, p as any));
    }

    playersRef.current = newMap;
    setPlayers(newMap);
    setPlayerCount(newMap.size);

    // Sync resource nodes
    const s2 = room?.state;
    if (s2?.nodes) {
      const newNodeMap = new Map<string, NodeState>();
      const ns = s2.nodes;
      const addNode = (k: string, n: any) => newNodeMap.set(k, {
        id: n.id ?? k,
        type: n.type ?? 'gold',
        x: n.x ?? 0,
        y: n.y ?? 0,
        amount: n.amount ?? 0,
      });
      if (ns instanceof Map) ns.forEach((n: any, k: string) => addNode(k, n));
      else if (ns.forEach) ns.forEach((n: any, k: string) => addNode(k, n));
      else Object.entries(ns).forEach(([k, n]) => addNode(k, n as any));
      nodesRef.current = newNodeMap;
    }
  };

  useEffect(() => {
    if (!room) return;
    setMyId(room.sessionId);
    syncPlayers();
    room.onStateChange(syncPlayers);
    room.onMessage('battle', (m: any) => {
      setBattleMsg(m.text);
      setTimeout(() => setBattleMsg(''), 5000);
    });
    room.onMessage('buildStart', (m: any) => {
      const b = BUILDINGS[m.kind];
      setBattleMsg(`${b?.icon ?? '🏗️'} Building ${b?.label ?? m.kind}… (${Math.round((m.duration ?? 0) / 1000)}s)`);
      setTimeout(() => setBattleMsg(''), 4000);
    });
    room.onMessage('rank', (r: any) => setRanks(r));
    room.onMessage('buildProgress', (p: any) => setBuildProgress(p));
    const iv = setInterval(syncPlayers, 300);
    return () => {
      clearInterval(iv);
      // NOTE: do NOT call leaveWorld() here. React StrictMode double-invokes
      // effects in dev (mount → cleanup → mount), which would disconnect the
      // just-joined room. Leaving is explicit via the Leave button only.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!terrainRef.current) terrainRef.current = buildTerrain();

    let raf: number;
    let t = 0;

    const render = () => {
      t += 0.016;

      // Terrain
      ctx.drawImage(terrainRef.current as HTMLCanvasElement, 0, 0);

      // Faint grid
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= MAP_SIZE; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, MAP_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(MAP_SIZE, i);
        ctx.stroke();
      }

      // Resource nodes
      nodesRef.current.forEach((n) => drawNode(ctx, n.x, n.y, n.type, n.amount));

      // Center monument (The Crown)
      const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d4a64a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(212,166,74,0.25)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 54 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#d4a64a';
      ctx.font = '26px Georgia';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♛', cx, cy + 2);
      ctx.fillStyle = 'rgba(212,166,74,0.8)';
      ctx.font = '10px Georgia';
      ctx.fillText('THE CROWN', cx, cy + 24);
      ctx.textBaseline = 'alphabetic';

      // March paths (dashed line to target)
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      playersRef.current.forEach((p) => {
        if (!p.isMoving) return;
        ctx.strokeStyle = FACTION_COLORS[p.faction] || '#888';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.tx, p.ty);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      ctx.setLineDash([]);

      // Players (castles)
      playersRef.current.forEach((p, id) => {
        const isMe = id === myId;
        const color = FACTION_COLORS[p.faction] || '#888';
        drawCastle(ctx, p.x, p.y, color, isMe);

        const build = buildProgress.find((b: any) => b.pid === id);
        if (build) {
          const progress = 1 - (build.finish - Date.now()) / 10000;
          ctx.strokeStyle = '#d4a64a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 25, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.stroke();
        }

        // name plate
        const nameW = ctx.measureText(p.name).width + 14;
        ctx.fillStyle = 'rgba(10,10,11,0.85)';
        ctx.beginPath();
        ctx.roundRect(p.x - nameW / 2, p.y - 62, nameW, 16, 8);
        ctx.fill();
        ctx.fillStyle = isMe ? '#fff' : '#c9c4ba';
        ctx.font = `${isMe ? 'bold ' : ''}10px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.name, p.x, p.y - 53);

        // gathering indicator
        if (p.gatheringNodeId) {
          ctx.fillStyle = 'rgba(126,200,227,0.9)';
          ctx.font = '9px sans-serif';
          ctx.fillText('⛏', p.x + 18, p.y - 52);
        }
      });

      // Vignette
      const vg = ctx.createRadialGradient(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE * 0.35, MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      raf = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [myId]);

  const handleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = MAP_SIZE / rect.width;
    const scaleY = MAP_SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Clicking on another player's castle = attack (with confirm)
    let targetId = null;
    playersRef.current.forEach((p, id) => {
      if (id === myId) return;
      if (Math.hypot(p.x - x, p.y - y) < 30) targetId = id;
    });
    if (targetId) {
      const target = playersRef.current.get(targetId);
      if (window.confirm(`⚔️ Attack ${target.name}? (Your army: ${myPlayer?.army ?? 0})`)) {
        sendAttack(targetId);
      }
      return;
    }

    sendMove(Math.round(x), Math.round(y));
  };

  const handleLeave = () => {
    leaveWorld();
    window.location.reload();
  };

  const myPlayer = players.get(myId);

  const handleBuild = (key: string) => {
    if (!myPlayer) return;
    const cost = costFor(BUILDINGS[key], myPlayer[LEVEL_FIELD[key]]);
    if (myPlayer.gold < cost.gold || myPlayer.wood < cost.wood) return;
    sendBuild(key);
  };

  const armyPower = myPlayer?.army ?? 0;

  return (
    <div className="world-screen">
      <div className="hud-top">
        <div className="hud-left">
          <span className="hud-faction" style={{ color: FACTION_COLORS[myPlayer?.faction] || '#d4a64a' }}>
            {myPlayer?.faction?.toUpperCase() || '---'}
          </span>
          <span className="hud-name">{myPlayer?.name || 'Unknown'}</span>
          {myPlayer && (
            <span className="hud-resources">
              <span className="res gold">🪙 {Math.round(myPlayer.gold)}</span>
              <span className="res food">🌾 {Math.round(myPlayer.food)}</span>
              <span className="res wood">🪵 {Math.round(myPlayer.wood)}</span>
              {myPlayer.gatheringNodeId && <span className="res gathering">⛏ gathering</span>}
            </span>
          )}
        </div>
        <div className="hud-center">
          <span className="hud-online">● {playerCount} ruler{playerCount !== 1 ? 's' : ''} online</span>
        </div>
        <div className="hud-right">
          <span className="army-count">⚔️ {armyPower}</span>
          <button className="leave-btn" onClick={handleLeave}>Leave Realm</button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        className="world-canvas"
        onClick={handleClick}
      />

      {battleMsg && <div className="battle-toast">{battleMsg}</div>}

      <div className="hud-bottom">
        <div className="coords">
          <span className="hint">Move:</span> {myPlayer ? `${Math.round(myPlayer.x)},${Math.round(myPlayer.y)}` : '---'} click elsewhere
        </div>
        <div className="moving-indicator">{myPlayer?.isMoving ? 'MOVING' : ''}</div>
        <div className="build-tip">{myPlayer?.gold}g {myPlayer?.wood}w {myPlayer?.farmLvl}🌾{myPlayer?.barracksLvl}⚔️{myPlayer?.mineLvl}⛏️</div>
      </div>
      
      {ranks.length > 0 && (
        <div className="leaderboard">
          {ranks.map((r: any, i: number) => <div key={i}>{i+1}. {r.name} ({r.score})</div>)}
        </div>
      )}

      {myPlayer?.smithyLvl >= 1 && (
        <button className="research-btn" onClick={() => sendResearch()}>🧪 Lab</button>
      )}

      <div className="build-bar">
        <div className="build-bar-title">Buildings</div>
        {Object.entries(BUILDINGS).map(([key, b]) => {
          const level = myPlayer ? myPlayer[LEVEL_FIELD[key]] : 0;
          const cost = costFor(b, level);
          const canAfford = myPlayer && myPlayer.gold >= cost.gold && myPlayer.wood >= cost.wood;
          return (
            <button
              key={key}
              className={`build-btn ${canAfford ? 'afford' : ''}`}
              onClick={() => handleBuild(key)}
              title={b.desc}
            >
              <span className="build-icon">{b.icon}</span>
              <span className="build-name">{b.label} {level > 0 ? `Lv${level}` : ''}</span>
              <span className="build-cost">🪙{cost.gold}{cost.wood ? ` 🪵${cost.wood}` : ''}</span>
            </button>
          );
        })}
        <div className="build-tip">Buildings boost your economy. Costs rise with level.</div>
      </div>
    </div>
  );
}
