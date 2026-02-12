const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Check if using Supabase
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

// Get all puzzles (with optional level filter)
exports.getAllPuzzles = async (req, res) => {
  try {
    const { level } = req.query;
    
    let puzzles = [];

    if (USE_SUPABASE) {
      // Fetch puzzles using Supabase
      let query = supabaseAdmin.from('puzzles').select('*');
      
      if (level) {
        query = query.eq('level', parseInt(level));
      }
      
      query = query.order('level').order('puzzle_number');
      
      const { data: puzzlesData, error: puzzlesError } = await query;
      if (puzzlesError) throw puzzlesError;

      // Fetch hints counts
      const { data: hints } = await supabaseAdmin
        .from('hints')
        .select('puzzle_id')
        .eq('is_active', true);

      // Fetch submissions counts
      const { data: submissions } = await supabaseAdmin
        .from('submissions')
        .select('puzzle_id');

      // Aggregate counts
      const hintCounts = {};
      (hints || []).forEach(h => {
        hintCounts[h.puzzle_id] = (hintCounts[h.puzzle_id] || 0) + 1;
      });

      const submissionCounts = {};
      (submissions || []).forEach(s => {
        submissionCounts[s.puzzle_id] = (submissionCounts[s.puzzle_id] || 0) + 1;
      });

      puzzles = (puzzlesData || []).map(p => ({
        ...p,
        hint_count: hintCounts[p.id] || 0,
        submission_count: submissionCounts[p.id] || 0
      }));
    } else {
      // MySQL fallback
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
      
      const [rows] = await db.query(query, params);
      puzzles = rows;
    }
    
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

    if (USE_SUPABASE) {
      const { data: puzzle, error } = await supabaseAdmin
        .from('puzzles')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !puzzle) {
        return res.status(404).json({ success: false, message: 'Puzzle not found' });
      }

      const { data: hints } = await supabaseAdmin
        .from('hints')
        .select('*')
        .eq('puzzle_id', id)
        .eq('is_active', true)
        .order('hint_number');

      return res.json({ success: true, puzzle: { ...puzzle, hints: hints || [] } });
    }

    const [puzzles] = await db.query('SELECT * FROM puzzles WHERE id = ?', [id]);
    if (puzzles.length === 0) {
      return res.status(404).json({ success: false, message: 'Puzzle not found' });
    }
    const [hints] = await db.query(
      'SELECT * FROM hints WHERE puzzle_id = ? AND is_active = true ORDER BY hint_number',
      [id]
    );
    res.json({ success: true, puzzle: { ...puzzles[0], hints } });
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch puzzle' });
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
    
    if (!level || !title || !correct_answer) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: level, title, correct_answer'
      });
    }

    if (USE_SUPABASE) {
      // Auto-assign puzzle_number if not provided or if it conflicts
      let assignedNumber = puzzle_number;
      if (!assignedNumber) {
        const { data: maxRow } = await supabaseAdmin
          .from('puzzles')
          .select('puzzle_number')
          .eq('level', level)
          .order('puzzle_number', { ascending: false })
          .limit(1);
        assignedNumber = (maxRow && maxRow.length > 0) ? maxRow[0].puzzle_number + 1 : 1;
      }

      const puzzleId = uuidv4();
      const { data: newPuzzle, error } = await supabaseAdmin
        .from('puzzles')
        .insert({
          id: puzzleId,
          level,
          puzzle_number: assignedNumber,
          title,
          description: description || null,
          puzzle_type: puzzle_type || 'text',
          puzzle_content: puzzle_content || null,
          puzzle_file_url: puzzle_file_url || null,
          correct_answer,
          points: points || 100,
          time_limit_minutes: time_limit_minutes || 30
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Duplicate - auto-increment and retry
          const { data: maxRow2 } = await supabaseAdmin
            .from('puzzles')
            .select('puzzle_number')
            .eq('level', level)
            .order('puzzle_number', { ascending: false })
            .limit(1);
          const nextNum = (maxRow2 && maxRow2.length > 0) ? maxRow2[0].puzzle_number + 1 : 1;

          const { data: retryPuzzle, error: retryError } = await supabaseAdmin
            .from('puzzles')
            .insert({
              id: uuidv4(),
              level,
              puzzle_number: nextNum,
              title,
              description: description || null,
              puzzle_type: puzzle_type || 'text',
              puzzle_content: puzzle_content || null,
              puzzle_file_url: puzzle_file_url || null,
              correct_answer,
              points: points || 100,
              time_limit_minutes: time_limit_minutes || 30
            })
            .select()
            .single();

          if (retryError) {
            console.error('Error creating puzzle (retry):', retryError);
            return res.status(400).json({
              success: false,
              message: 'A puzzle with this level and number already exists'
            });
          }

          return res.status(201).json({
            success: true,
            message: 'Puzzle created successfully',
            puzzle: retryPuzzle
          });
        }

        console.error('Error creating puzzle:', error);
        return res.status(500).json({ success: false, message: 'Failed to create puzzle' });
      }

      return res.status(201).json({
        success: true,
        message: 'Puzzle created successfully',
        puzzle: newPuzzle
      });
    }
    
    // MySQL fallback
    const puzzleId = uuidv4();
    await db.query(
      `INSERT INTO puzzles (
        id, level, puzzle_number, title, description, puzzle_type,
        puzzle_content, puzzle_file_url, correct_answer, points, time_limit_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [puzzleId, level, puzzle_number, title, description || null, puzzle_type || 'text',
        puzzle_content || null, puzzle_file_url || null, correct_answer, points || 100, time_limit_minutes || 30]
    );
    const [newPuzzle] = await db.query('SELECT * FROM puzzles WHERE id = ?', [puzzleId]);
    res.status(201).json({ success: true, message: 'Puzzle created successfully', puzzle: newPuzzle[0] });
  } catch (error) {
    console.error('Error creating puzzle:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'A puzzle with this level and number already exists'
      });
    }
    res.status(500).json({ success: false, message: 'Failed to create puzzle' });
  }
};

// Update puzzle
exports.updatePuzzle = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      'title', 'description', 'puzzle_type', 'puzzle_content',
      'puzzle_file_url', 'correct_answer', 'points', 'time_limit_minutes', 'is_active',
      'level', 'puzzle_number'
    ];

    const updateData = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    if (USE_SUPABASE) {
      const { data: existing } = await supabaseAdmin
        .from('puzzles').select('id').eq('id', id).single();
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Puzzle not found' });
      }

      const { data: updated, error } = await supabaseAdmin
        .from('puzzles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, message: 'Puzzle updated successfully', puzzle: updated });
    }

    // MySQL fallback
    const [existing] = await db.query('SELECT id FROM puzzles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Puzzle not found' });
    }
    const updateFields = [];
    const values = [];
    for (const [key, value] of Object.entries(updateData)) {
      updateFields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await db.query(`UPDATE puzzles SET ${updateFields.join(', ')} WHERE id = ?`, values);
    const [updated] = await db.query('SELECT * FROM puzzles WHERE id = ?', [id]);
    res.json({ success: true, message: 'Puzzle updated successfully', puzzle: updated[0] });
  } catch (error) {
    console.error('Error updating puzzle:', error);
    res.status(500).json({ success: false, message: 'Failed to update puzzle' });
  }
};

// Delete puzzle
exports.deletePuzzle = async (req, res) => {
  try {
    const { id } = req.params;

    if (USE_SUPABASE) {
      // Delete related hints first
      await supabaseAdmin.from('hints').delete().eq('puzzle_id', id);
      // Delete related submissions
      await supabaseAdmin.from('submissions').delete().eq('puzzle_id', id);

      const { error } = await supabaseAdmin
        .from('puzzles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true, message: 'Puzzle deleted successfully' });
    }

    const [result] = await db.query('DELETE FROM puzzles WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Puzzle not found' });
    }
    res.json({ success: true, message: 'Puzzle deleted successfully' });
  } catch (error) {
    console.error('Error deleting puzzle:', error);
    res.status(500).json({ success: false, message: 'Failed to delete puzzle' });
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

    if (USE_SUPABASE) {
      const { data: puzzle } = await supabaseAdmin
        .from('puzzles').select('id').eq('id', puzzle_id).single();
      if (!puzzle) {
        return res.status(404).json({ success: false, message: 'Puzzle not found' });
      }

      const { data: newHint, error } = await supabaseAdmin
        .from('hints')
        .insert({
          id: uuidv4(),
          puzzle_id,
          hint_number,
          hint_text,
          time_penalty_seconds: time_penalty_seconds || 300
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(400).json({
            success: false,
            message: 'A hint with this number already exists for this puzzle'
          });
        }
        throw error;
      }

      return res.status(201).json({ success: true, message: 'Hint added successfully', hint: newHint });
    }

    // MySQL fallback
    const [puzzle] = await db.query('SELECT id FROM puzzles WHERE id = ?', [puzzle_id]);
    if (puzzle.length === 0) {
      return res.status(404).json({ success: false, message: 'Puzzle not found' });
    }
    const hintId = uuidv4();
    await db.query(
      'INSERT INTO hints (id, puzzle_id, hint_number, hint_text, time_penalty_seconds) VALUES (?, ?, ?, ?, ?)',
      [hintId, puzzle_id, hint_number, hint_text, time_penalty_seconds || 300]
    );
    const [newHint] = await db.query('SELECT * FROM hints WHERE id = ?', [hintId]);
    res.status(201).json({ success: true, message: 'Hint added successfully', hint: newHint[0] });
  } catch (error) {
    console.error('Error adding hint:', error);
    res.status(500).json({ success: false, message: 'Failed to add hint' });
  }
};

// Update hint
exports.updateHint = async (req, res) => {
  try {
    const { id } = req.params;
    const { hint_text, time_penalty_seconds, is_active } = req.body;

    const updateData = {};
    if (hint_text !== undefined) updateData.hint_text = hint_text;
    if (time_penalty_seconds !== undefined) updateData.time_penalty_seconds = time_penalty_seconds;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    if (USE_SUPABASE) {
      const { data: updated, error } = await supabaseAdmin
        .from('hints')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!updated) return res.status(404).json({ success: false, message: 'Hint not found' });
      return res.json({ success: true, message: 'Hint updated successfully', hint: updated });
    }

    // MySQL fallback
    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(updateData)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    const [result] = await db.query(`UPDATE hints SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Hint not found' });
    }
    const [updated] = await db.query('SELECT * FROM hints WHERE id = ?', [id]);
    res.json({ success: true, message: 'Hint updated successfully', hint: updated[0] });
  } catch (error) {
    console.error('Error updating hint:', error);
    res.status(500).json({ success: false, message: 'Failed to update hint' });
  }
};

// Delete hint
exports.deleteHint = async (req, res) => {
  try {
    const { id } = req.params;

    if (USE_SUPABASE) {
      const { error } = await supabaseAdmin.from('hints').delete().eq('id', id);
      if (error) throw error;
      return res.json({ success: true, message: 'Hint deleted successfully' });
    }

    const [result] = await db.query('DELETE FROM hints WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Hint not found' });
    }
    res.json({ success: true, message: 'Hint deleted successfully' });
  } catch (error) {
    console.error('Error deleting hint:', error);
    res.status(500).json({ success: false, message: 'Failed to delete hint' });
  }
};
