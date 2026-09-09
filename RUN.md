```markdown
# RUN.md - Kivi-memory Evaluation & Review Guide

## Primary Review Method
Completely local application running via Node.js backend (`server`) and Vite React frontend (`client`), managed concurrently from the root workspace.

```

## 1. Runtimes & Versions
```bash
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Browser**: Google Chrome (required for Web Speech API microphone support)
```

## 2. Environment Variables
```bash
An LLM key is required for Tier 2 context verification. Create a `.env` file inside the `server/` directory based on the provided `.env.example`:
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here

```

## 3. Installation Commands

Install dependencies for both the backend and frontend. From the root repository, run:

```bash
cd server
npm install
cd ../client
npm install

```

## 4. Database Initialization & Seeding

To create the SQLite database (`memory.db`), run the migrations, and inject the reproducible seed data, execute the following from the `server` directory:

```bash
cd server
npx tsx src/db/init.ts

```

## 5. Starting the Application

You will need two terminal windows to run the frontend and backend concurrently.

**Terminal 1 (Backend):**

```bash
cd server
npm run dev

```

**Terminal 2 (Frontend):**

```bash
cd client
npm run dev

```

## 6. Interface to Open

Open Google Chrome and navigate to the Vite local URL provided in Terminal 2 (typically **`http://localhost:5173`**).

## 7. Primary Interactions to Try

1. Click **"Simulate ASR Event"** to test Tier 1 fast-apply matching (e.g., matching `"next js"` to `"Next.js"` instantly).
2. Click **🎙️ Speak** and say "Ask Aditya to review the Sarvam Kiwi service" out loud to test real-time browser ASR ingestion and Tier 2 LLM context verification.
3. Edit the transcript text box manually and click away (`onBlur`) to test the background implicit learning engine.
4. Click the **Revert** or **Reinforce** buttons in the UI to test the explicit feedback state machine (which updates confidence scores in the database).

## 8. Running the Evaluation Suite

Keep the server running in Terminal 1. In a new terminal, execute the reproducible evaluation script:

```bash
cd server
npx tsx evaluation/run.ts

```

## 9. Evaluation Results Location

The evaluation results are output directly to the terminal `stdout`. They report the pass/fail status, the individual case latency in milliseconds, and the triggered processing trace types (`TIER1_FAST_APPLY`, `TIER2_APPLIED`, `TIER2_REJECTED_CONTEXT`, or `TIER0_BYPASS`). A historical run is also saved in `server/evaluation/results.txt`.

## 10. System Reset Procedure

To wipe the learned memory state and reset the SQLite database to its clean initial state with only the seed data:

```bash
cd server
rm -f memory.db memory.db-shm memory.db-wal
npx tsx src/db/init.ts

```
