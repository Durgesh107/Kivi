import Database from 'better-sqlite3';
import doubleMetaphone from 'talisman/phonetics/double-metaphone';
import levenshtein from 'talisman/metrics/levenshtein';
import { SYSTEM_COMMON_WORDS } from '../db/CommonWords';

/**
 * Evaluates the Asymmetric Phonetic Gate between an ASR output and a user edit,
 * returning similarity scores and metaphone alignment metrics.
 */
export function evaluatePhoneticGate(asrWord: string, editWord: string): { isPhonetic: boolean; simScore: number; metaphoneMatch: boolean } {
  const cleanAsr = asrWord.toLowerCase().trim();
  const cleanEdit = editWord.toLowerCase().trim();

  const maxLen = Math.max(cleanAsr.length, cleanEdit.length);
  if (maxLen === 0) return { isPhonetic: false, simScore: 0, metaphoneMatch: false };

  const levDist = levenshtein(cleanAsr, cleanEdit);
  const simScore = 1 - levDist / maxLen;

  const [asrPrimary, asrSecondary] = doubleMetaphone(cleanAsr);
  const [editPrimary, editSecondary] = doubleMetaphone(cleanEdit);

  const metaphoneMatch = 
    (asrPrimary !== '' && (asrPrimary === editPrimary || asrPrimary === editSecondary)) ||
    (asrSecondary !== '' && (asrSecondary === editPrimary || asrSecondary === editSecondary));

  const lenDelta = Math.abs(cleanAsr.length - cleanEdit.length);

  // Asymmetric Gate Conditions:
  // 1. High similarity floor (>= 0.75)
  // 2. Moderate similarity floor (>= 0.70) + Metaphone match + Length delta <= 1
  const isPhonetic = 
    simScore >= 0.75 || 
    (simScore >= 0.70 && metaphoneMatch && lenDelta <= 1);

  return { isPhonetic, simScore, metaphoneMatch };
}

/**
 * Dynamically checks if a new custom word risks colliding with standard English common words
 * by running phonetic gate evaluations against the global corpus.
 */
export function checkHomophoneRisk(newWord: string): { hasRisk: boolean; collidesWith?: string } {
  for (const commonWord of SYSTEM_COMMON_WORDS) {
    if (evaluatePhoneticGate(commonWord, newWord).isPhonetic) {
      return { hasRisk: true, collidesWith: commonWord };
    }
  }
  return { hasRisk: false };
}

/**
 * Adds an explicit entry and its raw ASR alias directly into the SQLite memory database,
 * initializing status, confidence score, and homophone risk flags.
 */
export function addExplicitEntry(db: Database.Database, userId: string, canonicalWord: string, rawAsr: string) {
  const normWord = canonicalWord.toLowerCase().trim();
  const normAlias = rawAsr.toLowerCase().trim();

  // 1. Run live homophone risk assessment against common words corpus
  const { hasRisk } = checkHomophoneRisk(canonicalWord);

  const insertEntry = db.prepare(`
    INSERT INTO dictionary_entries (user_id, canonical_word, canonical_word_normalized, status, confidence_score, has_homophone_risk)
    VALUES (?, ?, ?, 'active', 1.0, ?)
    ON CONFLICT(user_id, canonical_word_normalized) 
    DO UPDATE SET status = 'active', confidence_score = 1.0, has_homophone_risk = excluded.has_homophone_risk, last_seen_at = CURRENT_TIMESTAMP
  `);

  const info = insertEntry.run(userId, canonicalWord, normWord, hasRisk ? 1 : 0);
  const entryId = info.lastInsertRowid || (db.prepare(`SELECT id FROM dictionary_entries WHERE user_id = ? AND canonical_word_normalized = ?`).get(userId, normWord) as any).id;

  if (normAlias !== normWord) {
    const insertAlias = db.prepare(`
      INSERT INTO aliases (entry_id, alias_normalized)
      VALUES (?, ?)
      ON CONFLICT(entry_id, alias_normalized) DO NOTHING
    `);
    insertAlias.run(entryId, normAlias);
  }

  return { entryId, hasRisk };
}