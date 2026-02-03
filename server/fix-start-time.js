const db = require('./config/db');

async function fix() {
  try {
    const [result] = await db.query(
      "UPDATE teams SET start_time = NOW() WHERE status = 'active' AND start_time IS NULL"
    );
    console.log('Updated', result.affectedRows, 'teams with start_time');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fix();
