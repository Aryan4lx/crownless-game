// Persistence layer — node:sqlite (built into Node 22+, zero deps)
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'crownless.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    name TEXT PRIMARY KEY,
    faction TEXT NOT NULL,
    gold REAL DEFAULT 100,
    food REAL DEFAULT 50,
    wood REAL DEFAULT 50,
    army INTEGER DEFAULT 0,
    xp REAL DEFAULT 0,
    level INTEGER DEFAULT 1,
    castle_lvl INTEGER DEFAULT 1,
    barracks_lvl INTEGER DEFAULT 0,
    smithy_lvl INTEGER DEFAULT 0,
    farm_lvl INTEGER DEFAULT 0,
    mine_lvl INTEGER DEFAULT 0,
    research_lvl INTEGER DEFAULT 0,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    created_at INTEGER DEFAULT 0,
    last_seen INTEGER DEFAULT 0
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO players (name, faction, gold, food, wood, army, xp, level,
    castle_lvl, barracks_lvl, smithy_lvl, farm_lvl, mine_lvl, research_lvl,
    x, y, created_at, last_seen)
  VALUES (@name, @faction, @gold, @food, @wood, @army, @xp, @level,
    @castle_lvl, @barracks_lvl, @smithy_lvl, @farm_lvl, @mine_lvl, @research_lvl,
    @x, @y, @created_at, @last_seen)
  ON CONFLICT(name) DO UPDATE SET
    gold=@gold, food=@food, wood=@wood, army=@army, xp=@xp, level=@level,
    castle_lvl=@castle_lvl, barracks_lvl=@barracks_lvl, smithy_lvl=@smithy_lvl,
    farm_lvl=@farm_lvl, mine_lvl=@mine_lvl, research_lvl=@research_lvl,
    x=@x, y=@y, last_seen=@last_seen
`);

const selectStmt = db.prepare(`SELECT * FROM players WHERE name = ?`);

/**
 * Load a player from DB, or return null if not found.
 */
export function loadPlayer(name) {
  const row = selectStmt.get(name);
  if (!row) return null;
  return {
    name: row.name,
    faction: row.faction,
    gold: row.gold,
    food: row.food,
    wood: row.wood,
    army: row.army,
    xp: row.xp,
    level: row.level,
    castleLvl: row.castle_lvl,
    barracksLvl: row.barracks_lvl,
    smithyLvl: row.smithy_lvl,
    farmLvl: row.farm_lvl,
    mineLvl: row.mine_lvl,
    researchLvl: row.research_lvl,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  };
}

/**
 * Save (upsert) a player's state to DB.
 */
export function savePlayer(p) {
  const now = Date.now();
  upsertStmt.run({
    name: p.name,
    faction: p.faction,
    gold: Math.round(p.gold),
    food: Math.round(p.food),
    wood: Math.round(p.wood),
    army: p.army,
    xp: Math.round(p.xp),
    level: p.level,
    castle_lvl: p.castleLvl || 1,
    barracks_lvl: p.barracksLvl || 0,
    smithy_lvl: p.smithyLvl || 0,
    farm_lvl: p.farmLvl || 0,
    mine_lvl: p.mineLvl || 0,
    research_lvl: p.researchLvl || 0,
    x: Math.round(p.x),
    y: Math.round(p.y),
    created_at: p.createdAt || now,
    last_seen: now,
  });
}

/**
 * Get total registered player count.
 */
export function playerCount() {
  const row = db.prepare('SELECT COUNT(*) as c FROM players').get();
  return row?.c ?? 0;
}

export { db };
