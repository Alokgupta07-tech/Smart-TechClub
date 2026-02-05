/**
 * Team Session Progress Component
 * =================================
 * Shows overall team progress with time tracking stats
 */

import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle,
  SkipForward,
  AlertTriangle,
  TrendingUp,
  Timer,
  Award,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const API_BASE = 'http://localhost:5000/api';

interface SessionState {
  session_id: string;
  status: string;
  session_start: string | null;
  session_end: string | null;
  total_time_seconds: number;
  active_time_seconds: number;
  questions_completed: number;
  questions_skipped: number;
  total_skip_penalty_seconds: number;
  total_hint_penalty_seconds: number;
  effective_time_seconds: number;
  questions: Array<{
    puzzle_id: string;
    title: string;
    level: number;
    puzzle_number: number;
    status: string;
    time_spent_seconds: number;
    skip_count: number;
    skip_penalty_seconds: number;
  }>;
}

interface TeamSessionProgressProps {
  totalPuzzles?: number;
  className?: string;
}

export function TeamSessionProgress({
  totalPuzzles = 10,
  className,
}: TeamSessionProgressProps) {
  // Format time helper
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };
  
  // Fetch session state
  const { data, isLoading } = useQuery({
    queryKey: ['teamSession'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
  
  const session: SessionState | null = data?.session;
  
  if (isLoading || !session) {
    return (
      <div className={cn('animate-pulse bg-gray-800/50 rounded-lg p-4', className)}>
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-gray-700 rounded"></div>
      </div>
    );
  }
  
  const progressPercentage = (session.questions_completed / totalPuzzles) * 100;
  const hasPenalties = session.total_skip_penalty_seconds > 0 || session.total_hint_penalty_seconds > 0;
  
  return (
    <div className={cn('bg-black/50 border border-toxic-green/20 rounded-lg p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-toxic-green flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Session Progress
        </h3>
        <span className={cn(
          'text-xs px-2 py-1 rounded',
          session.status === 'active' && 'bg-green-500/20 text-green-400',
          session.status === 'paused' && 'bg-yellow-500/20 text-yellow-400',
          session.status === 'completed' && 'bg-blue-500/20 text-blue-400',
        )}>
          {session.status.toUpperCase()}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>{session.questions_completed} / {totalPuzzles} completed</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Active Time */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Timer className="w-3 h-3" />
            Active Time
          </div>
          <div className="text-lg font-mono font-bold text-toxic-green">
            {formatTime(session.active_time_seconds)}
          </div>
        </div>
        
        {/* Effective Time */}
        <div className={cn(
          'rounded-lg p-3',
          hasPenalties ? 'bg-orange-500/10' : 'bg-gray-900/50'
        )}>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Clock className="w-3 h-3" />
            Effective Time
          </div>
          <div className={cn(
            'text-lg font-mono font-bold',
            hasPenalties ? 'text-orange-400' : 'text-white'
          )}>
            {formatTime(session.effective_time_seconds)}
          </div>
        </div>
        
        {/* Questions Completed */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Completed
          </div>
          <div className="text-lg font-bold text-green-400">
            {session.questions_completed}
          </div>
        </div>
        
        {/* Questions Skipped */}
        <div className={cn(
          'rounded-lg p-3',
          session.questions_skipped > 0 ? 'bg-orange-500/10' : 'bg-gray-900/50'
        )}>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <SkipForward className="w-3 h-3 text-orange-400" />
            Skipped
          </div>
          <div className={cn(
            'text-lg font-bold',
            session.questions_skipped > 0 ? 'text-orange-400' : 'text-white'
          )}>
            {session.questions_skipped}
          </div>
        </div>
      </div>
      
      {/* Penalties Breakdown */}
      {hasPenalties && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="flex items-center gap-2 text-xs text-orange-400 mb-2">
            <AlertTriangle className="w-3 h-3" />
            Time Penalties
          </div>
          <div className="flex gap-4 text-xs">
            {session.total_skip_penalty_seconds > 0 && (
              <span className="text-orange-400">
                Skip: +{formatTime(session.total_skip_penalty_seconds)}
              </span>
            )}
            {session.total_hint_penalty_seconds > 0 && (
              <span className="text-yellow-400">
                Hints: +{formatTime(session.total_hint_penalty_seconds)}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Question Status List */}
      {session.questions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-2">Question Status</div>
          <div className="flex flex-wrap gap-1">
            {session.questions.map((q, index) => (
              <div
                key={q.puzzle_id}
                className={cn(
                  'w-6 h-6 rounded flex items-center justify-center text-xs font-mono',
                  q.status === 'completed' && 'bg-green-500/30 text-green-400',
                  q.status === 'active' && 'bg-blue-500/30 text-blue-400 animate-pulse',
                  q.status === 'paused' && 'bg-yellow-500/30 text-yellow-400',
                  q.status === 'skipped' && 'bg-orange-500/30 text-orange-400',
                  q.status === 'not_started' && 'bg-gray-700/30 text-gray-500',
                )}
                title={`${q.title} - ${q.status}`}
              >
                {q.puzzle_number}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamSessionProgress;
