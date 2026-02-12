/**
 * Server-Synced Puzzle Timer Component
 * =====================================
 * Displays accurate time from server, with local rendering
 * All time tracking is server-validated
 */

import { useState, useEffect } from "react";
import { Clock, Pause, Play, SkipForward, AlertCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTimeTracking } from "@/hooks/useTimeTracking";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ServerPuzzleTimerProps {
  puzzleId: string;
  timeLimitMinutes?: number;
  onExpire?: () => void;
  onSkip?: () => void;
  showControls?: boolean;
  className?: string;
}

/**
 * Main Timer Component with Server Sync
 */
export const ServerPuzzleTimer = ({ 
  puzzleId,
  timeLimitMinutes = 30,
  onExpire,
  onSkip,
  showControls = true,
  className
}: ServerPuzzleTimerProps) => {
  const [showSkipModal, setShowSkipModal] = useState(false);
  
  const {
    timeSpentSeconds,
    timeFormatted,
    status,
    isRunning,
    isLoading,
    session,
    start,
    pause,
    resume,
    skip,
    isStarting,
    isPausing,
    isResuming,
    isSkipping
  } = useTimeTracking({ puzzleId, autoSync: true, syncIntervalMs: 3000 });

  // Calculate remaining time if limit exists
  const totalLimitSeconds = timeLimitMinutes * 60;
  const remainingSeconds = Math.max(0, totalLimitSeconds - timeSpentSeconds);
  const percentage = (remainingSeconds / totalLimitSeconds) * 100;
  
  const isWarning = percentage <= 20 && percentage > 10;
  const isCritical = percentage <= 10;
  const isExpired = remainingSeconds === 0 && timeLimitMinutes > 0;

  // Handle expiration
  useEffect(() => {
    if (isExpired && onExpire) {
      onExpire();
    }
  }, [isExpired, onExpire]);

  // Handle start/pause/resume
  const handleToggleTimer = async () => {
    try {
      if (status === 'not_started') {
        await start();
      } else if (isRunning) {
        await pause();
      } else if (status === 'paused' || status === 'skipped') {
        await resume();
      }
    } catch (error: any) {
      console.error('Timer action failed:', error);
    }
  };

  // Handle skip
  const handleSkip = async () => {
    try {
      await skip();
      setShowSkipModal(false);
      if (onSkip) onSkip();
    } catch (error: any) {
      console.error('Skip failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Timer className="w-6 h-6 animate-pulse text-toxic-green" />
        <span className="ml-2 font-terminal text-muted-foreground">Syncing timer...</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Timer Display */}
      <div className={cn(
        "flex items-center justify-center gap-3 p-4 rounded-lg border transition-all relative overflow-hidden",
        isExpired && "bg-red-500/10 border-red-500/30",
        isCritical && !isExpired && "bg-red-500/10 border-red-500/30",
        isWarning && !isCritical && !isExpired && "bg-yellow-500/10 border-yellow-500/30",
        !isWarning && !isExpired && "bg-toxic-green/10 border-toxic-green/30"
      )}>
        {/* Running indicator pulse */}
        {isRunning && (
          <div className="absolute inset-0 bg-toxic-green/5 animate-pulse" />
        )}
        
        {isExpired ? (
          <>
            <AlertCircle className="w-6 h-6 text-red-500 animate-pulse" />
            <span className="font-terminal text-xl font-bold text-red-500">
              TIME EXPIRED!
            </span>
          </>
        ) : (
          <>
            <Clock className={cn(
              "w-6 h-6 relative z-10",
              isCritical && "text-red-500 animate-pulse",
              isWarning && !isCritical && "text-yellow-500",
              !isWarning && "text-toxic-green"
            )} />
            <div className="flex flex-col items-center relative z-10">
              <span className={cn(
                "font-terminal text-3xl font-bold tracking-wider",
                isCritical && "text-red-500",
                isWarning && !isCritical && "text-yellow-500",
                !isWarning && "text-toxic-green"
              )}>
                {timeFormatted}
              </span>
              <span className="text-xs text-muted-foreground font-terminal">
                {status === 'active' && isRunning && '● RUNNING'}
                {status === 'paused' && '⏸ PAUSED'}
                {status === 'skipped' && '⏭ SKIPPED'}
                {status === 'completed' && '✓ COMPLETED'}
                {status === 'not_started' && '○ NOT STARTED'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Timer Controls */}
      {showControls && status !== 'completed' && (
        <div className="flex gap-2 justify-center">
          <Button
            onClick={handleToggleTimer}
            variant="outline"
            size="sm"
            disabled={isStarting || isPausing || isResuming}
            className={cn(
              "font-terminal",
              isRunning && "border-yellow-500 text-yellow-500 hover:bg-yellow-500/10",
              !isRunning && "border-toxic-green text-toxic-green hover:bg-toxic-green/10"
            )}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4 mr-1" />
                {isPausing ? 'Pausing...' : 'Pause'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-1" />
                {status === 'not_started' && (isStarting ? 'Starting...' : 'Start')}
                {(status === 'paused' || status === 'skipped') && (isResuming ? 'Resuming...' : 'Resume')}
              </>
            )}
          </Button>
          
          {status !== 'not_started' && (
            <Button
              onClick={() => setShowSkipModal(true)}
              variant="outline"
              size="sm"
              disabled={isSkipping}
              className="font-terminal border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
            >
              <SkipForward className="w-4 h-4 mr-1" />
              Skip
            </Button>
          )}
        </div>
      )}

      {/* Session Stats (mini) */}
      {session && (
        <div className="flex justify-center gap-4 text-xs text-muted-foreground font-terminal">
          <span>Total: {session.totalTimeFormatted || '00:00:00'}</span>
          <span>•</span>
          <span>Skips: {session.questionsSkipped || 0}/{session.skipsRemaining !== undefined ? session.skipsRemaining + (session.questionsSkipped || 0) : 3}</span>
        </div>
      )}

      {/* Skip Confirmation Modal */}
      <SkipQuestionModal 
        open={showSkipModal}
        onClose={() => setShowSkipModal(false)}
        onConfirm={handleSkip}
        isLoading={isSkipping}
        skipsRemaining={session?.skipsRemaining ?? 3}
        penaltySeconds={60}
      />
    </div>
  );
};

/**
 * Skip Question Confirmation Modal
 */
interface SkipModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  skipsRemaining: number;
  penaltySeconds: number;
}

export const SkipQuestionModal = ({
  open,
  onClose,
  onConfirm,
  isLoading,
  skipsRemaining,
  penaltySeconds
}: SkipModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-400 font-terminal">
            <SkipForward className="w-5 h-5" />
            Skip This Question?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground space-y-2 pt-2">
            <p>Are you sure you want to skip this question?</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Your timer will be paused</li>
              <li>Time already spent will be recorded</li>
              <li>
                <span className="text-orange-400 font-semibold">
                  +{penaltySeconds} seconds
                </span> penalty will be added
              </li>
              <li>You can return to this question later</li>
            </ul>
            <p className="text-sm pt-2">
              Skips remaining: <span className={cn(
                "font-bold",
                skipsRemaining > 1 ? "text-toxic-green" : "text-orange-400"
              )}>{skipsRemaining}</span>
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="font-terminal"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || skipsRemaining <= 0}
            className="font-terminal bg-orange-500 hover:bg-orange-600"
          >
            {isLoading ? 'Skipping...' : 'Skip Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Session Timer Display (Total Time)
 */
interface SessionTimerProps {
  className?: string;
}

export const SessionTimer = ({ className }: SessionTimerProps) => {
  const { session, totalTimeFormatted } = useTimeTracking({ 
    puzzleId: '', 
    autoSync: true, 
    syncIntervalMs: 5000 
  });

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border",
      className
    )}>
      <Timer className="w-4 h-4 text-toxic-green" />
      <div className="flex flex-col">
        <span className="font-terminal text-lg text-toxic-green">{totalTimeFormatted}</span>
        <span className="text-xs text-muted-foreground">Total Time</span>
      </div>
      {session?.penaltySeconds > 0 && (
        <div className="flex flex-col ml-2 pl-2 border-l border-border">
          <span className="font-terminal text-sm text-orange-400">
            +{Math.floor(session.penaltySeconds / 60)}:{String(session.penaltySeconds % 60).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground">Penalty</span>
        </div>
      )}
    </div>
  );
};

export default ServerPuzzleTimer;
