// src/hooks/useCelebration.ts
// Hook to manage celebration modal state and derive result data from leaderboard

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLeaderboard } from './useAdminData';
import { ResultData, WinnerRank } from '@/types/celebration';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Interface for game configuration from admin settings
 * This controls when results are published
 */
interface GameConfig {
  resultsPublished: boolean;
  gameEnded: boolean;
  endTime: string | null;
}

/**
 * Custom hook to manage celebration modal state
 * 
 * BACKEND INTEGRATION:
 * -------------------
 * To connect this to your backend, you need an API endpoint that returns:
 * {
 *   resultsPublished: boolean,  // Set to true when admin publishes results
 *   gameEnded: boolean,         // Set to true when game time is over
 * }
 * 
 * You can trigger `resultsPublished` from your admin panel when you want
 * to officially announce winners. This ensures the celebration only shows
 * after you've verified the final standings.
 * 
 * @param currentTeamId - The ID of the currently logged-in team
 * @returns {Object} - isResultPublished, resultData, showCelebration controls
 */
export function useCelebration(currentTeamId: string | null) {
  // Track if the user has dismissed the modal
  const [dismissed, setDismissed] = useState(false);

  // Track if celebration was already shown (persisted in session)
  const [alreadySeen, setAlreadySeen] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('celebration_seen') === 'true';
    }
    return false;
  });

  // Fetch leaderboard data
  const { data: leaderboardData } = useLeaderboard();
  const leaderboard = leaderboardData?.teams ?? [];

  // Fetch game configuration to check if results are published
  // TODO: Replace this with your actual admin settings endpoint
  const { data: gameConfig } = useQuery<GameConfig>({
    queryKey: ['gameConfig', 'celebration'],
    queryFn: async () => {
      // INTEGRATION POINT: Replace with your actual API endpoint
      // This endpoint should return { resultsPublished: boolean }
      // 
      // Option 1: Dedicated endpoint
      // const response = await fetch(`${API_BASE}/admin/game-config`);
      // 
      // Option 2: Feature flags endpoint
      // const response = await fetch(`${API_BASE}/game/features`);
      //
      // For now, returning a mock that checks if game has ended
      // You should replace this with actual backend check

      try {
        const response = await fetchWithAuth(`${API_BASE}/game/features`);
        if (response.ok) {
          const data = await response.json();
          return {
            resultsPublished: data.resultsPublished ?? false,
            gameEnded: data.gameEnded ?? false,
            endTime: data.gameEndTime ?? null,
          };
        }
      } catch (error) {
        console.error('Failed to fetch game config:', error);
      }

      // Default: results not published
      return {
        resultsPublished: false,
        gameEnded: false,
        endTime: null,
      };
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000,
  });

  // Derive result data from leaderboard
  const resultData: ResultData | null = useMemo(() => {
    if (!leaderboard || leaderboard.length < 3 || !currentTeamId) {
      return null;
    }

    // Sort by rank to ensure we get top 3
    const sorted = [...leaderboard].sort((a, b) => (a.rank || 0) - (b.rank || 0));

    // Get top 3 teams
    const winner = sorted[0];
    const firstRunnerUp = sorted[1];
    const secondRunnerUp = sorted[2];

    if (!winner || !firstRunnerUp || !secondRunnerUp) {
      return null;
    }

    // Find current team's rank
    const currentTeam = leaderboard.find(t => t.id === currentTeamId);
    let currentUserRank: WinnerRank = null;

    if (currentTeam) {
      if (currentTeam.rank === 1) currentUserRank = 1;
      else if (currentTeam.rank === 2) currentUserRank = 2;
      else if (currentTeam.rank === 3) currentUserRank = 3;
    }

    return {
      currentUserRank,
      winnerName: winner.teamName || `Team ${winner.id}`,
      firstRunnerUpName: firstRunnerUp.teamName || `Team ${firstRunnerUp.id}`,
      secondRunnerUpName: secondRunnerUp.teamName || `Team ${secondRunnerUp.id}`,
    };
  }, [leaderboard, currentTeamId]);

  // Determine if we should show the celebration
  const isResultPublished = Boolean(
    gameConfig?.resultsPublished &&
    resultData?.currentUserRank &&
    !dismissed &&
    !alreadySeen
  );

  // Handle closing the modal
  const handleClose = () => {
    setDismissed(true);
    setAlreadySeen(true);
    // Persist to session storage so it doesn't show again on page refresh
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('celebration_seen', 'true');
    }
  };

  // Allow manually triggering celebration (useful for testing)
  const triggerCelebration = () => {
    setDismissed(false);
    setAlreadySeen(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('celebration_seen');
    }
  };

  return {
    isResultPublished,
    resultData,
    onClose: handleClose,
    // Utility functions for testing/debugging
    triggerCelebration,
    resetCelebration: triggerCelebration,
  };
}

/**
 * Hook for testing the celebration modal
 * Uses hardcoded data instead of fetching from API
 * 
 * Usage:
 * ```tsx
 * const celebration = useCelebrationTest(1); // Test as winner
 * return <CelebrationModal {...celebration} />;
 * ```
 */
export function useCelebrationTest(rankToTest: WinnerRank = 1) {
  const [isResultPublished, setIsResultPublished] = useState(false);

  // Mock result data for testing
  const resultData: ResultData = {
    currentUserRank: rankToTest,
    winnerName: "John Doe",
    firstRunnerUpName: "Jane Smith",
    secondRunnerUpName: "Alice Johnson",
  };

  const handleClose = () => {
    setIsResultPublished(false);
  };

  const triggerCelebration = () => {
    setIsResultPublished(true);
  };

  // Auto-trigger on mount for immediate testing
  useEffect(() => {
    if (rankToTest) {
      setIsResultPublished(true);
    }
  }, [rankToTest]);

  return {
    isResultPublished,
    resultData,
    onClose: handleClose,
    triggerCelebration,
  };
}

export default useCelebration;
