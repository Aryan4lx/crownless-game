import { useEffect, useRef, useState } from 'react';
import { sendMove, sendStop, leaveWorld } from './network';
import './WorldMap.css';

const MAP_SIZE = 1024;
const FACTION_COLORS = {
  sultan: '#d4a64a',
  tsar: '#b8334a',
  king: '#3a5fa8',
  khan: '#8a7a5a',
};

const NODE_STYLES = {
  gold: { color: '#f0c040', label: 'G' },
  food: { color: '#6a9a5a', label: 'F' },
  wood: { color: '#9a7a4a', label: 'W' },
};

export default function WorldMap({ room }) {
  const canvasRef = useRef(null);
  const [players, setPlayers] = useState(new Map());
  const [nodes, setNodes] = useState(new Map());
  const [myId, setMyId] = useState('');
  const [playerCount, setPlayerCount] = useState(0);
  const playersRef = useRef(new Map());
  const nodesRef = useRef(new Map());

  // Read players from room state, generically (works for MapSchema or plain object)
  const syncPlayers = () => {
    const s = room?.state;
    if (!s || !s.players) return;

    const newMap = new Map();
    const ps = s.players;

    const addEntry = (key, p) => {
      if (!p) return;
      newMap.set(key, {
        name: p.name ?? '?',
        faction: p.faction ?? 'sultan',
        x: p.x ?? 0,
        y: p.y ?? 0,
        isMoving: p.isMoving ?? false,
        gold: p.gold ?? 0,
        food: p.food ?? 0,
        wood: p.wood ?? 0,
        gatheringNodeId: p.gatheringNodeId ?? '',
      });
    };

    if (ps instanceof Map) {
      ps.forEach((p, k) => addEntry(k, p));
    } else if (ps.forEach) {
      ps.forEach((p, k) => addEntry(k, p));
    } else if (typeof ps === 'object') {
      Object.entries(ps).forEach(([k, p]) => addEntry(k, p));
    }

    playersRef.current = newMap;
    setPlayers(newMap);
    setPlayerCount(newMap.size);

    // Sync resource nodes
    const s2 = room?.state;
    if (s2?.nodes) {
      const newNodeMap = new Map();
      const ns = s2.nodes;
      const addNode = (k, n) => newNodeMap.set(k, {
        id: n.id ?? k,
        type: n.type ?? 'gold',
        x: n.x ?? 0,
        y: n.y ?? 0,
        amount: n.amount ?? 0,
      });
      if (ns instanceof Map) ns.forEach((n, k) => addNode(k, n));
      else if (ns.forEach) ns.forEach((n, k) => addNode(k, n));
      else Object.entries(ns).forEach(([k, n]) => addNode(k, n));
      nodesRef.current = newNodeMap;
      setNodes(newNodeMap);
    }
  };

  useEffect(() => {
    if (!room) return;
    setMyId(room.sessionId);
    syncPlayers();
    room.onStateChange(syncPlayers);
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
    const ctx = canvas.getContext('2d');

    let raf;

    const render = () => {
      // Background
      ctx.fillStyle = '#0d0e10';
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Grid
      ctx.strokeStyle = '#1a1a1e';
      ctx.lineWidth = 1;
      const gridSize = 64;
      for (let i = 0; i <= MAP_SIZE; i += gridSize) {
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
      nodesRef.current.forEach((n) => {
        const style = NODE_STYLES[n.type] || NODE_STYLES.gold;
        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.label, n.x, n.y + 0.5);
        ctx.fillStyle = 'rgba(224,221,213,0.75)';
        ctx.font = '9px sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(Math.round(n.amount), n.x, n.y - 11);
      });

      // Center monument (The Crown)
      ctx.fillStyle = '#1a1a1e';
      ctx.beginPath();
      ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d4a64a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#d4a64a';
      ctx.font = '20px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('♛', MAP_SIZE / 2, MAP_SIZE / 2 + 7);

      // Players
      playersRef.current.forEach((p, id) => {
        const isMe = id === myId;
        const color = FACTION_COLORS[p.faction] || '#888';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isMe ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        if (isMe) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = isMe ? '#fff' : '#a0a0a0';
        ctx.font = `${isMe ? 'bold ' : ''}11px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - 14);
      });

      raf = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [myId]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = MAP_SIZE / rect.width;
    const scaleY = MAP_SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    sendMove(Math.round(x), Math.round(y));
  };

  const handleLeave = () => {
    leaveWorld();
    window.location.reload();
  };

  const myPlayer = players.get(myId);

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

      <div className="hud-bottom">
        <div className="coords">
          {myPlayer ? `${Math.round(myPlayer.x)}, ${Math.round(myPlayer.y)}` : '---'}
          {myPlayer?.isMoving && <span className="moving-indicator"> · Marching</span>}
        </div>
        <div className="hint">Click anywhere to march your army</div>
      </div>
    </div>
  );
}
