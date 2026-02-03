import { useState, useEffect } from "react";
import { Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PuzzleTimerProps {
  timeLimitMinutes: number;
  startedAt?: string;
  onExpire?: () => void;
  className?: string;
}

export const PuzzleTimer = ({ 
  timeLimitMinutes, 
  startedAt,
  onExpire,
  className
}: PuzzleTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    if (!startedAt) {
      setSecondsLeft(timeLimitMinutes * 60);
      return;
    }

    const calculateTimeLeft = () => {
      const started = new Date(startedAt).getTime();
      const now = new Date().getTime();
      const elapsed = Math.floor((now - started) / 1000);
      const totalLimit = timeLimitMinutes * 60;
      const remaining = Math.max(0, totalLimit - elapsed);
      
      return remaining;
    };

    setSecondsLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setSecondsLeft(remaining);

      if (remaining === 0 && !hasExpired) {
        setHasExpired(true);
        if (onExpire) {
          onExpire();
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startedAt, timeLimitMinutes, onExpire, hasExpired]);

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  const totalSeconds = timeLimitMinutes * 60;
  const percentage = (secondsLeft / totalSeconds) * 100;
  
  const isWarning = percentage <= 20 && percentage > 10;
  const isCritical = percentage <= 10;
  const isExpired = secondsLeft === 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn(
        "flex items-center justify-center gap-3 p-4 rounded-lg border transition-all",
        isExpired && "bg-red-500/10 border-red-500/30",
        isCritical && !isExpired && "bg-red-500/10 border-red-500/30 animate-pulse",
        isWarning && !isCritical && !isExpired && "bg-yellow-500/10 border-yellow-500/30",
        !isWarning && !isExpired && "bg-toxic-green/10 border-toxic-green/30"
      )}>
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
              "w-6 h-6",
              isCritical && "text-red-500 animate-pulse",
              isWarning && !isCritical && "text-yellow-500",
              !isWarning && "text-toxic-green"
            )} />
            <span className={cn(
              "font-terminal text-3xl font-bold tracking-wider",
              isCritical && "text-red-500",
              isWarning && !isCritical && "text-yellow-500",
              !isWarning && "text-toxic-green"
            )}>
              {String(hours).padStart(2, "0")}:
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </span>
          </>
        )}
      </div>

      {/* Progress Bar */}
      {!isExpired && (
        <div className="h-2 bg-black/40 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-1000",
              isCritical && "bg-red-500",
              isWarning && !isCritical && "bg-yellow-500",
              !isWarning && "bg-toxic-green"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* Status Text */}
      <div className="text-center">
        {isExpired ? (
          <p className="text-xs text-red-400 font-terminal">
            Puzzle time limit exceeded
          </p>
        ) : isCritical ? (
          <p className="text-xs text-red-400 font-terminal animate-pulse">
            ⚠️ CRITICAL: Less than {Math.ceil(percentage)}% time remaining
          </p>
        ) : isWarning ? (
          <p className="text-xs text-yellow-500 font-terminal">
            ⚡ HURRY: {Math.ceil(percentage)}% time remaining
          </p>
        ) : (
          <p className="text-xs text-zinc-400 font-terminal">
            {Math.ceil(percentage)}% time remaining • {timeLimitMinutes} min limit
          </p>
        )}
      </div>
    </div>
  );
};

