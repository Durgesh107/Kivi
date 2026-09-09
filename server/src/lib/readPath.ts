import Database from 'better-sqlite3';
import * as doubleMetaphoneMod from 'talisman/phonetics/double-metaphone';
import { GoogleGenAI, Type } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

const doubleMetaphone = (doubleMetaphoneMod as any).default || doubleMetaphoneMod;

export function buildCharAlignmentMap(asr: string, fmt: string): Map<number, number> {
  const map = new Map<number, number>();
  const cleanAsr = asr.toLowerCase();
  const cleanFmt = fmt.toLowerCase();

  let fmtIdx = 0;
  for (let asrIdx = 0; asrIdx < cleanAsr.length; asrIdx++) {
    const char = cleanAsr[asrIdx];
    if (char === ' ' || char === '\t' || char === '\n') continue;
    while (fmtIdx < cleanFmt.length && cleanFmt[fmtIdx] !== char) {
      fmtIdx++;
    }
    if (fmtIdx < cleanFmt.length) {
      map.set(asrIdx, fmtIdx);
      fmtIdx++;
    }
  }
  return map;
}

export function extractNgrams(text: string): Array<{ text: string; startIndex: number; wordCount: number }> {
  const words = text.trim().split(/\s+/);
  const ngrams: Array<{ text: string; startIndex: number; wordCount: number }> = [];

  let charIndex = 0;
  const wordIndices: number[] = [];
  for (const w of words) {
    wordIndices.push(charIndex);
    charIndex += w.length + 1; 
  }

  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3; n++) {
      if (i + n <= words.length) {
        const slice = words.slice(i, i + n);
        ngrams.push({
          text: slice.join(' '),
          startIndex: wordIndices[i],
          wordCount: n
        });
      }
    }
  }
  return ngrams;
}
export async function processAudioText(
  db: Database.Database, // updated type based on your imports
  userId: string,
  rawAsr: string,
  formattedText: string
): Promise<{ outputText: string; traceType: string }> {
  const alignmentMap = buildCharAlignmentMap(rawAsr, formattedText);
  const ngrams = extractNgrams(rawAsr);

  const candidates: Array<{
    entryId: number;
    canonicalWord: string;
    status: string;
    confidenceScore: number;
    hasHomophoneRisk: number;
    alias: string;
    matchTarget: string;
    isExact: boolean;
  }> = [];

  const lookupStmt = db.prepare(`
    SELECT DISTINCT de.id as entryId, de.canonical_word as canonicalWord, 
           de.status, de.confidence_score as confidenceScore, 
           de.has_homophone_risk as hasHomophoneRisk, a.alias_normalized as alias
    FROM dictionary_entries de
    JOIN aliases a ON de.id = a.entry_id
    WHERE de.user_id = ? AND de.status != 'suppressed'
  `);

  const dbEntries = lookupStmt.all(userId) as any[];

  // Map ngrams to database entries via phonetic/alias matching
  for (const ng of ngrams) {
    const cleanNg = ng.text.toLowerCase().trim();
    for (const entry of dbEntries) {
      if (entry.alias === cleanNg) {
        candidates.push({ ...entry, matchTarget: ng.text, isExact: true });
      } else {
        const entryMeta = doubleMetaphone(entry.alias);
        const ngMeta = doubleMetaphone(cleanNg);
        if (entryMeta && entryMeta[0] !== '' && entryMeta[0] === ngMeta[0] && Math.abs(entry.alias.length - cleanNg.length) <= 2) {
          candidates.push({ ...entry, matchTarget: ng.text, isExact: false });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { outputText: formattedText, traceType: 'TIER0_BYPASS' };
  }

  // Sort candidates intelligently
  candidates.sort((a, b) => {
    // 1. Highest confidence wins
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    // 2. Exact match wins over phonetic match
    if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
    // 3. Longer database alias wins
    return b.alias.length - a.alias.length;
  });
  
  let currentText = formattedText;
  let finalTrace = 'TIER0_BYPASS';

  // Process all matched candidates in the sentence instead of just candidates[0]
  for (const candidate of candidates) {
    // Skip if this target was already replaced
    const regex = new RegExp(`\\b${candidate.matchTarget}\\b`, 'i');
    if (!regex.test(currentText)) continue;

    // Tier 1 Fast Apply
    if (candidate.confidenceScore >= 0.85 && candidate.hasHomophoneRisk === 0) {
      currentText = applySplice(currentText, candidate.matchTarget, candidate.canonicalWord, alignmentMap);
      if (finalTrace === 'TIER0_BYPASS') finalTrace = 'TIER1_FAST_APPLY';
    } 
    // Tier 2 LLM Safety Check
    else {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return { outputText: currentText, traceType: 'EXECUTION_ERROR' };

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
         contents: `You are a transcript editor. Context sentence: "${currentText}". The user explicitly prefers the custom personal spelling "${candidate.canonicalWord}". Should we apply this replacement? Bias towards true unless it completely breaks the sentence structure.`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: { shouldIntervene: { type: Type.BOOLEAN } },
              required: ['shouldIntervene']
            }
          }
        });

        const result = JSON.parse(response.text || '{}');
        if (result.shouldIntervene) {
          currentText = applySplice(currentText, candidate.matchTarget, candidate.canonicalWord, alignmentMap);
          finalTrace = 'TIER2_APPLIED';
        } else {
          if (finalTrace === 'TIER0_BYPASS') finalTrace = 'TIER2_REJECTED_CONTEXT';
        }
      } catch (err) {
        return { outputText: currentText, traceType: 'EXECUTION_ERROR' };
      }
    }
  }

  return { outputText: currentText, traceType: finalTrace };
}

function applySplice(formattedText: string, targetSubstring: string, replacement: string, alignmentMap: Map<number, number>): string {
  const regex = new RegExp(`\\b${targetSubstring}\\b`, 'i');
  if (regex.test(formattedText)) {
    return formattedText.replace(regex, replacement);
  }
  return formattedText;
}