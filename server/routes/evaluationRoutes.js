/**
 * ==============================================
 * EVALUATION ROUTES
 * ==============================================
 * Routes for admin-controlled evaluation & result release
 * 
 * NEW CODE - Added for Admin-Controlled Evaluation System
 */

const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ============================================
// ADMIN ROUTES (require admin role)
// ============================================

/**
 * GET /api/admin/evaluation/level/:levelId/status
 * Get current evaluation status for a level
 */
router.get(
  '/level/:levelId/status',
  authenticateToken,
  requireRole('admin'),
  evaluationController.getEvaluationStatus
);

/**
 * POST /api/admin/evaluation/level/:levelId/close-submissions
 * Close submissions for a level
 */
router.post(
  '/level/:levelId/close-submissions',
  authenticateToken,
  requireRole('admin'),
  evaluationController.closeSubmissions
);

/**
 * POST /api/admin/evaluation/level/:levelId/evaluate
 * Evaluate all pending answers for a level
 */
router.post(
  '/level/:levelId/evaluate',
  authenticateToken,
  requireRole('admin'),
  evaluationController.evaluateAnswers
);

/**
 * POST /api/admin/evaluation/level/:levelId/publish-results
 * Publish results - makes results visible to teams
 */
router.post(
  '/level/:levelId/publish-results',
  authenticateToken,
  requireRole('admin'),
  evaluationController.publishResults
);

/**
 * POST /api/admin/evaluation/level/:levelId/reopen-submissions
 * Reopen submissions (admin override)
 */
router.post(
  '/level/:levelId/reopen-submissions',
  authenticateToken,
  requireRole('admin'),
  evaluationController.reopenSubmissions
);

/**
 * POST /api/admin/evaluation/level/:levelId/reset-evaluation
 * Reset evaluation state to allow re-evaluation
 */
router.post(
  '/level/:levelId/reset-evaluation',
  authenticateToken,
  requireRole('admin'),
  evaluationController.resetEvaluation
);

module.exports = router;
