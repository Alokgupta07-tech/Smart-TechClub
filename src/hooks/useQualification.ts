/**
 * ==============================================
 * USE QUALIFICATION HOOK
 * ==============================================
 * Frontend hook for Level Qualification System
 * Handles level status, messages, and access control
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Types for Level Status
 */
export interface LevelStatus {
  level_id?: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  level_status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'; // Alias for status
  qualification_status: 'PENDING' | 'QUALIFIED' | 'DISQUALIFIED';
  score: number;
  total_score?: number; // Alias for score
  accuracy: number;
  time_taken_seconds: number;
  total_time_seconds?: number; // Alias for time_taken_seconds
  hints_used: number;
  puzzles_completed?: number; // Number of puzzles/questions completed
  questions_correct?: number;
  questions_answered?: number;
  started_at: string | null;
  completed_at: string | null;
  was_manually_overridden: boolean;
}

export interface TeamLevelStatusResponse {
  success: boolean;
  levels: Record<number, LevelStatus>;
  can_access_level_2: boolean;
  current_level: number;
  level_2_globally_unlocked: boolean;
}

export interface QualificationMessage {
  id: string;
  team_id: string;
  level_id: number;
  message_type: 'QUALIFICATION' | 'DISQUALIFICATION' | 'INFO' | 'WARNING';
  title: string;
  message: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

/**
 * Hook to get team's level status and qualification
 */
export function useTeamLevelStatus() {
  return useQuery<TeamLevelStatusResponse>({
    queryKey: ['teamLevelStatus'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/team/level-status`);
      if (!response.ok) throw new Error('Failed to fetch level status');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

/**
 * Hook to check if team can access a specific level
 */
export function useCanAccessLevel(levelId: number) {
  return useQuery({
    queryKey: ['canAccessLevel', levelId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/team/can-access-level/${levelId}`);
      if (!response.ok) throw new Error('Failed to check level access');
      return response.json();
    },
    enabled: !!levelId,
  });
}

/**
 * Hook to get qualification messages
 */
export function useQualificationMessages(unreadOnly = false) {
  return useQuery<{ success: boolean; messages: QualificationMessage[]; unread_count: number }>({
    queryKey: ['qualificationMessages', unreadOnly],
    queryFn: async () => {
      const url = `${API_BASE}/team/qualification-message${unreadOnly ? '?unread_only=true' : ''}`;
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    refetchInterval: 15000, // Check for new messages every 15 seconds
  });
}

/**
 * Hook to mark message as read
 */
export function useMarkMessageRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (messageId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/team/qualification-message/${messageId}/read`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark message read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualificationMessages'] });
    }
  });
}

/**
 * Hook to dismiss message
 */
export function useDismissMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (messageId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/team/qualification-message/${messageId}/dismiss`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to dismiss message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualificationMessages'] });
    }
  });
}

/**
 * Hook to complete a level (triggers qualification check)
 */
export function useCompleteLevel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/team/level-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ level_id: levelId })
      });
      if (!response.ok) throw new Error('Failed to complete level');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamLevelStatus'] });
      queryClient.invalidateQueries({ queryKey: ['qualificationMessages'] });
      queryClient.invalidateQueries({ queryKey: ['canAccessLevel'] });
    }
  });
}

// ============================================
// ADMIN HOOKS
// ============================================

export interface TeamQualificationData {
  id: string;
  team_name: string;
  team_status: string;
  levels: Record<number, LevelStatus & {
    override_by?: string;
    override_reason?: string;
  }>;
}

/**
 * Hook to get all teams' qualification status (Admin)
 */
export function useAdminTeamsQualification() {
  return useQuery<{ success: boolean; teams: TeamQualificationData[]; count: number }>({
    queryKey: ['adminTeamsQualification'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/qualification/teams`);
      if (!response.ok) throw new Error('Failed to fetch teams qualification');
      return response.json();
    },
    refetchInterval: 5000,
  });
}

/**
 * Hook to get qualification cutoffs (Admin)
 */
export function useQualificationCutoffs(levelId?: number) {
  return useQuery({
    queryKey: ['qualificationCutoffs', levelId],
    queryFn: async () => {
      const url = levelId 
        ? `${API_BASE}/admin/qualification/cutoffs?level_id=${levelId}`
        : `${API_BASE}/admin/qualification/cutoffs`;
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error('Failed to fetch cutoffs');
      return response.json();
    },
  });
}

/**
 * Hook to update qualification cutoffs (Admin)
 */
export function useUpdateCutoffs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ levelId, cutoffs }: { levelId: number; cutoffs: any }) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/qualification/cutoffs/${levelId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cutoffs)
      });
      if (!response.ok) throw new Error('Failed to update cutoffs');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualificationCutoffs'] });
    }
  });
}

/**
 * Hook to override team qualification (Admin)
 */
export function useOverrideQualification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      teamId, 
      levelId, 
      status, 
      reason 
    }: { 
      teamId: string; 
      levelId: number; 
      status: 'QUALIFIED' | 'DISQUALIFIED'; 
      reason?: string;
    }) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/team/qualification-override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_id: teamId,
          level_id: levelId,
          qualification_status: status,
          reason
        })
      });
      if (!response.ok) throw new Error('Failed to override qualification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeamsQualification'] });
    }
  });
}

/**
 * Hook to get team's audit log (Admin)
 */
export function useTeamAuditLog(teamId: string) {
  return useQuery({
    queryKey: ['teamAuditLog', teamId],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/qualification/audit/${teamId}`);
      if (!response.ok) throw new Error('Failed to fetch audit log');
      return response.json();
    },
    enabled: !!teamId,
  });
}

// ============================================
// ALIAS EXPORTS FOR COMPONENTS
// ============================================

// Alias for LevelCard component
export const useLevelStatus = useTeamLevelStatus;

// Alias for AdminQualificationPanel component
export const useAdminTeamQualifications = useAdminTeamsQualification;

// Alias for AdminQualificationPanel component
export function useAdminOverride() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      teamId, 
      levelId, 
      newStatus, 
      reason 
    }: { 
      teamId: string; 
      levelId: number; 
      newStatus: 'QUALIFIED' | 'DISQUALIFIED'; 
      reason: string;
    }) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/team/qualification-override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_id: teamId,
          level_id: levelId,
          qualification_status: newStatus,
          reason
        })
      });
      if (!response.ok) throw new Error('Failed to override qualification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeamsQualification'] });
    }
  });
}

// Alias for AdminQualificationPanel component
export const useAdminCutoffs = useQualificationCutoffs;
