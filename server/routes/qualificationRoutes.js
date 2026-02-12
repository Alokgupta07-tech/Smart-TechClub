/**
 * ==============================================
 * QUALIFICATION ROUTES
 * ==============================================
 * API routes for level qualification system
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 */

const express = require('express');
const router = express.Router();
const qualificationController = require('../controllers/qualificationController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ============================================
// TEAM ROUTES (require team authentication)
// ============================================

// Get team's level status and qualification
router.get('/team/level-status', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.getTeamLevelStatus
);

// Complete a level (triggers qualification check)
router.post('/team/level-complete', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.completeLevel
);

// Get qualification messages
router.get('/team/qualification-message', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.getQualificationMessages
);

// Mark message as read
router.post('/team/qualification-message/:id/read', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.markMessageRead
);

// Dismiss message
router.post('/team/qualification-message/:id/dismiss', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.dismissMessage
);

// Check if can access a specific level
router.get('/team/can-access-level/:level', 
  authenticateToken, 
  requireRole('team'), 
  qualificationController.checkLevelAccess
);

// ============================================
// ADMIN ROUTES (require admin authentication)
// ============================================

// Get all teams' qualification status
router.get('/admin/qualification/teams', 
  authenticateToken, 
  requireRole('admin'), 
  qualificationController.getAllTeamsQualification
);

// Override team qualification (force qualify/disqualify)
router.post('/admin/team/qualification-override', 
  authenticateToken, 
  requireRole('admin'), 
  qualificationController.overrideQualification
);

// Get qualification cutoffs
router.get('/admin/qualification/cutoffs', 
  authenticateToken, 
  requireRole('admin'), 
  qualificationController.getCutoffs
);

// Update qualification cutoffs
router.put('/admin/qualification/cutoffs/:level', 
  authenticateToken, 
  requireRole('admin'), 
  qualificationController.updateCutoffs
);

// Get team audit log
router.get('/admin/qualification/audit/:teamId', 
  authenticateToken, 
  requireRole('admin'), 
  qualificationController.getTeamAuditLog
);

module.exports = router;
