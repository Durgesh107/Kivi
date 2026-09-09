PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dictionary_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  canonical_word TEXT NOT NULL,
  canonical_word_normalized TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('candidate', 'active', 'suppressed')),
  confidence_score REAL NOT NULL DEFAULT 0.40,
  consecutive_reverts INTEGER NOT NULL DEFAULT 0,
  has_homophone_risk INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, canonical_word_normalized)
);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  alias_normalized TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES dictionary_entries(id) ON DELETE CASCADE,
  UNIQUE(entry_id, alias_normalized)
);

CREATE TABLE IF NOT EXISTS context_cues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  cue_phrase TEXT NOT NULL,
  cue_type TEXT NOT NULL CHECK(cue_type IN ('positive', 'negative')),
  FOREIGN KEY (entry_id) REFERENCES dictionary_entries(id) ON DELETE CASCADE,
  UNIQUE(entry_id, cue_phrase, cue_type)
);

CREATE INDEX IF NOT EXISTS idx_dictionary_lookup ON dictionary_entries(user_id, canonical_word_normalized);
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_cues_entry ON context_cues(entry_id);