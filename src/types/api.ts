/**
 * API Types for Lockdown HQ
 * All interfaces represent data structures from MySQL backend
 */

export interface Team {
  id: string;
  teamName: string;
  level: number;
  status: 'waiting' | 'active' | 'completed' | 'disqualified';
  progress: number;
  startTime: string | null;
  endTime: string | null;
  hintsUsed: number;
  timeElapsed: string;
  createdAt: string;
}

export interface AdminStats {
  totalTeams: number;
  active: number;
  completed: number;
  waiting: number;
  avgTime: string;
  hintsUsed: number;
}

export interface Alert {
  id: number;
  teamId: string;
  team: string;
  type: 'tab_switch' | 'violation' | 'level_complete' | 'warning' | 'critical' | 'info';
  message: string;
  createdAt: string;
  timeAgo?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'team';
  createdAt: string;
}

export interface LeaderboardEntry extends Team {
  rank: number;
  level1Time: string | null;
  level2Time: string | null;
  totalTime: string | null;
  change?: 'up' | 'down' | 'same';
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface TeamActionPayload {
  action: 'pause' | 'resume' | 'disqualify' | 'reset' | 'view';
  teamId: string;
}

// ============================================
// NEW FEATURE TYPES
// ============================================

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: 'speed' | 'accuracy' | 'milestone' | 'special';
  earned: boolean;
  awarded_at?: string;
}

export interface Notification {
  id: string;
  team_id: string;
  notification_type: 'broadcast' | 'hint_penalty' | 'rank_change' | 'achievement' | 'warning' | 'system';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_read: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface PuzzleAnalytics {
  puzzleId: string;
  totalAttempts: number;
  successfulAttempts: number;
  avgSolveTimeSeconds: number;
  minSolveTimeSeconds: number;
  maxSolveTimeSeconds: number;
  failureRate: number;
  hintUsageRate: number;
  teamsAttempted: number;
  teamsUsedHints: number;
}

export interface SuspiciousAlert {
  id: string;
  team_id: string;
  team_name: string;
  alert_type: 'rapid_submission' | 'fast_solve' | 'tab_switch' | 'copy_paste' | 'pattern_match';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: Record<string, any> | null;
  is_reviewed: boolean;
  created_at: string;
}

export interface TimelineActivity {
  id: string;
  action_type: string;
  description: string;
  puzzle_id: string | null;
  puzzle_title: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface Hint {
  id: string;
  hint_number: number;
  hint_text: string;
  time_penalty_seconds: number;
  penalty_multiplier: number;
  unlock_after_seconds: number;
  is_used: boolean;
  isUnlocked: boolean;
  canUnlock: boolean;
  penaltySeconds: number;
}

export interface InventoryItem {
  id: string;
  item_type: 'clue' | 'key' | 'code' | 'data' | 'intelligence';
  item_name: string;
  item_value: string;
  collected_at: string;
  animation_played: boolean;
}

export interface PuzzleTimerStatus {
  puzzleId: string;
  puzzleTitle: string;
  startedAt: string | null;
  timeLimit: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  isExpired: boolean;
  isCompleted: boolean;
}
