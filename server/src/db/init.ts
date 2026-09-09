import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// 1. Export the function so server.ts can connect to the database
export function initializeDatabase(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
  }
  return db;
}

// 2. Keep the seeding logic for when you run `npx tsx src/db/init.ts` directly
if (require.main === module || process.argv[1]?.includes('init.ts')) {
  console.log('🔄 Initializing Kivi-memory Database...');
  
  const dbPath = path.join(__dirname, '../../memory.db');
  const db = initializeDatabase(dbPath);

  const insertEntry = db.prepare(`
    INSERT OR IGNORE INTO dictionary_entries (id, user_id, canonical_word, canonical_word_normalized, status, confidence_score, has_homophone_risk)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO aliases (entry_id, alias_normalized)
    VALUES (?, ?)
  `);

  db.transaction(() => {
    // Entry 1: Next.js
    insertEntry.run(1, 'test_user_alpha', 'Next.js', 'next.js', 'active', 0.95, 0);
    insertAlias.run(1, 'next js');
    insertAlias.run(1, 'nexus');

    // Entry 2: Aaditya
    insertEntry.run(2, 'test_user_alpha', 'Aaditya', 'aaditya', 'active', 0.80, 1);
    insertAlias.run(2, 'aditya');

    // Entry 3: Sarvam Kivi
    insertEntry.run(3, 'test_user_alpha', 'Sarvam Kivi', 'sarvam kivi', 'active', 0.90, 0);
    insertAlias.run(3, 'sarvam kiwi');
  })();

  console.log('✅ Database seeded successfully with baseline memory data.');
  db.close();
}