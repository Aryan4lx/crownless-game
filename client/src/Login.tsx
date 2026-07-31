import { useState } from 'react';
import { joinWorld } from './network';
import './Login.css';

const FACTIONS = [
  { id: 'sultan', name: 'Sultan', color: '#d4a64a', desc: '+10% Research Speed, +5% Gold earning', region: 'Desert / Middle Eastern' },
  { id: 'tsar',   name: 'Tsar',   color: '#b8334a', desc: '+10% Training Speed, +5% Troop Defense', region: 'Northern / Eastern European' },
  { id: 'king',   name: 'King',   color: '#3a5fa8', desc: '+10% Construction Speed, +5% March Speed', region: 'Western European' },
  { id: 'khan',   name: 'Khan',   color: '#8a7a5a', desc: '+10% March Speed, +5% Gathering Yield', region: 'Steppe / Central Asian' },
];

export default function Login({ onJoin }: { onJoin: (room: any) => void }) {
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('sultan');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    if (!name.trim()) { setError('Enter a ruler name'); return; }
    setConnecting(true);
    setError('');
    try {
      const room = await joinWorld(name.trim(), faction);
      onJoin(room);
    } catch (e: any) {
      setError(e?.message || 'Failed to connect');
      setConnecting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="title">⚔️ CROWNLESS</h1>
        <p className="subtitle">Persistent-world MMORTS</p>

        <div className="input-group">
          <label>Ruler Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Enter your name..."
            disabled={connecting}
          />
        </div>

        <div className="faction-select">
          <label>Choose Your Faction</label>
          <div className="faction-grid">
            {FACTIONS.map((f) => (
              <div
                key={f.id}
                className={`faction-card ${faction === f.id ? 'selected' : ''}`}
                onClick={() => setFaction(f.id)}
                style={{ borderColor: faction === f.id ? f.color : undefined }}
              >
                <div className="faction-banner" style={{ background: f.color }} />
                <div className="faction-name">{f.name}</div>
                <div className="faction-desc">{f.desc}</div>
                <div className="faction-region">{f.region}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="join-btn"
          onClick={handleJoin}
          disabled={connecting || !name.trim()}
        >
          {connecting ? 'Forging your kingdom...' : 'Enter the Realm'}
        </button>
      </div>
    </div>
  );
}
