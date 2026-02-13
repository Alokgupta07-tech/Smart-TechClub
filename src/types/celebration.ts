/**
 * Celebration Types for Winner/Runner-up Display
 * Used when results are officially published
 */

// Rank can be 1 (Winner), 2 (1st Runner-up), 3 (2nd Runner-up), or null (not in top 3)
export type WinnerRank = 1 | 2 | 3 | null;

// Result data structure from backend
export interface ResultData {
  currentUserRank: WinnerRank;      // The current user's rank (1, 2, 3, or null)
  winnerName: string;               // 1st place - Gold
  firstRunnerUpName: string;        // 2nd place - Silver
  secondRunnerUpName: string;       // 3rd place - Bronze
}

// Props for the CelebrationModal component
export interface CelebrationModalProps {
  isResultPublished: boolean;       // Trigger: modal shows only when true
  resultData: ResultData | null;    // Can be null if data hasn't loaded
  onClose: () => void;              // Callback to dismiss the modal
}

// Theme configuration for each rank
export interface RankTheme {
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
  confettiColors: string[];
  icon: 'trophy' | 'medal' | 'award';
}

// Pre-configured themes for each rank
export const RANK_THEMES: Record<1 | 2 | 3, RankTheme> = {
  1: {
    title: '🏆 WINNER!',
    subtitle: 'Congratulations, Champion!',
    primaryColor: 'text-yellow-400',
    secondaryColor: 'text-yellow-600',
    gradientFrom: 'from-yellow-500/20',
    gradientTo: 'to-amber-600/20',
    confettiColors: ['#FFD700', '#FFC107', '#FFEB3B', '#FFF176', '#FFE082'],
    icon: 'trophy',
  },
  2: {
    title: '🥈 1st Runner Up!',
    subtitle: 'Incredible Achievement!',
    primaryColor: 'text-gray-300',
    secondaryColor: 'text-gray-400',
    gradientFrom: 'from-gray-400/20',
    gradientTo: 'to-slate-500/20',
    confettiColors: ['#C0C0C0', '#A8A8A8', '#D3D3D3', '#E8E8E8', '#BEBEBE'],
    icon: 'medal',
  },
  3: {
    title: '🥉 2nd Runner Up!',
    subtitle: 'Outstanding Performance!',
    primaryColor: 'text-orange-400',
    secondaryColor: 'text-orange-600',
    gradientFrom: 'from-orange-600/20',
    gradientTo: 'to-amber-700/20',
    confettiColors: ['#CD7F32', '#B87333', '#D4A574', '#C19A6B', '#CC8E35'],
    icon: 'award',
  },
};
