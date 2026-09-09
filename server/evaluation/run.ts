import Database from 'better-sqlite3';
import path from 'path';

interface TestCase {
  id: string;
  description: string;
  rawAsr: string;
  formattedText: string;
  expectedOutput: string;
  shouldIntervene: boolean;
}

const testCases: TestCase[] = [
  {
    id: 'TC-01',
    description: 'Exact phonetic match triggering Tier 1 Fast Apply',
    rawAsr: 'building with next js is fast',
    formattedText: 'Building with next js is fast.',
    expectedOutput: 'Building with Next.js is fast.',
    shouldIntervene: true,
  },
  {
    id: 'TC-02',
    description: 'Deliberate bypass when no personal memory context matches',
    rawAsr: 'the weather outside is quite nice today',
    formattedText: 'The weather outside is quite nice today.',
    expectedOutput: 'The weather outside is quite nice today.',
    shouldIntervene: false,
  },
  {
    id: 'TC-03',
    description: 'Ambiguous homophone requiring context verification',
    rawAsr: 'ask aditya to review the sarvam kiwi service',
    formattedText: 'Ask Aditya to review the Sarvam Kiwi service.',
    expectedOutput: 'Ask Aaditya to review the Sarvam Kivi service.',
    shouldIntervene: true,
  }
];

async function runEvaluation() {
  console.log(' Starting Kivi-memory Evaluation Suite...\n');
  const startTimeTotal = Date.now();
  
  let passedCount = 0;
  const results = [];

  for (const tc of testCases) {
    const startCase = performance.now();
    
    // Simulate API call or call processing logic directly
    try {
      const response = await fetch('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'test_user_alpha',
          rawAsr: tc.rawAsr,
          formattedText: tc.formattedText
        })
      });
      
      const data = await response.json() as { outputText: string; traceType: string };
      const endCase = performance.now();
      const latencyMs = Math.round(endCase - startCase);

      const matched = data.outputText === tc.expectedOutput;
      if (matched) passedCount++;

      results.push({
        id: tc.id,
        description: tc.description,
        passed: matched,
        latencyMs,
        traceType: data.traceType,
        expected: tc.expectedOutput,
        actual: data.outputText
      });

      console.log(`[${tc.id}] ${matched ? '✅ PASS' : '❌ FAIL'} (${latencyMs}ms) - Trace: ${data.traceType}`);
    } catch (error) {
      console.error(`[${tc.id}] ❌ ERROR: Server offline or unreachable.`);
    }
  }

  console.log('\n========================================');
  console.log(`Evaluation Complete: ${passedCount}/${testCases.length} Passed`);
  console.log(`Total Duration: ${Date.now() - startTimeTotal}ms`);
  console.log('========================================');
}

runEvaluation();