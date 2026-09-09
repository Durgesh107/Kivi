import Database from 'better-sqlite3';
import { evaluatePhoneticGate, checkHomophoneRisk } from './writePath';
import { extractNgrams } from './readPath';

/**
 * Compares original ASR text with user-edited text to isolate the changed words.
 * Strips exact matching words from the start and end of both sentences.
 */
// src/lib/implicitExtraction.ts (Update the isolateEdit function)

/**
 * Compares original ASR text with user-edited text to isolate the changed words.
 * Strips exact matching words (case-insensitive) from the start and end of both sentences.
 */
function isolateEdit(originalAsr: string, userEdited: string): { asrReplaced: string, editInserted: string } | null {
  const asrTokens = originalAsr.trim().split(/\s+/);
  const editTokens = userEdited.trim().split(/\s+/);

  let start = 0;
  // Use .toLowerCase() to ignore casing when stripping identical context words
  while (
    start < asrTokens.length && 
    start < editTokens.length && 
    asrTokens[start].toLowerCase() === editTokens[start].toLowerCase()
  ) {
    start++;
  }

  let asrEnd = asrTokens.length - 1;
  let editEnd = editTokens.length - 1;
  while (
    asrEnd >= start && 
    editEnd >= start && 
    asrTokens[asrEnd].toLowerCase() === editTokens[editEnd].toLowerCase()
  ) {
    asrEnd--;
    editEnd--;
  }

  const asrReplaced = asrTokens.slice(start, asrEnd + 1).join(' ');
  const editInserted = editTokens.slice(start, editEnd + 1).join(' ');

  if (!asrReplaced || !editInserted) return null;
  return { asrReplaced, editInserted };
}

/**
 * Silently observes user edits. If the edit is a phonetic correction (fixing an ASR typo) 
 * rather than a semantic rewrite, it adds the word as a 'candidate' to the dictionary.
*/
export function processImplicitEdit(
  db: Database.Database,
  userId: string,
  originalAsrText: string,
  userEditedText: string
): { added: boolean; canonicalWord?: string; status?: string; confidenceScore?: number } {
  
  // 1. Find the exact words that changed
  const diff = isolateEdit(originalAsrText, userEditedText);
  if (!diff) return { added: false };

  // 2. Pass through the Asymmetric Phonetic Gate
  // If the user completely rewrote the sentence ("Let's go" -> "I am leaving"), isPhonetic is false.
  // If the user fixed a typo ("AWS" -> "a w s"), isPhonetic is true.
  const { isPhonetic } = evaluatePhoneticGate(diff.asrReplaced, diff.editInserted);
  if (!isPhonetic) {
    return { added: false }; // Ignore semantic rewrites
  }

  const normWord = diff.editInserted.toLowerCase().trim();
  const normAlias = diff.asrReplaced.toLowerCase().trim();
  const { hasRisk } = checkHomophoneRisk(diff.editInserted);

  // 3. Upsert Candidate into Database
  // If it's brand new, it starts at 0.40 confidence. 
  // If we observe it again implicitly, we bump confidence by 0.1.
  const insertEntry = db.prepare(`
    INSERT INTO dictionary_entries 
    (user_id, canonical_word, canonical_word_normalized, status, confidence_score, has_homophone_risk)
    VALUES (?, ?, ?, 'candidate', 0.40, ?)
    ON CONFLICT(user_id, canonical_word_normalized) 
    DO UPDATE SET 
      confidence_score = MIN(1.0, dictionary_entries.confidence_score + 0.1),
      last_seen_at = CURRENT_TIMESTAMP
  `);
  
  const info = insertEntry.run(userId, diff.editInserted, normWord, hasRisk ? 1 : 0);
  const entry = db.prepare(`SELECT id, status, confidence_score FROM dictionary_entries WHERE user_id = ? AND canonical_word_normalized = ?`).get(userId, normWord) as any;

  // 4. Save the misheard alias
  if (normAlias !== normWord) {
    const insertAlias = db.prepare(`
      INSERT INTO aliases (entry_id, alias_normalized)
      VALUES (?, ?)
      ON CONFLICT(entry_id, alias_normalized) DO NOTHING
    `);
    insertAlias.run(entry.id, normAlias);
  }

  // 5. Anchor the surrounding words as positive context cues
  const ngrams = extractNgrams(userEditedText);
  const insertCue = db.prepare(`
    INSERT INTO context_cues (entry_id, cue_phrase, cue_type)
    VALUES (?, ?, 'positive')
    ON CONFLICT(entry_id, cue_phrase, cue_type) DO NOTHING
  `);

  for (const ng of ngrams) {
    insertCue.run(entry.id, ng.text.toLowerCase());
  }

  return {
    added: true,
    canonicalWord: diff.editInserted,
    status: entry.status,
    confidenceScore: entry.confidence_score
  };
}