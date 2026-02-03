// src/hooks/useGameFeatures.ts
/**
 * React Query Hooks for New Game Features
 * Leaderboard, Achievements, Notifications, Analytics
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Achievement,
  Notification,
  PuzzleAnalytics,
  SuspiciousAlert,
  TimelineActivity,
  Hint,
  PuzzleTimerStatus
} from '@/types/api';

const API_BASE = 'http://localhost:5000/api';

const getAuthHeaders = () => {
  const accessToken = localStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
};

// ============================================
// LEADERBOARD HOOKS
// ============================================

export interface LeaderboardEntry {
  rank: number;
  id: string;
  teamName: string;
  level: number;
  status: string;
  progress: number;
  puzzlesSolved: number;
  hintsUsed: number;
  totalTimeSeconds: number;
  effectiveTime: number;
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/leaderboard`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

export function useTeamRank(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-rank', teamId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/leaderboard/rank/${teamId}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch rank');
      return response.json();
    },
    enabled: !!teamId,
    refetchInterval: 10000,
  });
}

// ============================================
// ACHIEVEMENT HOOKS
// ============================================

export function useTeamAchievements(teamId: string | undefined) {
  return useQuery<Achievement[]>({
    queryKey: ['achievements', teamId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/teams/${teamId}/achievements`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch achievements');
      return response.json();
    },
    enabled: !!teamId,
    staleTime: 30000,
  });
}

export function useAllAchievements() {
  return useQuery<Achievement[]>({
    queryKey: ['all-achievements'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/achievements`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch achievements');
      return response.json();
    },
    staleTime: 60000,
  });
}

// ============================================
// NOTIFICATION HOOKS
// ============================================

export function useNotifications() {
  return useQuery<{ count: number; notifications: Notification[] }>({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/notifications/unread`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        if (response.status === 401) return { count: 0, notifications: [] };
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to mark as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    }
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success('All notifications marked as read');
    }
  });
}

// ============================================
// ANALYTICS HOOKS (ADMIN)
// ============================================

export function usePuzzleAnalytics(puzzleId: string | undefined) {
  return useQuery<PuzzleAnalytics>({
    queryKey: ['puzzle-analytics', puzzleId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/puzzle/${puzzleId}/stats`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 30000,
  });
}

export function useAllPuzzleAnalytics() {
  return useQuery<PuzzleAnalytics[]>({
    queryKey: ['all-puzzle-analytics'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/analytics/puzzles`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 60000,
  });
}

// ============================================
// SUSPICIOUS ACTIVITY HOOKS (ADMIN)
// ============================================

export function useSuspiciousAlerts(unreviewedOnly = true) {
  return useQuery<SuspiciousAlert[]>({
    queryKey: ['suspicious-alerts', unreviewedOnly],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/admin/suspicious?unreviewedOnly=${unreviewedOnly}`,
        { headers: getAuthHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json();
    },
    refetchInterval: 10000,
  });
}

export function useReviewAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const response = await fetch(`${API_BASE}/admin/suspicious/${alertId}/review`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to review alert');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suspicious-alerts'] });
      toast.success('Alert marked as reviewed');
    },
    onError: () => {
      toast.error('Failed to review alert');
    }
  });
}

// ============================================
// TEAM TIMELINE HOOKS (ADMIN)
// ============================================

export function useTeamTimeline(teamId: string | undefined) {
  return useQuery<TimelineActivity[]>({
    queryKey: ['team-timeline', teamId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/team/${teamId}/timeline`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
    enabled: !!teamId,
    refetchInterval: 10000,
  });
}

// ============================================
// PROGRESSIVE HINTS HOOKS
// ============================================

export interface HintsData {
  hints: Hint[];
  nextHintUnlockIn: number | null;
  elapsedSeconds: number;
  lastHintNumber: number;
}

export function usePuzzleHints(puzzleId: string | undefined) {
  return useQuery<HintsData>({
    queryKey: ['hints', puzzleId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/gameplay/puzzle/${puzzleId}/hints`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch hints');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 5000,
  });
}

export function useHint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ puzzleId, hintId }: { puzzleId: string; hintId: string }) => {
      const response = await fetch(`${API_BASE}/gameplay/puzzle/${puzzleId}/hint/${hintId}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to use hint');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hints', variables.puzzleId] });
      toast.warning(`Hint unlocked! Time penalty: +${Math.floor(data.penaltySeconds / 60)} min`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });
}

// ============================================
// PUZZLE TIMER HOOKS
// ============================================

export function usePuzzleTimer(puzzleId: string | undefined) {
  return useQuery<PuzzleTimerStatus>({
    queryKey: ['puzzle-timer', puzzleId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/gameplay/puzzle/${puzzleId}/timer`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch timer');
      return response.json();
    },
    enabled: !!puzzleId,
    refetchInterval: 1000, // Check every second for accurate timing
  });
}

// ============================================
// BROADCAST (ADMIN)
// ============================================

export function useBroadcastNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, message, priority }: { title: string; message: string; priority?: string }) => {
      const response = await fetch(`${API_BASE}/admin/notifications/broadcast`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title, message, priority })
      });
      if (!response.ok) throw new Error('Failed to send broadcast');
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`Broadcast sent to ${data.notifiedTeams} teams`);
    },
    onError: () => {
      toast.error('Failed to send broadcast');
    }
  });
}
