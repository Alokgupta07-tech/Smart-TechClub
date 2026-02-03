require('dotenv').config();
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const samplePuzzles = [
  // Level 1 Puzzles
  {
    level: 1,
    puzzle_number: 1,
    title: "System Access Breach",
    description: "The system is locked. Decode the binary message to find the access code.",
    puzzle_type: "code",
    puzzle_content: "01001000 01000001 01000011 01001011",
    correct_answer: "HACK",
    points: 100,
    time_limit_minutes: 10,
    hints: [
      { hint_number: 1, hint_text: "Binary code represents ASCII characters. Convert each 8-bit group.", time_penalty: 180 },
      { hint_number: 2, hint_text: "Use an online binary-to-text converter or write the conversion manually.", time_penalty: 300 }
    ]
  },
  {
    level: 1,
    puzzle_number: 2,
    title: "Encrypted Communications",
    description: "Intercept cipher_one: Decrypt the Caesar cipher (shift by 3).",
    puzzle_type: "cipher",
    puzzle_content: "VHFXULWB",
    correct_answer: "SECURITY",
    points: 150,
    time_limit_minutes: 15,
    hints: [
      { hint_number: 1, hint_text: "This is a Caesar cipher. Each letter is shifted by a fixed number.", time_penalty: 240 },
      { hint_number: 2, hint_text: "Try shifting each letter back by 3 positions in the alphabet.", time_penalty: 360 }
    ]
  },
  {
    level: 1,
    puzzle_number: 3,
    title: "Network Trace",
    description: "Find the hidden IP address in the log file.",
    puzzle_type: "text",
    puzzle_content: `[ERROR] Connection failed at 192.168.1.100
[WARN] Retry attempt #1
[INFO] DNS lookup: lockdown-hq.local
[CRITICAL] Unauthorized access from 10.0.0.42
[INFO] System status: nominal`,
    correct_answer: "10.0.0.42",
    points: 100,
    time_limit_minutes: 10,
    hints: [
      { hint_number: 1, hint_text: "Look for log entries marked as CRITICAL.", time_penalty: 120 },
      { hint_number: 2, hint_text: "The IP address appears after 'Unauthorized access from'.", time_penalty: 240 }
    ]
  },
  {
    level: 1,
    puzzle_number: 4,
    title: "Password Database",
    description: "The admin password is hidden in this SQL query result. Extract it.",
    puzzle_type: "code",
    puzzle_content: `SELECT username, MD5(password) FROM users;
| admin | 5f4dcc3b5aa765d61d8327deb882cf99 |
| user1 | e10adc3949ba59abbe56e057f20f883e |`,
    correct_answer: "password",
    points: 200,
    time_limit_minutes: 20,
    hints: [
      { hint_number: 1, hint_text: "MD5 hashes can be cracked using online rainbow tables.", time_penalty: 300 },
      { hint_number: 2, hint_text: "Search for '5f4dcc3b5aa765d61d8327deb882cf99' on md5decrypt.net or similar sites.", time_penalty: 480 }
    ]
  },
  {
    level: 1,
    puzzle_number: 5,
    title: "Final Gateway",
    description: "Solve the logic puzzle to unlock Level 2. What comes next in the sequence?",
    puzzle_type: "text",
    puzzle_content: "2, 4, 8, 16, 32, ?",
    correct_answer: "64",
    points: 150,
    time_limit_minutes: 10,
    hints: [
      { hint_number: 1, hint_text: "Each number is multiplied by something to get the next number.", time_penalty: 120 },
      { hint_number: 2, hint_text: "Each number is double the previous number. 32 × 2 = ?", time_penalty: 180 }
    ]
  },

  // Level 2 Puzzles (Harder)
  {
    level: 2,
    puzzle_number: 1,
    title: "Advanced Encryption",
    description: "Decrypt this Base64 encoded message.",
    puzzle_type: "cipher",
    puzzle_content: "TG9ja2Rvd24gSFEgQWN0aXZhdGVk",
    correct_answer: "Lockdown HQ Activated",
    points: 200,
    time_limit_minutes: 15,
    hints: [
      { hint_number: 1, hint_text: "This is Base64 encoding. Use an online decoder.", time_penalty: 240 },
      { hint_number: 2, hint_text: "Go to base64decode.org and paste the text.", time_penalty: 360 }
    ]
  },
  {
    level: 2,
    puzzle_number: 2,
    title: "Hex Memory Dump",
    description: "Extract the ASCII string from this hexadecimal dump.",
    puzzle_type: "code",
    puzzle_content: "53 59 53 54 45 4D 20 42 52 45 41 43 48",
    correct_answer: "SYSTEM BREACH",
    points: 250,
    time_limit_minutes: 20,
    hints: [
      { hint_number: 1, hint_text: "Each pair of hex digits represents one ASCII character.", time_penalty: 360 },
      { hint_number: 2, hint_text: "Convert hex to text using an online converter: 53=S, 59=Y, etc.", time_penalty: 480 }
    ]
  },
  {
    level: 2,
    puzzle_number: 3,
    title: "Code Injection",
    description: "Find the SQL injection vulnerability. What command gains access?",
    puzzle_type: "code",
    puzzle_content: `Login Form:
Username: admin
Password: ' OR '1'='1`,
    correct_answer: "' OR '1'='1",
    points: 300,
    time_limit_minutes: 15,
    hints: [
      { hint_number: 1, hint_text: "This is a classic SQL injection pattern.", time_penalty: 300 },
      { hint_number: 2, hint_text: "The password field contains the injection. Copy it exactly, including the single quotes.", time_penalty: 420 }
    ]
  },
  {
    level: 2,
    puzzle_number: 4,
    title: "Final Lockdown",
    description: "Combine all the clues from Level 1 and Level 2 to form the master key.",
    puzzle_type: "text",
    puzzle_content: `Clue 1: First puzzle answer
Clue 2: Last letter of puzzle 1-2
Clue 3: Number from puzzle 1-5
Clue 4: First word of puzzle 2-1
Format: [Clue1][Clue2][Clue3]-[Clue4]`,
    correct_answer: "HACKY64-Lockdown",
    points: 500,
    time_limit_minutes: 30,
    hints: [
      { hint_number: 1, hint_text: "Review your previous answers from all puzzles.", time_penalty: 480 },
      { hint_number: 2, hint_text: "Puzzle 1-1: HACK, Puzzle 1-2 last letter: Y, Puzzle 1-5: 64, Puzzle 2-1 first word: Lockdown", time_penalty: 600 }
    ]
  }
];

async function seedPuzzles() {
  try {
    console.log('🔄 Seeding puzzles...\n');

    for (const puzzleData of samplePuzzles) {
      const puzzleId = uuidv4();
      
      // Insert puzzle
      await db.query(
        `INSERT INTO puzzles (id, level, puzzle_number, title, description, puzzle_type, puzzle_content, correct_answer, points, time_limit_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          puzzleId,
          puzzleData.level,
          puzzleData.puzzle_number,
          puzzleData.title,
          puzzleData.description,
          puzzleData.puzzle_type,
          puzzleData.puzzle_content,
          puzzleData.correct_answer,
          puzzleData.points,
          puzzleData.time_limit_minutes
        ]
      );

      console.log(`✓ Created Level ${puzzleData.level}, Puzzle ${puzzleData.puzzle_number}: ${puzzleData.title}`);

      // Insert hints
      if (puzzleData.hints) {
        for (const hint of puzzleData.hints) {
          const hintId = uuidv4();
          await db.query(
            'INSERT INTO hints (id, puzzle_id, hint_number, hint_text, time_penalty_seconds) VALUES (?, ?, ?, ?, ?)',
            [hintId, puzzleId, hint.hint_number, hint.hint_text, hint.time_penalty]
          );
        }
        console.log(`  Added ${puzzleData.hints.length} hints`);
      }
    }

    console.log(`\n✅ Successfully seeded ${samplePuzzles.length} puzzles!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding puzzles:', error);
    process.exit(1);
  }
}

seedPuzzles();
