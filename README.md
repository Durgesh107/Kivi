# Kivi-memory: Phonetic Word-Level Memory System

## Product Decisions & Vision
Kivi’s ambition as a personal AI relies on correctly handling the vocabulary that matters most to the user—names, projects, and domain-specific terminology. This implementation treats word-level memory not as a simple find-and-replace dictionary, but as a contextual state machine. 

To prevent aggressive "autocorrect" behavior where the system overrides valid language with incorrect personal terms, I implemented a **Multi-Tiered Gating System**:
*   **Tier 0 (Bypass):** N-grams are evaluated against a Double Metaphone phonetic hash. If no phonetic match exists in the user's active memory, the request bypasses intervention entirely, resulting in 0ms latency overhead.
*   **Tier 1 (Fast Apply):** For highly confident, established memory entries (score $\ge$ 0.85) without homophone collisions, replacements are spliced instantly via regex.
*   **Tier 2 (LLM Context Verification):** Ambiguous phonetic matches (e.g., "Aaditya" vs "Aditya") or words with known homophone risks ("to" vs "two") pause the fast-apply track. The sentence is passed to Gemini 2.5 Flash with a strict JSON schema to explicitly authorize or reject the replacement based on surrounding grammatical context.

## Architecture
The system operates as a monorepo containing a full-stack local application:
*   **Backend:** Node.js, Express, and TypeScript.
*   **Storage:** Embedded SQLite (`better-sqlite3`) for microsecond-latency dictionary lookups and n-gram evaluations. The schema supports cascading alias management and explicit feedback loops (reverts/reinforcements).
*   **Matching Engine:** The `talisman` library applies the Double Metaphone algorithm to handle diverse misspellings. An explicit length-boundary check prevents phonetic "word-swallowing" (matching short ASR tokens to long dictionary entries).
*   **Frontend:** React, Vite, and Zustand for state management, interacting directly with the browser's native `webkitSpeechRecognition` API for live ASR testing.

## Limitations & Edge Cases
1.  **Phonetic Bias:** The Double Metaphone algorithm is heavily biased toward English pronunciation rules. Deeply non-Anglicized names may yield inconsistent phonetic hashes, preventing the Tier 1 gate from opening.
2.  **Contextual Blind Spots:** The Tier 2 LLM evaluation operates on single-sentence context windows. If an ambiguous word depends on context established three sentences prior, the LLM may reject a valid phonetic substitution.
3.  **Boundary Truncation:** While the character alignment mapping correctly splices text, extreme ASR hallucination (where a 3-word phrase is merged into a single misspelled token) can occasionally break the n-gram boundary logic.

## AI Use Declaration
Generative AI tools (Gemini) were used during the development of this repository for:
1.  **System Design:** Brainstorming the 3-tier routing architecture to balance low-latency operations with LLM safety nets.
2.  **Algorithm Implementation:** Scaffolding the boilerplate for the monotonic character alignment map (`buildCharAlignmentMap`) and n-gram extraction logic.
3.  **Runtime Integration:** The product natively relies on the `@google/genai` SDK (`gemini-2.5-flash`) for Tier 2 contextual verification during real-time speech processing.