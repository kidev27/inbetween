CREATE TABLE players (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- One row per player per round. `state` is the mode's own JSON; core code never reads inside it.
CREATE TABLE runs (
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL,
  day TEXT NOT NULL,
  slot INTEGER NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  PRIMARY KEY (player_id, mode, day, slot)
);
