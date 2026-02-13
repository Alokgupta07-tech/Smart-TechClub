// src/components/CelebrationModal.tsx
// A reusable modal component that displays celebration UI for winners
// Triggers ONLY when isResultPublished is true and user is in top 3

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Medal, Award, X, Star, Sparkles } from 'lucide-react';
import Confetti from 'react-confetti';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CelebrationModalProps,
  ResultData,
  WinnerRank,
  RANK_THEMES,
  RankTheme,
} from '@/types/celebration';

/**
 * CelebrationModal Component
 * 
 * Displays a celebratory popup for top 3 finishers when results are published.
 * 
 * INTEGRATION GUIDE:
 * -----------------
 * 1. Import this component in your main dashboard/page
 * 2. Connect `isResultPublished` to your backend publish trigger
 * 3. Fetch result data from your leaderboard/results API
 * 4. Pass the onClose handler to dismiss the modal
 * 
 * Example:
 * ```tsx
 * const [showCelebration, setShowCelebration] = useState(false);
 * const { data: resultData } = useQuery(['results'], fetchResults);
 * 
 * // Listen for publish event (from websocket, polling, or state)
 * useEffect(() => {
 *   if (backendPublishState === true) {
 *     setShowCelebration(true);
 *   }
 * }, [backendPublishState]);
 * 
 * <CelebrationModal
 *   isResultPublished={showCelebration}
 *   resultData={resultData}
 *   onClose={() => setShowCelebration(false)}
 * />
 * ```
 */
export const CelebrationModal = ({
  isResultPublished,
  resultData,
  onClose,
}: CelebrationModalProps) => {
  // Track window dimensions for confetti
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });
  
  // Animation states
  const [showConfetti, setShowConfetti] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'celebrating' | 'stable'>('entering');

  // Update window size for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Trigger animations when modal opens
  useEffect(() => {
    if (isResultPublished && resultData?.currentUserRank) {
      // Start animation sequence
      setAnimationPhase('entering');
      setShowConfetti(true);

      // Transition to celebrating phase
      const celebrateTimer = setTimeout(() => {
        setAnimationPhase('celebrating');
      }, 500);

      // Transition to stable phase
      const stableTimer = setTimeout(() => {
        setAnimationPhase('stable');
      }, 3000);

      // Stop confetti after 8 seconds to save performance
      const confettiTimer = setTimeout(() => {
        setShowConfetti(false);
      }, 8000);

      return () => {
        clearTimeout(celebrateTimer);
        clearTimeout(stableTimer);
        clearTimeout(confettiTimer);
      };
    }
  }, [isResultPublished, resultData?.currentUserRank]);

  // Handle close with cleanup
  const handleClose = useCallback(() => {
    setShowConfetti(false);
    setAnimationPhase('entering');
    onClose();
  }, [onClose]);

  // NULL SAFETY: Don't render if conditions aren't met
  // 1. Results not published yet
  // 2. Result data hasn't loaded
  // 3. User is not in top 3
  if (!isResultPublished || !resultData || !resultData.currentUserRank) {
    return null;
  }

  const rank = resultData.currentUserRank;
  const theme = RANK_THEMES[rank];

  // Get the appropriate icon based on rank
  const RankIcon = rank === 1 ? Trophy : rank === 2 ? Medal : Award;

  // Get winner name based on rank
  const getWinnerNameForRank = (r: WinnerRank, data: ResultData): string => {
    switch (r) {
      case 1: return data.winnerName;
      case 2: return data.firstRunnerUpName;
      case 3: return data.secondRunnerUpName;
      default: return '';
    }
  };

  const currentWinnerName = getWinnerNameForRank(rank, resultData);

  return (
    <>
      {/* Confetti overlay - renders outside dialog for full screen effect */}
      {showConfetti && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            colors={theme.confettiColors}
            numberOfPieces={animationPhase === 'celebrating' ? 300 : 100}
            recycle={animationPhase !== 'stable'}
            gravity={0.15}
            wind={0.01}
          />
        </div>
      )}

      <Dialog open={isResultPublished}>
        <DialogContent 
          className={cn(
            "max-w-lg overflow-hidden border-2",
            rank === 1 && "border-yellow-500/50 bg-gradient-to-br from-black via-yellow-950/10 to-black",
            rank === 2 && "border-gray-400/50 bg-gradient-to-br from-black via-gray-800/10 to-black",
            rank === 3 && "border-orange-500/50 bg-gradient-to-br from-black via-orange-950/10 to-black"
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
            aria-label="Close celebration modal"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>

          {/* Decorative background elements */}
          <div className={cn(
            "absolute inset-0 opacity-10",
            theme.gradientFrom,
            theme.gradientTo,
            "bg-gradient-to-br"
          )} />

          {/* Sparkle decorations */}
          <div className="absolute top-4 left-4 animate-pulse">
            <Sparkles className={cn("w-6 h-6", theme.primaryColor)} />
          </div>
          <div className="absolute bottom-4 right-4 animate-pulse delay-500">
            <Star className={cn("w-6 h-6", theme.primaryColor)} />
          </div>
          <div className="absolute top-1/2 left-4 animate-bounce delay-300">
            <Star className={cn("w-4 h-4", theme.secondaryColor)} />
          </div>
          <div className="absolute top-1/4 right-8 animate-bounce delay-700">
            <Sparkles className={cn("w-5 h-5", theme.secondaryColor)} />
          </div>

          {/* Main content */}
          <div className="relative py-8 px-4 text-center space-y-6">
            {/* Trophy/Medal Icon with animation */}
            <div className={cn(
              "relative mx-auto w-28 h-28 flex items-center justify-center",
              "transition-transform duration-700",
              animationPhase === 'entering' && "scale-0",
              animationPhase === 'celebrating' && "scale-125 animate-bounce",
              animationPhase === 'stable' && "scale-100"
            )}>
              {/* Glow effect behind icon */}
              <div className={cn(
                "absolute inset-0 rounded-full blur-xl",
                rank === 1 && "bg-yellow-500/30",
                rank === 2 && "bg-gray-400/30",
                rank === 3 && "bg-orange-500/30"
              )} />
              <RankIcon className={cn(
                "w-20 h-20 relative z-10 drop-shadow-lg",
                theme.primaryColor,
                animationPhase === 'celebrating' && "animate-pulse"
              )} />
            </div>

            {/* Title with rank-specific styling */}
            <div className={cn(
              "space-y-2 transition-all duration-500",
              animationPhase === 'entering' && "opacity-0 translate-y-4",
              (animationPhase === 'celebrating' || animationPhase === 'stable') && "opacity-100 translate-y-0"
            )}>
              <h2 className={cn(
                "text-4xl font-bold tracking-tight",
                theme.primaryColor,
                "drop-shadow-lg"
              )}>
                {theme.title}
              </h2>
              <p className={cn(
                "text-lg",
                theme.secondaryColor
              )}>
                {theme.subtitle}
              </p>
            </div>

            {/* Winner name display */}
            <div className={cn(
              "py-4 px-6 rounded-lg border transition-all duration-700 delay-300",
              rank === 1 && "bg-yellow-500/10 border-yellow-500/30",
              rank === 2 && "bg-gray-500/10 border-gray-400/30",
              rank === 3 && "bg-orange-500/10 border-orange-500/30",
              animationPhase === 'entering' && "opacity-0 scale-95",
              (animationPhase === 'celebrating' || animationPhase === 'stable') && "opacity-100 scale-100"
            )}>
              <p className="text-sm text-gray-400 mb-1">
                {rank === 1 ? 'The Champion' : rank === 2 ? '1st Runner Up' : '2nd Runner Up'}
              </p>
              <p className={cn(
                "text-2xl font-bold",
                theme.primaryColor
              )}>
                {currentWinnerName}
              </p>
            </div>

            {/* All winners summary (optional - shows all top 3) */}
            <div className={cn(
              "pt-4 border-t border-white/10 space-y-2 transition-all duration-700 delay-500",
              animationPhase === 'entering' && "opacity-0",
              (animationPhase === 'celebrating' || animationPhase === 'stable') && "opacity-100"
            )}>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Final Standings</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className={cn(
                  "p-2 rounded",
                  rank === 1 ? "bg-yellow-500/20 ring-2 ring-yellow-500/50" : "bg-white/5"
                )}>
                  <Trophy className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
                  <p className="text-yellow-400 text-xs">1st</p>
                  <p className="text-white truncate text-xs" title={resultData.winnerName}>
                    {resultData.winnerName}
                  </p>
                </div>
                <div className={cn(
                  "p-2 rounded",
                  rank === 2 ? "bg-gray-500/20 ring-2 ring-gray-400/50" : "bg-white/5"
                )}>
                  <Medal className="w-4 h-4 mx-auto mb-1 text-gray-300" />
                  <p className="text-gray-300 text-xs">2nd</p>
                  <p className="text-white truncate text-xs" title={resultData.firstRunnerUpName}>
                    {resultData.firstRunnerUpName}
                  </p>
                </div>
                <div className={cn(
                  "p-2 rounded",
                  rank === 3 ? "bg-orange-500/20 ring-2 ring-orange-500/50" : "bg-white/5"
                )}>
                  <Award className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                  <p className="text-orange-400 text-xs">3rd</p>
                  <p className="text-white truncate text-xs" title={resultData.secondRunnerUpName}>
                    {resultData.secondRunnerUpName}
                  </p>
                </div>
              </div>
            </div>

            {/* Close button */}
            <Button
              onClick={handleClose}
              className={cn(
                "mt-4 px-8 py-2 transition-all duration-500",
                rank === 1 && "bg-yellow-600 hover:bg-yellow-500 text-black",
                rank === 2 && "bg-gray-500 hover:bg-gray-400 text-black",
                rank === 3 && "bg-orange-600 hover:bg-orange-500 text-black",
                animationPhase === 'entering' && "opacity-0",
                (animationPhase === 'celebrating' || animationPhase === 'stable') && "opacity-100"
              )}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CelebrationModal;
