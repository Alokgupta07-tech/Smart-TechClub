/**
 * React Query Hooks for API Data Fetching
 * Uses TanStack Query (@tanstack/react-query) which is already installed
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
 * Auto-refreshes every 10 seconds
 */
export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
    retry: 3,
  });
}

/**
 * Hook: Fetch admin statistics
 * Auto-refreshes every 10 seconds
 */
export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: fetchStats,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 3,
  });
}

/**
 * Hook: Fetch recent alerts
 * Auto-refreshes every 10 seconds
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
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 3,
  });
}

/**
 * Hook: Fetch leaderboard
 * Auto-refreshes every 15 seconds
 */
export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 15000, // Slightly slower for public endpoint
    staleTime: 5000,
    retry: 3,
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
