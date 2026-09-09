// src/lib/feedbackLoop.ts

import Database from 'better-sqlite3';
import { extractNgrams } from './readPath';

/**
 * Handles a user revert event (when an automated correction is undone by the user),
 * incrementing consecutive reverts, penalizing confidence, triggering suppression at threshold,
 * and recording negative context cues.
 */
export function handleUserRevert(
  db: Database.Database,
  userId: string,
  canonicalWord: string,
  contextSentence: string
): { status: string; consecutiveReverts: number; confidenceScore: number } {
  const normWord = canonicalWord.toLowerCase().trim();

  // 1. Fetch current entry state (Added the missing SELECT keyword here)
  const entry = db.prepare(`
    SELECT id, confidence_score as confidenceScore, consecutive_reverts as consecutiveReverts, status
    FROM dictionary_entries
    WHERE user_id = ? AND canonical_word_normalized = ?
  `).get(userId, normWord) as any;

  if (!entry) {
    return { status: 'not_found', consecutiveReverts: 0, confidenceScore: 0 };
  }

  const newReverts = entry.consecutiveReverts + 1;
  const newConfidence = Math.max(0.0, entry.confidenceScore - 0.25);
  const newStatus = newReverts >= 3 ? 'suppressed' : entry.status;

  // 2. Update entry metrics in database
  const updateStmt = db.prepare(`
    UPDATE dictionary_entries
    SET consecutive_reverts = ?, confidence_score = ?, status = ?, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  updateStmt.run(newReverts, newConfidence, newStatus, entry.id);

  // 3. Extract n-grams from context sentence and store as negative context cues
  const ngrams = extractNgrams(contextSentence);
  const insertCue = db.prepare(`
    INSERT INTO context_cues (entry_id, cue_phrase, cue_type)
    VALUES (?, ?, 'negative')
    ON CONFLICT(entry_id, cue_phrase, cue_type) DO NOTHING
  `);

  for (const ng of ngrams) {
    insertCue.run(entry.id, ng.text.toLowerCase());
  }

  return {
    status: newStatus,
    consecutiveReverts: newReverts,
    confidenceScore: newConfidence
  };
}

/**
 * Handles a user acceptance or reinforcement event (when a correction is kept or explicitly validated),
 * resetting consecutive reverts, rewarding confidence, promoting status if applicable,
 * and recording positive context cues.
 */
export function handleUserReinforcement(
  db: Database.Database,
  userId: string,
  canonicalWord: string,
  contextSentence: string
): { status: string; confidenceScore: number } {
  const normWord = canonicalWord.toLowerCase().trim();

  // 1. Fetch current entry state
  const entry = db.prepare(`
    SELECT id, confidence_score as confidenceScore, status
    FROM dictionary_entries
    WHERE user_id = ? AND canonical_word_normalized = ?
  `).get(userId, normWord) as any;

  if (!entry) {
    return { status: 'not_found', confidenceScore: 0 };
  }

  const newConfidence = Math.min(1.0, entry.confidenceScore + 0.15);
  let newStatus = entry.status;

  // Promote candidate to active if confidence clears threshold
  if (newStatus === 'candidate' && newConfidence >= 0.70) {
    newStatus = 'active';
  }

  // 2. Update entry metrics in database
  const updateStmt = db.prepare(`
    UPDATE dictionary_entries
    SET consecutive_reverts = 0, confidence_score = ?, status = ?, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  updateStmt.run(newConfidence, newStatus, entry.id);

  // 3. Extract n-grams from context sentence and store as positive context cues
  const ngrams = extractNgrams(contextSentence);
  const insertCue = db.prepare(`
    INSERT INTO context_cues (entry_id, cue_phrase, cue_type)
    VALUES (?, ?, 'positive')
    ON CONFLICT(entry_id, cue_phrase, cue_type) DO NOTHING
  `);

  for (const ng of ngrams) {
    insertCue.run(entry.id, ng.text.toLowerCase());
  }

  return {
    status: newStatus,
    confidenceScore: newConfidence
  };
}