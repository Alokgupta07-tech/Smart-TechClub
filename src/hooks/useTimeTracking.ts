/**
 * useTimeTracking Hook
 * ====================
 * Client-side hook for time tracking with server synchronization
 * All times are validated server-side - this is just for display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface TimerState {
  timeSpentSeconds: number;
  status: 'not_started' | 'active' | 'paused' | 'skipped' | 'completed';
  isRunning: boolean;
  attempts: number;
  hintsUsed: number;
  skipCount: number;
  penaltySeconds: number;
}

interface SessionState {
  totalTimeSeconds: number;
  penaltySeconds: number;
  effectiveTimeSeconds: number;
  questionsCompleted: number;
  questionsSkipped: number;
  skipsRemaining: number;
}

interface UseTimeTrackingOptions {
  puzzleId: string;
  autoSync?: boolean;
  syncIntervalMs?: number;
}

export function useTimeTracking({ 
  puzzleId, 
  autoSync = true, 
  syncIntervalMs = 5000 
}: UseTimeTrackingOptions) {
  const queryClient = useQueryClient();
  const [localTime, setLocalTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const lastSyncRef = useRef<number>(0);

  // Get auth header
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  // Fetch timer state from server (source of truth)
  const { data: timerState, isLoading: timerLoading, refetch: refetchTimer } = useQuery<TimerState>({
    queryKey: ['timer', puzzleId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/game/timer/${puzzleId}`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch timer state');
      const data = await response.json();
      return data.timerState;
    },
    enabled: !!puzzleId,
    refetchInterval: autoSync ? syncIntervalMs : false,
  });

  // Fetch session state
  const { data: sessionState, refetch: refetchSession } = useQuery<SessionState>({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/game/session`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch session state');
      const data = await response.json();
      return data.session;
    },
    refetchInterval: autoSync ? syncIntervalMs : false,
  });

  // Sync timer with server
  useEffect(() => {
    if (timerState) {
      setLocalTime(timerState.timeSpentSeconds);
      setIsRunning(timerState.isRunning);
      lastSyncRef.current = Date.now();
    }
  }, [timerState]);

  // Local timer increment when running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setLocalTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // START QUESTION
  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/game/start-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ puzzle_id: puzzleId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer', puzzleId] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    }
  });

  // PAUSE QUESTION
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/game/pause-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ puzzle_id: puzzleId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to pause question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer', puzzleId] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    }
  });

  // RESUME QUESTION
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/game/resume-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ puzzle_id: puzzleId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to resume question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer', puzzleId] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    }
  });

  // SKIP QUESTION
  const skipMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/game/skip-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ puzzle_id: puzzleId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to skip question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer', puzzleId] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['skippedQuestions'] });
    }
  });

  // COMPLETE QUESTION
  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/game/complete-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ puzzle_id: puzzleId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to complete question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer', puzzleId] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
    }
  });

  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  return {
    // Timer state
    timeSpentSeconds: localTime,
    timeFormatted: formatTime(localTime),
    status: timerState?.status || 'not_started',
    isRunning,
    isLoading: timerLoading,
    
    // Question stats
    attempts: timerState?.attempts || 0,
    hintsUsed: timerState?.hintsUsed || 0,
    skipCount: timerState?.skipCount || 0,
    penaltySeconds: timerState?.penaltySeconds || 0,
    
    // Session stats
    session: sessionState,
    totalTimeFormatted: sessionState ? formatTime(sessionState.totalTimeSeconds) : '00:00:00',
    
    // Actions
    start: startMutation.mutateAsync,
    pause: pauseMutation.mutateAsync,
    resume: resumeMutation.mutateAsync,
    skip: skipMutation.mutateAsync,
    complete: completeMutation.mutateAsync,
    
    // Loading states
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isSkipping: skipMutation.isPending,
    isCompleting: completeMutation.isPending,
    
    // Refresh
    refetch: () => {
      refetchTimer();
      refetchSession();
    },
    
    // Helpers
    formatTime
  };
}

// Hook for fetching skipped questions
export function useSkippedQuestions() {
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  return useQuery({
    queryKey: ['skippedQuestions'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/game/skipped-questions`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch skipped questions');
      return response.json();
    }
  });
}

// Hook for admin team timings
export function useAdminTeamTimings(autoRefresh = true) {
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  return useQuery({
    queryKey: ['adminTeamTimings'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/team-timings`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch team timings');
      return response.json();
    },
    refetchInterval: autoRefresh ? 3000 : false, // Real-time updates every 3s
  });
}

// Hook for admin question analytics
export function useQuestionAnalytics() {
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  return useQuery({
    queryKey: ['questionAnalytics'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/question-analytics`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 10000,
  });
}

// Hook for game settings
export function useGameSettings() {
  const queryClient = useQueryClient();
  
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['gameSettings'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/admin/game-settings`, {
        headers: getAuthHeader()
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    }
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const response = await fetch(`${API_BASE}/admin/game-settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ value })
      });
      if (!response.ok) throw new Error('Failed to update setting');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    }
  });

  return {
    settings,
    isLoading,
    updateSetting: updateSetting.mutateAsync,
    isUpdating: updateSetting.isPending
  };
}

export default useTimeTracking;
