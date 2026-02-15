/**
 * React Query Hooks for API Data Fetching
 * Uses TanStack Query (@tanstack/react-query) which is already installed
 * 
 * PERFORMANCE OPTIMIZED for 200+ concurrent users:
 * - Reduced polling intervals (30-60s instead of 10s)
 * - Longer staleTime to use cached data
 * - Reduced retry attempts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchTeams, 
  fetchStats, 
  fetchAlerts, 
  fetchLeaderboard,
  performTeamAction,
  getTimeAgo
} from '@/lib/api';
import { Team, AdminStats, Alert, LeaderboardEntry, TeamActionPayload } from '@/types/api';
import { toast } from 'sonner';

/**
 * Hook: Fetch all teams
 * Auto-refreshes every 30 seconds (optimized from 10s)
 */
export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    refetchInterval: 30000, // Poll every 30 seconds (was 10s)
    staleTime: 20000, // Data fresh for 20s (was 5s)
    retry: 1,
    refetchOnMount: false,
  });
}

/**
 * Hook: Fetch admin statistics
 * Auto-refreshes every 30 seconds (optimized from 10s)
 */
export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: fetchStats,
    refetchInterval: 30000, // Poll every 30 seconds (was 10s)
    staleTime: 20000,
    retry: 1,
    refetchOnMount: false,
  });
}

/**
 * Hook: Fetch recent alerts
 * Auto-refreshes every 30 seconds (optimized from 10s)
 */
export function useAlerts() {
  return useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const alerts = await fetchAlerts();
      // Add time ago to each alert
      return alerts.map(alert => ({
        ...alert,
        timeAgo: getTimeAgo(alert.createdAt)
      }));
    },
    refetchInterval: 30000, // Poll every 30 seconds (was 10s)
    staleTime: 20000,
    retry: 1,
    refetchOnMount: false,
  });
}

/**
 * Hook: Fetch leaderboard
 * Auto-refreshes every 45 seconds (optimized from 15s)
 */
export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 45000, // Poll every 45 seconds (was 15s)
    staleTime: 30000, // Data fresh for 30s
    retry: 1,
    refetchOnMount: false,
  });
}

/**
 * Hook: Perform team action (pause, resume, disqualify, etc.)
 */
export function useTeamAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TeamActionPayload) => performTeamAction(payload),
    onSuccess: (data, variables) => {
      // Invalidate and refetch teams data
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      
      toast.success(`Team action "${variables.action}" performed successfully`);
    },
    onError: (error) => {
      console.error('Team action failed:', error);
      toast.error('Failed to perform team action');
    },
  });
}

/**
 * Hook: Manual refetch all admin data
 */
export function useRefetchAllAdminData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };
}
