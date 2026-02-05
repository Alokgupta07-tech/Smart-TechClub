/**
 * Enhanced Puzzle Timer Component
 * ================================
 * Server-synchronized timer with pause/resume/skip support
 * 
 * Features:
 * - Real-time countdown with server sync
 * - Pause/Resume functionality
 * - Skip question with confirmation
 * - Visual status indicators
 * - Auto-recovery on disconnect
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Pause,
  Play,
  SkipForward,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const API_BASE = 'http://localhost:5000/api';

interface TimerState {
  puzzle_id: string;
  status: 'not_started' | 'active' | 'paused' | 'skipped' | 'completed';
  time_spent_seconds: number;
  is_running: boolean;
  skip_count: number;
  skip_penalty_seconds: number;
}

interface SessionState {
  status: string;
  questions_completed: number;
  questions_skipped: number;
  total_skip_penalty_seconds: number;
  effective_time_seconds: number;
}

interface EnhancedPuzzleTimerProps {
  puzzleId: string;
  timeLimitMinutes?: number;
  onComplete?: () => void;
  onSkip?: () => void;
  onTimeUp?: () => void;
  showControls?: boolean;
  className?: string;
}

export function EnhancedPuzzleTimer({
  puzzleId,
  timeLimitMinutes = 30,
  onComplete,
  onSkip,
  onTimeUp,
  showControls = true,
  className,
}: EnhancedPuzzleTimerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Timer state
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [displayTime, setDisplayTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Dialogs
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  
  // Interval ref for timer
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);
  
  // Sync with server
  const syncWithServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/sync-timer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.question) {
          setTimerState(data.question);
          setDisplayTime(data.question.time_spent_seconds);
          setIsRunning(data.question.is_running);
        }
      }
    } catch (error) {
      console.error('Timer sync failed:', error);
    }
  }, [puzzleId]);
  
  // Initial sync and periodic sync
  useEffect(() => {
    syncWithServer();
    
    // Sync every 30 seconds to ensure accuracy
    syncIntervalRef.current = setInterval(syncWithServer, 30000);
    
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncWithServer]);
  
  // Local timer increment (for smooth display)
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setDisplayTime(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);
  
  // Check time limit
  useEffect(() => {
    const limitSeconds = timeLimitMinutes * 60;
    if (displayTime >= limitSeconds && isRunning) {
      onTimeUp?.();
      toast({
        title: '⏰ Time\'s Up!',
        description: 'You have exceeded the time limit for this puzzle.',
        variant: 'destructive',
      });
    }
  }, [displayTime, timeLimitMinutes, isRunning, onTimeUp, toast]);
  
  // Start question mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/start-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      if (!response.ok) throw new Error('Failed to start timer');
      return response.json();
    },
    onSuccess: () => {
      setIsRunning(true);
      syncWithServer();
      queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Pause question mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/pause-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      if (!response.ok) throw new Error('Failed to pause timer');
      return response.json();
    },
    onSuccess: (data) => {
      setIsRunning(false);
      setDisplayTime(data.time_spent_seconds);
      syncWithServer();
      setShowPauseDialog(false);
      toast({
        title: 'Timer Paused',
        description: `Time recorded: ${formatTime(data.time_spent_seconds)}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Resume question mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/resume-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      if (!response.ok) throw new Error('Failed to resume timer');
      return response.json();
    },
    onSuccess: () => {
      setIsRunning(true);
      syncWithServer();
      toast({
        title: 'Timer Resumed',
        description: 'Your time is now counting.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Skip question mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/skip-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to skip question');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setIsRunning(false);
      setShowSkipDialog(false);
      toast({
        title: 'Question Skipped',
        description: `Penalty applied: +${Math.floor(data.skip_penalty_seconds / 60)} minutes. You can return later.`,
        className: 'bg-yellow-500 text-black',
      });
      onSkip?.();
      queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
      queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Cannot Skip',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Get status color and label
  const getStatusInfo = () => {
    if (!timerState) return { color: 'text-gray-400', label: 'Loading...' };
    
    switch (timerState.status) {
      case 'active':
        return { color: 'text-green-400', label: 'Active', icon: Play };
      case 'paused':
        return { color: 'text-yellow-400', label: 'Paused', icon: Pause };
      case 'skipped':
        return { color: 'text-orange-400', label: 'Skipped', icon: SkipForward };
      case 'completed':
        return { color: 'text-blue-400', label: 'Completed', icon: CheckCircle };
      default:
        return { color: 'text-gray-400', label: 'Not Started', icon: Clock };
    }
  };
  
  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const timeLimitSeconds = timeLimitMinutes * 60;
  const isOverTime = displayTime > timeLimitSeconds;
  const timeRemaining = Math.max(0, timeLimitSeconds - displayTime);
  
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Timer Display */}
      <div className="flex items-center justify-between bg-black/50 border border-toxic-green/30 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-full',
            isRunning ? 'bg-green-500/20 animate-pulse' : 'bg-gray-500/20'
          )}>
            <Clock className={cn('w-6 h-6', isOverTime ? 'text-red-400' : 'text-toxic-green')} />
          </div>
          
          <div>
            <div className={cn(
              'text-3xl font-mono font-bold tracking-wider',
              isOverTime ? 'text-red-400' : 'text-toxic-green'
            )}>
              {formatTime(displayTime)}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <StatusIcon className="w-3 h-3" />
              <span className={statusInfo.color}>{statusInfo.label}</span>
              {timerState?.skip_count ? (
                <span className="text-orange-400">
                  • {timerState.skip_count} skip(s)
                </span>
              ) : null}
            </div>
          </div>
        </div>
        
        {/* Time Remaining / Overtime Indicator */}
        <div className="text-right">
          {isOverTime ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">Over Time</span>
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              <span className="text-gray-500">Remaining:</span>{' '}
              <span className="text-toxic-green font-mono">{formatTime(timeRemaining)}</span>
            </div>
          )}
          
          {/* Sync Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsSyncing(true);
                  syncWithServer().finally(() => setIsSyncing(false));
                }}
                className="mt-1 h-6 px-2"
                disabled={isSyncing}
              >
                <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync with server</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      {/* Controls */}
      {showControls && (
        <div className="flex gap-2">
          {timerState?.status === 'not_started' && (
            <Button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-500"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Timer
            </Button>
          )}
          
          {timerState?.status === 'active' && (
            <>
              <Button
                onClick={() => setShowPauseDialog(true)}
                disabled={pauseMutation.isPending}
                variant="outline"
                className="flex-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
              
              <Button
                onClick={() => setShowSkipDialog(true)}
                disabled={skipMutation.isPending}
                variant="outline"
                className="flex-1 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip
              </Button>
            </>
          )}
          
          {(timerState?.status === 'paused' || timerState?.status === 'skipped') && (
            <Button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-500"
            >
              <Play className="w-4 h-4 mr-2" />
              {timerState.status === 'skipped' ? 'Return to Question' : 'Resume'}
            </Button>
          )}
          
          {timerState?.status === 'completed' && (
            <div className="flex-1 flex items-center justify-center gap-2 text-blue-400 p-2 border border-blue-400/30 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              <span>Completed in {formatTime(displayTime)}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Skip Penalty Info */}
      {timerState?.skip_penalty_seconds ? (
        <div className="text-xs text-orange-400 text-center">
          Total skip penalty: +{formatTime(timerState.skip_penalty_seconds)}
        </div>
      ) : null}
      
      {/* Pause Confirmation Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="bg-gray-900 border-yellow-500/50">
          <DialogHeader>
            <DialogTitle className="text-yellow-400">Pause Timer?</DialogTitle>
            <DialogDescription>
              Pausing will stop your timer. You can resume later, but your time will be recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="bg-yellow-600 hover:bg-yellow-500"
            >
              {pauseMutation.isPending ? 'Pausing...' : 'Confirm Pause'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Skip Confirmation Dialog */}
      <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <DialogContent className="bg-gray-900 border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Skip Question?
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Skipping will:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Pause your timer for this question</li>
                <li><strong className="text-orange-400">Add a 5-minute penalty</strong> to your total time</li>
                <li>Move you to the next available question</li>
              </ul>
              <p className="text-green-400">
                ✓ You can return to this question later
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipDialog(false)}>
              Keep Working
            </Button>
            <Button
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
              className="bg-orange-600 hover:bg-orange-500"
            >
              {skipMutation.isPending ? 'Skipping...' : 'Skip Question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EnhancedPuzzleTimer;
