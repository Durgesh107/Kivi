import express, { Request, Response } from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/init';
import { processAudioText } from './lib/readPath';
import { processImplicitEdit } from './lib/implicitExtraction';
import { handleUserRevert, handleUserReinforcement } from './lib/feedbackLoop';

const app = express();
const PORT = process.env.PORT || 3000;

const db = initializeDatabase('memory.db');

app.use(cors());
app.use(express.json());

/**
 * POST /api/process
 * Main inference endpoint. Takes raw ASR and formatted text, routes through Tiers 0-2,
 * and returns the contextually corrected text.
*/
app.post('/api/process', async (req: Request, res: Response) => {
  try {
    const { userId, rawAsr, formattedText } = req.body;
    if (!userId || !rawAsr || !formattedText) {
      return res.status(400).json({ error: 'Missing required fields: userId, rawAsr or formattedText' });
    }
    const result = await processAudioText(db, userId, rawAsr, formattedText);
    res.json(result);
  } catch (error) {
    console.error('Server Error in /api/process:', error);
    res.status(500).json({ error: 'Internal server error during text processing' });
  }
});

/**
 * POST /api/implicit-edit
 * The "Brain" endpoint. Listens to user keyboard edits on the UI, checks if they are 
 * phonetic typo fixes, and silently learns them.
 */
app.post('/api/implicit-edit', (req: Request, res: Response) => {
  try {
    const { userId, originalAsrText, userEditedText } = req.body;
    if (!userId || !originalAsrText || !userEditedText) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = processImplicitEdit(db, userId, originalAsrText, userEditedText);
    res.json(result);
  } catch (error) {
    console.error('[Server] Error in /api/implicit-edit:', error);
    res.status(500).json({ error: 'Internal server error during implicit edit extraction' });
  }
});

/**
 * POST /api/feedback
 * The State Machine endpoint. Handles explicit "undo" or "accept" signals from the user UI
 * to adjust confidence scores or suppress bad automated replacements.
 */
app.post('/api/feedback', (req: Request, res: Response) => {
  try {
    const { userId, canonicalWord, contextSentence, action } = req.body;
    if (!userId || !canonicalWord || !contextSentence || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let result;
    if (action === 'revert') {
      result = handleUserRevert(db, userId, canonicalWord, contextSentence);
    } else if (action === 'reinforce') {
      result = handleUserReinforcement(db, userId, canonicalWord, contextSentence);
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be "revert" or "reinforce"' });
    }

    res.json(result);
  } catch (error) {
    console.error('[Server] Error in /api/feedback:', error);
    res.status(500).json({ error: 'Internal server error processing feedback' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`[Server] Kivi-memory API is running on http://localhost:${PORT}`);
});