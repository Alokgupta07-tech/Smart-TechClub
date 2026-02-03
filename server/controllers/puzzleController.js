const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get all puzzles (with optional level filter)
exports.getAllPuzzles = async (req, res) => {
  try {
    const { level } = req.query;
    
    let query = `
      SELECT p.*, 
             COUNT(DISTINCT h.id) as hint_count,
             COUNT(DISTINCT s.id) as submission_count
      FROM puzzles p
      LEFT JOIN hints h ON p.id = h.puzzle_id AND h.is_active = true
      LEFT JOIN submissions s ON p.id = s.puzzle_id
    `;
    
    const params = [];
    if (level) {
      query += ' WHERE p.level = ?';
      params.push(level);
    }
    
    query += ' GROUP BY p.id ORDER BY p.level, p.puzzle_number';
    
    const [puzzles] = await db.query(query, params);
    
    res.json({
      success: true,
      count: puzzles.length,
      puzzles
    });
  } catch (error) {
    console.error('Error fetching puzzles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch puzzles'
    });
  }
};

// Get single puzzle by ID
exports.getPuzzleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [puzzles] = await db.query(
      'SELECT * FROM puzzles WHERE id = ?',
      [id]
    );
    
    if (puzzles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Puzzle not found'
      });
    }
    
    // Get hints for this puzzle
    const [hints] = await db.query(
      'SELECT * FROM hints WHERE puzzle_id = ? AND is_active = true ORDER BY hint_number',
      [id]
    );
    
    res.json({
      success: true,
      puzzle: {
        ...puzzles[0],
        hints
      }
    });
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch puzzle'
    });
  }
};

// Create new puzzle
exports.createPuzzle = async (req, res) => {
  try {
    const {
      level,
      puzzle_number,
      title,
      description,
      puzzle_type,
      puzzle_content,
      puzzle_file_url,
      correct_answer,
      points,
      time_limit_minutes
    } = req.body;
    
    // Validation
    if (!level || !puzzle_number || !title || !correct_answer) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: level, puzzle_number, title, correct_answer'
      });
    }
    
    const puzzleId = uuidv4();
    
    await db.query(
      `INSERT INTO puzzles (
        id, level, puzzle_number, title, description, puzzle_type,
        puzzle_content, puzzle_file_url, correct_answer, points, time_limit_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        puzzleId,
        level,
        puzzle_number,
        title,
        description || null,
        puzzle_type || 'text',
        puzzle_content || null,
        puzzle_file_url || null,
        correct_answer,
        points || 100,
        time_limit_minutes || 30
      ]
    );
    
    const [newPuzzle] = await db.query('SELECT * FROM puzzles WHERE id = ?', [puzzleId]);
    
    res.status(201).json({
      success: true,
      message: 'Puzzle created successfully',
      puzzle: newPuzzle[0]
    });
  } catch (error) {
    console.error('Error creating puzzle:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A puzzle with this level and number already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create puzzle'
    });
  }
};

// Update puzzle
exports.updatePuzzle = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if puzzle exists
    const [existing] = await db.query('SELECT id FROM puzzles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Puzzle not found'
      });
    }
    
    // Build update query dynamically
    const allowedFields = [
      'title', 'description', 'puzzle_type', 'puzzle_content',
      'puzzle_file_url', 'correct_answer', 'points', 'time_limit_minutes', 'is_active'
    ];
    
    const updateFields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    values.push(id);
    
    await db.query(
      `UPDATE puzzles SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    const [updated] = await db.query('SELECT * FROM puzzles WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Puzzle updated successfully',
      puzzle: updated[0]
    });
  } catch (error) {
    console.error('Error updating puzzle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update puzzle'
    });
  }
};

// Delete puzzle
exports.deletePuzzle = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query('DELETE FROM puzzles WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Puzzle not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Puzzle deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting puzzle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete puzzle'
    });
  }
};

// Add hint to puzzle
exports.addHint = async (req, res) => {
  try {
    const { puzzle_id, hint_number, hint_text, time_penalty_seconds } = req.body;
    
    if (!puzzle_id || !hint_number || !hint_text) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: puzzle_id, hint_number, hint_text'
      });
    }
    
    // Check if puzzle exists
    const [puzzle] = await db.query('SELECT id FROM puzzles WHERE id = ?', [puzzle_id]);
    if (puzzle.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Puzzle not found'
      });
    }
    
    const hintId = uuidv4();
    
    await db.query(
      'INSERT INTO hints (id, puzzle_id, hint_number, hint_text, time_penalty_seconds) VALUES (?, ?, ?, ?, ?)',
      [hintId, puzzle_id, hint_number, hint_text, time_penalty_seconds || 300]
    );
    
    const [newHint] = await db.query('SELECT * FROM hints WHERE id = ?', [hintId]);
    
    res.status(201).json({
      success: true,
      message: 'Hint added successfully',
      hint: newHint[0]
    });
  } catch (error) {
    console.error('Error adding hint:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A hint with this number already exists for this puzzle'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to add hint'
    });
  }
};

// Update hint
exports.updateHint = async (req, res) => {
  try {
    const { id } = req.params;
    const { hint_text, time_penalty_seconds, is_active } = req.body;
    
    const updates = [];
    const values = [];
    
    if (hint_text !== undefined) {
      updates.push('hint_text = ?');
      values.push(hint_text);
    }
    if (time_penalty_seconds !== undefined) {
      updates.push('time_penalty_seconds = ?');
      values.push(time_penalty_seconds);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const [result] = await db.query(
      `UPDATE hints SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hint not found'
      });
    }
    
    const [updated] = await db.query('SELECT * FROM hints WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Hint updated successfully',
      hint: updated[0]
    });
  } catch (error) {
    console.error('Error updating hint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update hint'
    });
  }
};

// Delete hint
exports.deleteHint = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query('DELETE FROM hints WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hint not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Hint deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting hint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete hint'
    });
  }
};
