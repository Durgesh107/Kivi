import { create } from 'zustand';

interface KiviState {
  userId: string;
  isProcessing: boolean;
  systemLog: string | null;
  processAsrEvent: (rawAsr: string, formattedText: string) => Promise<string>;
  submitImplicitEdit: (originalText: string, editedText: string) => Promise<void>;
  submitFeedback: (canonicalWord: string, contextSentence: string, action: 'revert' | 'reinforce') => Promise<void>;
  startListening: (onTranscriptReady: (correctedText: string) => void) => void;
}

const API_BASE = 'http://localhost:3000/api';

export const useKiviStore = create<KiviState>((set, get) => ({
  userId: 'test_user_alpha', 
  isProcessing: false,
  systemLog: '🟢 System ready',

  processAsrEvent: async (rawAsr, formattedText) => {
    set({ isProcessing: true, systemLog: '⚙️ Processing audio...' });
    try {
      const res = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: get().userId, rawAsr, formattedText }),
      });
      const data = await res.json();
      set({ systemLog: `⚡ Applied via ${data.traceType}` });
      return data.outputText;
    } catch (error) {
      set({ systemLog: '❌ Error processing ASR' });
      return formattedText; 
    } finally {
      set({ isProcessing: false });
    }
  },

  submitImplicitEdit: async (originalText, editedText) => {
    if (originalText === editedText) return;
    
    set({ systemLog: '🧠 Analyzing edit...' });
    try {
      const res = await fetch(`${API_BASE}/implicit-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: get().userId, 
          originalAsrText: originalText, 
          userEditedText: editedText 
        }),
      });
      const data = await res.json();
      if (data.canonicalWord) {
        set({ systemLog: `🧠 Learned new word: "${data.canonicalWord}" (Score: ${data.confidenceScore})` });
      } else {
        set({ systemLog: `👀 Edit ignored (No phonetic match)` });
      }
    } catch (error) {
      set({ systemLog: '❌ Error learning edit' });
    }
  },

  submitFeedback: async (canonicalWord, contextSentence, action) => {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: get().userId, 
          canonicalWord, 
          contextSentence, 
          action 
        }),
      });
      set({ systemLog: `🔄 Feedback applied: ${action.toUpperCase()} for "${canonicalWord}"` });
    } catch (error) {
      set({ systemLog: '❌ Error submitting feedback' });
    }
  },

  startListening: (onTranscriptReady) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      set({ systemLog: '❌ Speech Recognition API not supported in this browser. Try Chrome.' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      set({ systemLog: '🎙️ Listening... Speak now!' });
    };

    recognition.onresult = async (event: any) => {
      const rawAsr = event.results[0][0].transcript;
      set({ systemLog: `🗣️ Captured ASR: "${rawAsr}"` });

      const formattedText = rawAsr.charAt(0).toUpperCase() + rawAsr.slice(1) + '.';
      const correctedText = await get().processAsrEvent(rawAsr, formattedText);
      onTranscriptReady(correctedText);
    };

    recognition.onerror = (event: any) => {
      set({ systemLog: `❌ Speech error: ${event.error}` });
    };

    recognition.start();
  }
}));