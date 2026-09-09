import React, { useState } from 'react';
import { useKiviStore } from '../store/useKiviStore';

export function TranscriptEditor() {
  const { processAsrEvent, startListening, submitImplicitEdit, submitFeedback, isProcessing, systemLog } = useKiviStore();
  
  const [currentText, setCurrentText] = useState('');
  const [baseAsrText, setBaseAsrText] = useState('');

  const handleIncomingAsr = async () => {
    const rawAsr = "building with next js is fast";
    const formattedText = "Building with next js is fast.";
    const correctedText = await processAsrEvent(rawAsr, formattedText);
    setCurrentText(correctedText);
    setBaseAsrText(correctedText);
  };

  // NEW: Trigger browser voice recording
  const handleVoiceInput = () => {
    startListening((correctedText) => {
      setCurrentText(correctedText);
      setBaseAsrText(correctedText);
    });
  };

  const handleBlur = () => {
    if (currentText !== baseAsrText) {
      submitImplicitEdit(baseAsrText, currentText);
      setBaseAsrText(currentText); 
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Kivi-memory Live Transcript</h2>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={handleVoiceInput}
            disabled={isProcessing}
            className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            🎙️ Speak
          </button>
          <button 
            onClick={handleIncomingAsr}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Simulate ASR
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <textarea
          value={currentText}
          onChange={(e) => setCurrentText(e.target.value)}
          onBlur={handleBlur}
          className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          placeholder="Speak or simulate text here... edit it to train the brain."
        />
      </div>

      <div className="bg-gray-800 text-green-400 font-mono text-sm p-3 rounded-lg flex items-center shadow-inner">
        <span className="mr-2">Terminal:~$</span>
        {systemLog}
      </div>

      <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
        <button 
          onClick={() => submitFeedback('Next.js', currentText, 'revert')}
          className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
        >
          Revert "Next.js"
        </button>
        <button 
          onClick={() => submitFeedback('Next.js', currentText, 'reinforce')}
          className="px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors"
        >
          Reinforce "Next.js"
        </button>
      </div>
    </div>
  );
}