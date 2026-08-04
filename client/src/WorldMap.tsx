import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import WorldScene from './scenes/WorldScene.js';
import { THEME } from './theme.js';
import { sendBuild, sendTrain, sendResearch, sendChat, leaveWorld } from './network.js';
import './WorldMap.css';

const BUILDINGS = [
  { kind: 'farm', icon: '🌾', label: 'Farm', gold: 80, wood: 0 },
  { kind: 'mine', icon: '⛏️', label: 'Mine', gold: 120, wood: 0 },
  { kind: 'barracks', icon: '⚔️', label: 'Barracks', gold: 100, wood: 50 },
  { kind: 'smithy', icon: '🔨', label: 'Smithy', gold: 150, wood: 100 },
];

const LEVEL_FIELD: Record<string, string> = {
  farm: 'farmLvl', mine: 'mineLvl', barracks: 'barracksLvl', smithy: 'smithyLvl',
};

function costFor(b: any, lvl: number) {
  return { gold: Math.round(b.gold * (lvl + 1)), wood: Math.round(b.wood * (lvl + 1)) };
}

export default function WorldMap({ room }: { room: any }) {
  const phaserRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [myId, setMyId] = useState('');
  const [tick, setTick] = useState(0); // forces re-render for HUD updates
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [battleMsg, setBattleMsg] = useState('');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [ranks, setRanks] = useState<any[]>([]);
  const [buildProgress, setBuildProgress] = useState<any>(null);
  const [showAttackModal, setShowAttackModal] = useState(false);
  const [attackTroops, setAttackTroops] = useState({ infantry: 0, archers: 0, cavalry: 0 });

  // Start Phaser game
  useEffect(() => {
    if (!phaserRef.current || !room) return;
    setMyId(room.sessionId);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: phaserRef.current,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#07070b',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [WorldScene],
    };

    const game = new Phaser.Game(config);
    // Scene starts automatically from the scene array; pass room data via registry
    game.registry.set('room', room);
    game.registry.set('myId', room.sessionId);
    gameRef.current = game;

    return () => {
      game.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Message handlers
  useEffect(() => {
    if (!room) return;
    room.onMessage('battle', (m: any) => {
      setBattleMsg(m.text);
      setBattleLog((prev: string[]) => [...prev, m.text].slice(-10));
      setTimeout(() => setBattleMsg(''), 5000);
    });
    room.onMessage('battleLog', (log: string[]) => setBattleLog(log));
    room.onMessage('buildProgress', (p: any) => setBuildProgress(p));
    room.onMessage('rank', (r: any) => setRanks(r));
    room.onMessage('levelup', (m: any) => {
      setBattleMsg(`⬆️ ${m.name} reached level ${m.level}!`);
      setTimeout(() => setBattleMsg(''), 5000);
    });
    room.onMessage('crownVictory', (m: any) => {
      setBattleMsg(`👑👑 ${m.name} IS SOVEREIGN! Realm victory!`);
      setTimeout(() => setBattleMsg(''), 10000);
    });
    room.onMessage('chat', (m: any) => {
      setChatMessages((prev: any[]) => [...prev, m]);
    });

    // Force HUD re-render every 300ms to reflect state changes
    const iv = setInterval(() => setTick(t => t + 1), 300);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Suppress unused warning — tick drives re-render
  void tick;

  const myPlayer = room?.state?.players?.get(myId);
  const playerCount = room?.state?.players?.size || 0;
  const crownActive = room?.state?.crownActive;
  const crownHolder = room?.state?.crownHolder;

  const handleBuild = (kind: string) => sendBuild(kind);
  const handleLeave = () => { leaveWorld(); window.location.reload(); };

  return (
    <div className="world-screen">
      {/* Phaser game canvas */}
      <div ref={phaserRef} className="phaser-container" />

      {/* Top HUD bar */}
      <div className="hud-top">
        <div className="hud-left">
          <span className="hud-faction" style={{ color: THEME.strings[myPlayer?.faction as keyof typeof THEME.strings] || THEME.strings.gold }}>
            {myPlayer?.faction?.toUpperCase() || '---'}
          </span>
          <span className="hud-name">{myPlayer?.name || 'Unknown'}</span>
          {myPlayer && (
            <span className="hud-resources">
              <span className="hud-level">Lv {myPlayer.level || 1}</span>
              <span className="res gold">🪙 {Math.round(myPlayer.gold)}</span>
              <span className="res food">🌾 {Math.round(myPlayer.food)}</span>
              <span className="res wood">🪵 {Math.round(myPlayer.wood)}</span>
            </span>
          )}
        </div>
        <div className="hud-center">
          <span className="hud-online">● {playerCount} ruler{playerCount !== 1 ? 's' : ''} online</span>
        </div>
        <div className="hud-right">
          <span className="army-count">⚔️ {myPlayer?.army || 0}</span>
          <button className="leave-btn" onClick={handleLeave}>Leave Realm</button>
        </div>
      </div>

      {/* Crown status banner */}
      {crownActive !== undefined && (
        <div className="crown-status">
          {!crownActive
            ? <span className="crown-dormant">👑 Crown dormant — build-up phase</span>
            : crownHolder
              ? <span className="crown-held">👑 {crownHolder} holds The Crown</span>
              : <span className="crown-open">👑 The Crown is unclaimed!</span>}
        </div>
      )}

      {/* Battle toast */}
      {battleMsg && <div className="battle-toast">{battleMsg}</div>}

      {/* XP bar */}
      {myPlayer && (
        <div className="xp-bar" title={`${Math.round(myPlayer.xp)}/${myPlayer.level * 100} XP to level ${myPlayer.level + 1}`}>
          <div className="xp-fill" style={{ width: `${Math.min(100, (myPlayer.xp / (myPlayer.level * 100)) * 100)}%` }} />
        </div>
      )}

      {/* Left sidebar — Resources + Quick Actions */}
      <div className="sidebar-left">
        <div className="panel">
          <h4 className="panel-title">RESOURCES</h4>
          <div className="resource-list">
            <div className="resource-item"><span className="icon gold">🪙</span> <span>{Math.round(myPlayer?.gold || 0)}</span></div>
            <div className="resource-item"><span className="icon food">🌾</span> <span>{Math.round(myPlayer?.food || 0)}</span></div>
            <div className="resource-item"><span className="icon wood">🪵</span> <span>{Math.round(myPlayer?.wood || 0)}</span></div>
            <div className="resource-item"><span className="icon army">⚔️</span> <span>{myPlayer?.army || 0}</span></div>
          </div>
        </div>

        <div className="panel">
          <h4 className="panel-title">QUICK ACTIONS</h4>
          <div className="action-list">
            {BUILDINGS.map(b => {
              const lvl = myPlayer?.[LEVEL_FIELD[b.kind] as keyof typeof myPlayer] || 0;
              const cost = costFor(b, lvl);
              const canAfford = (myPlayer?.gold || 0) >= cost.gold && (myPlayer?.wood || 0) >= cost.wood;
              return (
                <button key={b.kind} className={`action-btn ${canAfford ? '' : 'disabled'}`} onClick={() => handleBuild(b.kind)}>
                  <span className="action-icon">{b.icon}</span>
                  <span className="action-name">{b.label} Lv{lvl}</span>
                  <span className="action-cost">{cost.gold > 0 && `${cost.gold}🪙`}{cost.gold > 0 && cost.wood > 0 ? ' ' : ''}{cost.wood > 0 && `${cost.wood}🪵`}</span>
                </button>
              );
            })}
            {myPlayer?.barracksLvl >= 1 && (
              <>
                <div className="troop-row">
                  <button className="action-btn troop-btn" onClick={() => sendTrain('infantry')}>
                    <span className="action-icon">🛡️</span>
                    <span className="action-name">Infantry</span>
                    <span className="troop-count">{myPlayer.infantry || 0}</span>
                  </button>
                  <button className="action-btn troop-btn" onClick={() => sendTrain('archers')}>
                    <span className="action-icon">🏹</span>
                    <span className="action-name">Archers</span>
                    <span className="troop-count">{myPlayer.archers || 0}</span>
                  </button>
                  <button className="action-btn troop-btn" onClick={() => sendTrain('cavalry')}>
                    <span className="action-icon">🐎</span>
                    <span className="action-name">Cavalry</span>
                    <span className="troop-count">{myPlayer.cavalry || 0}</span>
                  </button>
                </div>
                <div className="rps-hint">🛡️›🐎 ›🏹 ›🛡️</div>
              </>
            )}
            {myPlayer?.barracksLvl >= 1 && (
              <>
                <button className="action-btn" onClick={() => setShowAttackModal(true)}>
                  <span className="action-icon">⚔️</span>
                  <span className="action-name">March Army</span>
                </button>
                {showAttackModal && (
                  <div className="modal modal-attack">
                    <div className="modal-header">
                      <span className="modal-title">Select Troops to March</span>
                      <button className="modal-close" onClick={() => setShowAttackModal(false)}>×</button>
                    </div>
                    <div className="modal-body">
                      <div className="troop-row">
                        <div className="troop-select">
                          <span>🛡️ Infantry</span>
                          <input type="number" min="0" max={myPlayer.infantry || 0} value={attackTroops.infantry} onChange={(e) => setAttackTroops({...attackTroops, infantry: Math.max(0, parseInt(e.target.value) || 0)})} />
                        </div>
                        <div className="troop-select">
                          <span>🏹 Archers</span>
                          <input type="number" min="0" max={myPlayer.archers || 0} value={attackTroops.archers} onChange={(e) => setAttackTroops({...attackTroops, archers: Math.max(0, parseInt(e.target.value) || 0)})} />
                        </div>
                        <div className="troop-select">
                          <span>🐎 Cavalry</span>
                          <input type="number" min="0" max={myPlayer.cavalry || 0} value={attackTroops.cavalry} onChange={(e) => setAttackTroops({...attackTroops, cavalry: Math.max(0, parseInt(e.target.value) || 0)})} />
                        </div>
                      </div>
                      <div className="attack-actions">
                        <button className="action-btn" onClick={() => setShowAttackModal(false)}>Cancel</button>
                        <button className="action-btn" onClick={() => {
                          if (attackTroops.infantry + attackTroops.archers + attackTroops.cavalry > 0) {
                            setShowAttackModal(false);
                            alert('Select a target to march to (players or camps).'); // TODO: target selection modal
                          } else {
                            alert('Select at least one troop type.');
                          }
                        }}>Launch March</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {myPlayer?.smithyLvl >= 1 && (
              <button className="action-btn" onClick={() => sendResearch()}>
                <span className="action-icon">🧪</span>
                <span className="action-name">Research Lv{myPlayer?.researchLvl || 0}</span>
              </button>
            )}
            {buildProgress && (
              <div className="build-progress">
                <div className="build-progress-label">Building: {buildProgress.kind}</div>
                <div className="build-progress-track">
                  <div className="build-progress-fill" style={{ width: `${(buildProgress.pct || 0) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar — Leaderboard + Battle Log */}
      <div className="sidebar-right">
        {ranks.length > 0 && (
          <div className="panel">
            <h4 className="panel-title">LEADERBOARD</h4>
            <div className="leaderboard-list">
              {ranks.map((r: any, i: number) => (
                <div key={i} className={`rank-item ${r.name === myPlayer?.name ? 'me' : ''}`}>
                  <span className="rank-num">{i + 1}.</span>
                  <span className="rank-name">{r.name}</span>
                  <span className="rank-level">Lv{r.level ?? 1}</span>
                  <span className="rank-score">{r.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {battleLog.length > 0 && (
          <div className="panel">
            <h4 className="panel-title">⚔️ BATTLE REPORT</h4>
            <div className="battle-log-list">
              {battleLog.slice().reverse().map((l: string, i: number) => (
                <div key={i} className="battle-log-line">{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Minimap — bottom right */}
      <div className="minimap-wrap">
        <div className="minimap-title">REALM</div>
        <div className="minimap">
          {/* Resource nodes */}
          {room?.state?.nodes && Array.from(room.state.nodes.values()).map((n: any, i: number) => (
            <span key={i} className={`mm-dot mm-node ${n.type}`} style={{ left: `${(n.x / 1024) * 100}%`, top: `${(n.y / 1024) * 100}%` }} />
          ))}
          {/* Camps */}
          {room?.state?.camps && Array.from(room.state.camps.values()).map((c: any, i: number) => (
            <span key={i} className={`mm-dot ${c.alive ? 'mm-camp' : 'mm-ruin'}`} style={{ left: `${(c.x / 1024) * 100}%`, top: `${(c.y / 1024) * 100}%` }} />
          ))}
          {/* Players */}
          {room?.state?.players && Array.from(room.state.players.values()).map((p: any, i: number) => (
            <span key={i} className={`mm-dot ${p.name === myPlayer?.name ? 'you' : 'enemy'}`} style={{ left: `${(p.x / 1024) * 100}%`, top: `${(p.y / 1024) * 100}%` }} />
          ))}
        </div>
      </div>

      {/* Chat — bottom bar */}
      <div className="chat-bar">
        <div className="chat-messages">
          {chatMessages.slice(-5).map((m: any, i: number) => (
            <div key={i} className="chat-line">
              <span className="chat-name" style={{ color: THEME.strings.gold }}>{m.name}:</span>
              <span className="chat-text"> {m.message}</span>
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && chatInput.trim()) {
                sendChat(chatInput.trim());
                setChatInput('');
              }
            }}
            placeholder="Message world chat..."
          />
        </div>
      </div>
    </div>
  );
}
