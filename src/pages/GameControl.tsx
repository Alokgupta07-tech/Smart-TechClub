import { useState, startTransition } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Pause,
  Square,
  Unlock,
  MessageSquare,
  RefreshCw,
  Puzzle,
  Lock,
  ClipboardCheck,
  Eye,
  FileCheck,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface GameState {
  game_active: boolean;
  current_level: number;
  level1_open: boolean;
  level2_open: boolean;
  game_started_at: string | null;
  game_ended_at: string | null;
}

// NEW: Interface for evaluation status
interface EvaluationStatus {
  level_id: number;
  evaluation_state: 'IN_PROGRESS' | 'SUBMISSIONS_CLOSED' | 'EVALUATING' | 'RESULTS_PUBLISHED';
  submissions: {
    total_submissions: number;
    pending: number;
    evaluated: number;
    teams_with_submissions: number;
  };
  teams: {
    total: number;
    qualified: number;
    disqualified: number;
    pending: number;
  };
  actions: {
    can_close_submissions: boolean;
    can_reopen_submissions: boolean;
    can_evaluate: boolean;
    can_publish: boolean;
  };
  timestamps: {
    submissions_closed_at: string | null;
    evaluation_started_at: string | null;
    evaluated_at: string | null;
    results_published_at: string | null;
  };
}

export default function GameControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [selectedLevel, setSelectedLevel] = useState<number>(1); // NEW: Track selected level for evaluation
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  
  // Generic confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
    variant?: 'default' | 'destructive';
  }>({ open: false, title: '', description: '', action: () => {} });
  
  const showConfirm = (title: string, description: string, action: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmDialog({ open: true, title, description, action, variant });
  };

  // Fetch game state
  const { data: gameStateData, isLoading } = useQuery({
    queryKey: ['gameState'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/state`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch game state');
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds (reduced from 5)
    staleTime: 8000, // Consider data fresh for 8 seconds
    gcTime: 20000, // Cache for 20 seconds (reduced memory)
    refetchOnWindowFocus: false, // Prevent refetch on window focus
  });

  const gameState: GameState | undefined = gameStateData;

  // Fetch admin stats
  const { data: statsData } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/stats`);
      if (!response.ok) {
        return { totalTeams: 0, active: 0, completed: 0, waiting: 0, avgTime: '00:00:00', hintsUsed: 0 };
      }
      return response.json();
    },
    refetchInterval: 10000,
    staleTime: 8000,
  });

  // ======= NEW: Fetch evaluation status for selected level =======
  const { data: evaluationData } = useQuery({
    queryKey: ['evaluationStatus', selectedLevel],
    queryFn: async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${selectedLevel}/status`);
        
        if (!response.ok) {
          // Evaluation endpoints not implemented yet - return null silently
          return null;
        }
        return response.json();
      } catch (error) {
        // Silently fail if endpoint doesn't exist
        return null;
      }
    },
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
    retry: false, // Don't retry on 404
  });

  const evaluationStatus: EvaluationStatus | undefined = evaluationData;

  // Close Submissions mutation
  const closeSubmissions = useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${levelId}/close-submissions`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to close submissions');
      }
      return response.json();
    },
    onSuccess: (data) => {
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['evaluationStatus'] });
      });
      toast({
        title: 'Submissions Closed',
        description: `Level ${selectedLevel} submissions are now closed. ${data.teams_affected} teams affected.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Evaluate Answers mutation
  const evaluateAnswers = useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${levelId}/evaluate`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to evaluate answers');
      }
      return response.json();
    },
    onSuccess: (data) => {
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['evaluationStatus'] });
      });
      toast({
        title: 'Evaluation Complete',
        description: `${data.stats.submissions_evaluated} submissions evaluated. ${data.stats.correct_answers || 0} correct.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Publish Results mutation
  const publishResults = useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${levelId}/publish-results`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to publish results');
      }
      return response.json();
    },
    onSuccess: (data) => {
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['evaluationStatus'] });
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      toast({
        title: 'Results Published!',
        description: `Level ${selectedLevel} results are now visible. ${data.stats.qualified} qualified, ${data.stats.disqualified} disqualified.`,
        className: 'bg-green-500 text-white',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reopen Submissions mutation
  const reopenSubmissions = useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${levelId}/reopen-submissions`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reopen submissions');
      }
      return response.json();
    },
    onSuccess: () => {
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['evaluationStatus'] });
      });
      toast({
        title: 'Submissions Reopened',
        description: `Level ${selectedLevel} submissions are now open again.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reset Evaluation mutation
  const resetEvaluation = useMutation({
    mutationFn: async (levelId: number) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/evaluation/level/${levelId}/reset-evaluation`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reset evaluation');
      }
      return response.json();
    },
    onSuccess: () => {
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['evaluationStatus'] });
      });
      toast({
        title: 'Evaluation Reset',
        description: `Level ${selectedLevel} evaluation has been reset. You can now re-evaluate.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Start game mutation
  const startGame = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/start`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to start game');
      return response.json();
    },
    onMutate: () => {
      // Optimistic update (non-blocking)
      const previousState = queryClient.getQueryData(['gameState']);
      
      queryClient.setQueryData(['gameState'], (old: any) => ({
        ...old,
        game_active: true,
        level1_open: true,
        game_started_at: new Date().toISOString(),
      }));
      
      return { previousState };
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Success',
        description: 'Game started! Level 1 unlocked.',
      });
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousState) {
        queryClient.setQueryData(['gameState'], context.previousState);
      }
      toast({
        title: 'Error',
        description: 'Failed to start game',
        variant: 'destructive',
      });
    },
  });

  // Unlock Level 2 mutation
  const unlockLevel2 = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/level/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 2 }),
      });
      
      if (!response.ok) throw new Error('Failed to unlock Level 2');
      return response.json();
    },
    onMutate: () => {
      // Optimistic update (non-blocking)
      const previousState = queryClient.getQueryData(['gameState']);
      
      queryClient.setQueryData(['gameState'], (old: any) => ({
        ...old,
        level2_open: true,
        current_level: 2,
      }));
      
      return { previousState };
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Success',
        description: 'Level 2 unlocked!',
      });
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousState) {
        queryClient.setQueryData(['gameState'], context.previousState);
      }
      toast({
        title: 'Error',
        description: 'Failed to unlock Level 2',
        variant: 'destructive',
      });
    },
  });

  // Pause game mutation
  const pauseGame = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/pause`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to pause game');
      return response.json();
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Game Paused',
        description: 'All teams have been paused',
      });
    },
  });

  // Resume game mutation
  const resumeGame = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/resume`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to resume game');
      return response.json();
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Game Resumed',
        description: 'All teams have been resumed',
      });
    },
  });

  // End game mutation
  const endGame = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/end`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to end game');
      return response.json();
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Game Ended',
        description: 'All teams have been marked as completed',
      });
    },
  });

  // Restart game mutation
  const restartGame = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/restart`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to restart game');
      return response.json();
    },
    onSuccess: () => {
      // Defer invalidation to prevent blocking
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['gameState'] });
      });
      
      toast({
        title: 'Game Restarted',
        description: 'Game has been reset to initial state',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to restart game',
        variant: 'destructive',
      });
    },
  });

  // Broadcast message mutation
  const broadcastMsg = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: broadcastMessage,
          message_type: messageType,
          expires_in_minutes: 30,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to broadcast message');
      return response.json();
    },
    onSuccess: () => {
      setIsBroadcastOpen(false);
      setBroadcastMessage('');
      toast({
        title: 'Message Broadcasted',
        description: 'All teams will see your message',
      });
    },
  });
  
  // Derive phase from game_active and game_ended_at for display
  const getCurrentPhase = (): string => {
    if (!gameState) return 'not_started';
    if (gameState.game_ended_at) return 'completed';
    if (!gameState.game_active && !gameState.game_started_at) return 'not_started';
    if (!gameState.game_active) return 'paused';
    return `level_${gameState.current_level}`;
  };
  
  const currentPhase = getCurrentPhase();

  const getPhaseDisplay = (phase: string | undefined | null) => {
    if (!phase) return 'Not Started';
    const phases: Record<string, string> = {
      not_started: 'Not Started',
      paused: 'Paused',
      level_1: 'Level 1 Active',
      level_2: 'Level 2 Active',
      completed: 'Game Completed',
    };
    return phases[phase] || phase;
  };

  const getPhaseColor = (phase: string | undefined | null) => {
    if (!phase) return 'text-zinc-400';
    const colors: Record<string, string> = {
      not_started: 'text-zinc-400',
      paused: 'text-orange-400',
      level_1: 'text-yellow-500',
      level_2: 'text-orange-500',
      completed: 'text-green-500',
    };
    return colors[phase] || 'text-zinc-400';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-zinc-400">Loading game state...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back Button */}
      <BackButton label="Back to Admin" to="/admin" />
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-toxic-green">Game Control</h1>
        <p className="text-zinc-400 mt-2">Manage the game flow and broadcast messages</p>
      </div>

      {/* Game State Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Game Phase</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${gameState ? getPhaseColor(currentPhase) : ''}`}>
              {gameState ? getPhaseDisplay(currentPhase) : 'Unknown'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Total Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-toxic-green">
              {statsData?.totalTeams ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Active Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">
              {statsData?.active ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {statsData?.completed ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader>
            <CardTitle className="text-sm">Level 1</CardTitle>
          </CardHeader>
          <CardContent>
            {gameState?.level1_open ? (
              <span className="text-green-500 font-semibold">✓ Unlocked</span>
            ) : (
              <span className="text-zinc-500">Locked</span>
            )}
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader>
            <CardTitle className="text-sm">Level 2</CardTitle>
          </CardHeader>
          <CardContent>
            {gameState?.level2_open ? (
              <span className="text-green-500 font-semibold">✓ Unlocked</span>
            ) : (
              <span className="text-zinc-500">Locked</span>
            )}
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader>
            <CardTitle className="text-sm">Game Status</CardTitle>
          </CardHeader>
          <CardContent>
            {currentPhase === 'not_started' ? (
              <span className="text-zinc-500 font-semibold">⏹ Not Started</span>
            ) : currentPhase === 'completed' ? (
              <span className="text-blue-500 font-semibold">✓ Completed</span>
            ) : currentPhase === 'paused' ? (
              <span className="text-yellow-500 font-semibold">⏸ Paused</span>
            ) : (
              <span className="text-green-500 font-semibold">▶ Running</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Primary Game Controls */}
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="text-toxic-green flex items-center gap-2">
            <Play className="w-5 h-5" />
            Primary Game Controls
          </CardTitle>
          <CardDescription>
            Main controls to start, pause, and end the game
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Start Game - Only shown when game hasn't started */}
          {currentPhase === 'not_started' && (
            <div className="flex items-center justify-between p-4 border-2 border-green-500/40 bg-green-500/10 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-green-500 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Start Game
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Begin the event and unlock Level 1 for all qualified teams
                </p>
              </div>
              <Button
                onClick={() => showConfirm(
                  'Start Game',
                  'Start the game now? This will activate Level 1 for all teams.',
                  () => startTransition(() => startGame.mutate())
                )}
                disabled={startGame.isPending}
                className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 min-w-[140px]"
              >
                <Play className="w-4 h-4 mr-2" />
                {startGame.isPending ? 'Starting...' : 'Start Game'}
              </Button>
            </div>
          )}

          {/* Pause/Resume Game - Only shown when game is active or paused */}
          {currentPhase !== 'not_started' && currentPhase !== 'completed' && (
            <div className={`flex items-center justify-between p-4 border-2 rounded-lg ${
              currentPhase === 'paused' 
                ? 'border-green-500/40 bg-green-500/10' 
                : 'border-yellow-500/40 bg-yellow-500/10'
            }`}>
              <div className="flex-1">
                <h3 className={`font-semibold flex items-center gap-2 ${
                  currentPhase === 'paused' ? 'text-green-500' : 'text-yellow-500'
                }`}>
                  {currentPhase === 'paused' ? (
                    <>
                      <Play className="w-5 h-5" />
                      Resume Game
                    </>
                  ) : (
                    <>
                      <Pause className="w-5 h-5" />
                      Pause Game
                    </>
                  )}
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {currentPhase === 'paused'
                    ? 'Resume the game for all teams'
                    : 'Temporarily pause the game for all teams'}
                </p>
              </div>
              {currentPhase === 'paused' ? (
                <Button
                  onClick={() => showConfirm(
                    'Resume Game',
                    'Resume the game for all teams?',
                    () => startTransition(() => resumeGame.mutate())
                  )}
                  disabled={resumeGame.isPending}
                  className="bg-green-500 text-white hover:bg-green-600 min-w-[140px]"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {resumeGame.isPending ? 'Resuming...' : 'Resume Game'}
                </Button>
              ) : (
                <Button
                  onClick={() => showConfirm(
                    'Pause Game',
                    'Pause the game for all teams? They can resume from where they stopped.',
                    () => startTransition(() => pauseGame.mutate())
                  )}
                  disabled={pauseGame.isPending}
                  className="bg-yellow-500 text-black hover:bg-yellow-600 min-w-[140px]"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {pauseGame.isPending ? 'Pausing...' : 'Pause Game'}
                </Button>
              )}
            </div>
          )}

          {/* End Game - Only shown when game is active or paused */}
          {currentPhase !== 'not_started' && currentPhase !== 'completed' && (
            <div className="flex items-center justify-between p-4 border-2 border-red-500/40 bg-red-500/10 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-red-500 flex items-center gap-2">
                  <Square className="w-5 h-5" />
                  End Game
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Mark all active teams as completed and end the event permanently
                </p>
              </div>
              <Button
                onClick={() => showConfirm(
                  'End Game',
                  'Are you sure you want to END the game? This will complete the event for all teams. This action cannot be undone!',
                  () => startTransition(() => endGame.mutate()),
                  'destructive'
                )}
                disabled={endGame.isPending}
                className="bg-red-500 text-white hover:bg-red-600 min-w-[140px]"
              >
                <Square className="w-4 h-4 mr-2" />
                {endGame.isPending ? 'Ending...' : 'End Game'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Level Management */}
      {!!gameState?.game_active && (
      <Card className="bg-black/40 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-purple-500 flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Level Management
          </CardTitle>
          <CardDescription>
            Control access to different game levels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Unlock Level 2 */}
          {!gameState?.level2_open && (
            <div className="flex items-center justify-between p-4 border border-purple-500/20 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-purple-500">Unlock Level 2</h3>
                <p className="text-sm text-zinc-400">
                  Allow teams to progress to Level 2 puzzles
                </p>
              </div>
              <Button
                onClick={() => showConfirm(
                  'Unlock Level 2',
                  'Unlock Level 2 for all teams?',
                  () => startTransition(() => unlockLevel2.mutate())
                )}
                disabled={unlockLevel2.isPending}
                className="bg-purple-500 text-white hover:bg-purple-600"
              >
                <Unlock className="w-4 h-4 mr-2" />
                {unlockLevel2.isPending ? 'Unlocking...' : 'Unlock Level 2'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Communication & Utilities */}
      <Card className="bg-black/40 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-blue-500 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Communication & Utilities
          </CardTitle>
          <CardDescription>
            Broadcast messages and manage game content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Broadcast Message */}
          <div className="flex items-center justify-between p-4 border border-blue-500/20 rounded-lg">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-500">Broadcast Message</h3>
              <p className="text-sm text-zinc-400">
                Send an announcement to all teams
              </p>
            </div>
            <Button
              onClick={() => setIsBroadcastOpen(true)}
              className="bg-blue-500 text-white hover:bg-blue-600"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Broadcast
            </Button>
          </div>

          {/* Manage Puzzles */}
          <div className="flex items-center justify-between p-4 border border-cyan-500/20 rounded-lg">
            <div className="flex-1">
              <h3 className="font-semibold text-cyan-500">Manage Puzzles</h3>
              <p className="text-sm text-zinc-400">
                Create, edit, and manage game puzzles
              </p>
            </div>
            <Link to="/admin/puzzles">
              <Button className="bg-cyan-500 text-white hover:bg-cyan-600">
                <Puzzle className="w-4 h-4 mr-2" />
                Puzzles
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-black/40 border-orange-500/30">
        <CardHeader>
          <CardTitle className=" text-orange-500 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-orange-400/70">
            ⚠️ Destructive actions - Use with extreme caution!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Restart Game */}
          <div className="flex items-center justify-between p-4 border-2 border-orange-500/40 bg-orange-500/10 rounded-lg">
            <div className="flex-1">
              <h3 className="font-semibold text-orange-500 flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Reset Game Completely
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                ⚠️ WARNING: This will erase ALL team progress and reset the game to the initial state. This action cannot be undone!
              </p>
            </div>
            <Button
              onClick={() => setIsResetDialogOpen(true)}
              disabled={restartGame.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600 min-w-[140px]"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {restartGame.isPending ? 'Resetting...' : 'Reset Game'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset Game Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="bg-zinc-900 border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-orange-500 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              ⚠️ DANGER: Reset Game
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              This will permanently erase ALL team progress, submissions, and reset the game to its initial state. This action CANNOT be undone!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-sm text-orange-400">
                <strong>This will:</strong>
              </p>
              <ul className="text-sm text-orange-300 list-disc list-inside mt-2">
                <li>Delete all team progress</li>
                <li>Clear all submissions</li>
                <li>Reset game state to beginning</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="reset-confirm" className="text-zinc-400">
                Type <span className="text-orange-500 font-bold">RESET</span> to confirm:
              </Label>
              <Input
                id="reset-confirm"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Type RESET"
                className="mt-2 bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsResetDialogOpen(false);
                setResetConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetConfirmText === 'RESET') {
                  setIsResetDialogOpen(false);
                  setResetConfirmText('');
                  startTransition(() => {
                    restartGame.mutate();
                  });
                } else {
                  toast({
                    title: 'Invalid Confirmation',
                    description: 'Please type RESET exactly to confirm.',
                    variant: 'destructive',
                  });
                }
              }}
              disabled={resetConfirmText !== 'RESET' || restartGame.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {restartGame.isPending ? 'Resetting...' : 'Reset Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Level Evaluation Controls */}
      <Card className="bg-black/40 border-cyan-500/30">
        <CardHeader>
          <CardTitle className="text-cyan-500 flex items-center gap-2">
            <FileCheck className="w-5 h-5" />
            Evaluation Controls
          </CardTitle>
          <CardDescription>
            Control answer evaluation and result publication per level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Level Selector */}
          <div className="flex items-center gap-4 p-4 border border-zinc-700 rounded-lg">
            <Label className="text-zinc-400">Select Level:</Label>
            <div className="flex gap-2">
              <Button
                variant={selectedLevel === 1 ? 'default' : 'outline'}
                onClick={() => setSelectedLevel(1)}
                className={selectedLevel === 1 ? 'bg-cyan-500 text-black' : ''}
              >
                Level 1
              </Button>
              <Button
                variant={selectedLevel === 2 ? 'default' : 'outline'}
                onClick={() => setSelectedLevel(2)}
                className={selectedLevel === 2 ? 'bg-cyan-500 text-black' : ''}
              >
                Level 2
              </Button>
            </div>
          </div>

          {/* Evaluation Status Display */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Current State</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-bold ${
                  evaluationStatus?.evaluation_state === 'RESULTS_PUBLISHED' ? 'text-green-500' :
                  evaluationStatus?.evaluation_state === 'EVALUATING' ? 'text-yellow-500' :
                  evaluationStatus?.evaluation_state === 'SUBMISSIONS_CLOSED' ? 'text-orange-500' :
                  'text-cyan-500'
                }`}>
                  {evaluationStatus?.evaluation_state?.replace(/_/g, ' ') || 'IN PROGRESS'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-cyan-500">
                  {evaluationStatus?.submissions?.total_submissions || 0}
                </p>
                <p className="text-xs text-zinc-500">
                  {evaluationStatus?.submissions?.pending || 0} pending
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Teams</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-cyan-500">
                  {evaluationStatus?.submissions?.teams_with_submissions || 0}
                </p>
                <p className="text-xs text-zinc-500">with submissions</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Qualified</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-green-500">
                  {evaluationStatus?.teams?.qualified || 0}
                </p>
                <p className="text-xs text-zinc-500">
                  {evaluationStatus?.teams?.disqualified || 0} disqualified
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sequential Action Buttons */}
          <div className="space-y-4">
            {/* Step 1: Close Submissions */}
            <div className={`flex items-center justify-between p-4 border rounded-lg ${
              evaluationStatus?.actions?.can_close_submissions || evaluationStatus?.actions?.can_reopen_submissions ? 'border-orange-500/30' : 'border-zinc-700 opacity-50'
            }`}>
              <div>
                <h3 className="font-semibold text-orange-500 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Step 1: {evaluationStatus?.evaluation_state === 'IN_PROGRESS' ? 'Close' : 'Reopen'} Submissions
                </h3>
                <p className="text-sm text-zinc-400">
                  {evaluationStatus?.evaluation_state === 'IN_PROGRESS' 
                    ? `Lock further answer submissions for Level ${selectedLevel}`
                    : `Reopen submissions for Level ${selectedLevel} (will reset evaluation if already done)`
                  }
                </p>
              </div>
              <div className="flex gap-2">
                {evaluationStatus?.actions?.can_close_submissions && (
                  <Button
                    onClick={() => closeSubmissions.mutate(selectedLevel)}
                    disabled={closeSubmissions.isPending}
                    className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    {closeSubmissions.isPending ? 'Closing...' : 'Close Submissions'}
                  </Button>
                )}
                {evaluationStatus?.actions?.can_reopen_submissions && (
                  <Button
                    variant="outline"
                    onClick={() => reopenSubmissions.mutate(selectedLevel)}
                    disabled={reopenSubmissions.isPending}
                    className="border-green-500 text-green-400 hover:bg-green-500/20"
                  >
                    {reopenSubmissions.isPending ? 'Reopening...' : 'Reopen Submissions'}
                  </Button>
                )}
              </div>
            </div>

            {/* Step 2: Evaluate Answers */}
            <div className={`flex items-center justify-between p-4 border rounded-lg ${
              evaluationStatus?.actions?.can_evaluate ? 'border-yellow-500/30' : 'border-zinc-700 opacity-50'
            }`}>
              <div>
                <h3 className="font-semibold text-yellow-500 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  Step 2: Evaluate Answers
                </h3>
                <p className="text-sm text-zinc-400">
                  Run evaluation logic on all submitted answers
                </p>
              </div>
              <Button
                onClick={() => showConfirm(
                  'Evaluate Answers',
                  `Evaluate all answers for Level ${selectedLevel}? This will calculate scores and qualification.`,
                  () => evaluateAnswers.mutate(selectedLevel)
                )}
                disabled={!evaluationStatus?.actions?.can_evaluate || evaluateAnswers.isPending}
                className="bg-yellow-500 text-black hover:bg-yellow-600 disabled:opacity-50"
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                {evaluateAnswers.isPending ? 'Evaluating...' : 'Evaluate Answers'}
              </Button>
            </div>

            {/* Step 3: Publish Results */}
            <div className={`flex items-center justify-between p-4 border rounded-lg ${
              evaluationStatus?.actions?.can_publish ? 'border-green-500/30' : 'border-zinc-700 opacity-50'
            }`}>
              <div>
                <h3 className="font-semibold text-green-500 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Step 3: Publish Results
                </h3>
                <p className="text-sm text-zinc-400">
                  Make results visible to teams (cannot be undone)
                </p>
              </div>
              <Button
                onClick={() => showConfirm(
                  'Publish Results',
                  `Publish Level ${selectedLevel} results? Teams will see their scores and qualification status.`,
                  () => publishResults.mutate(selectedLevel)
                )}
                disabled={!evaluationStatus?.actions?.can_publish || publishResults.isPending}
                className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
              >
                <Eye className="w-4 h-4 mr-2" />
                {publishResults.isPending ? 'Publishing...' : 'Publish Results'}
              </Button>
            </div>
          </div>

          {/* Status Timeline */}
          {evaluationStatus && (
            <div className="mt-4 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-zinc-400">Timeline</h4>
                {(evaluationStatus.evaluation_state === 'EVALUATING' || evaluationStatus.evaluation_state === 'RESULTS_PUBLISHED') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => showConfirm(
                      'Reset Evaluation',
                      `Reset evaluation for Level ${selectedLevel}? This will allow you to re-evaluate all submissions.`,
                      () => resetEvaluation.mutate(selectedLevel)
                    )}
                    disabled={resetEvaluation.isPending}
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                  >
                    {resetEvaluation.isPending ? 'Resetting...' : 'Reset Evaluation'}
                  </Button>
                )}
              </div>
              <div className="space-y-1 text-sm">
                {evaluationStatus.timestamps?.submissions_closed_at && (
                  <p className="text-orange-400">
                    ● Submissions closed: {new Date(evaluationStatus.timestamps.submissions_closed_at).toLocaleString()}
                  </p>
                )}
                {evaluationStatus.timestamps?.evaluated_at && (
                  <p className="text-yellow-400">
                    ● Evaluation completed: {new Date(evaluationStatus.timestamps.evaluated_at).toLocaleString()}
                  </p>
                )}
                {evaluationStatus.timestamps?.results_published_at && (
                  <p className="text-green-400">
                    ● Results published: {new Date(evaluationStatus.timestamps.results_published_at).toLocaleString()}
                  </p>
                )}
                {!evaluationStatus.timestamps?.submissions_closed_at && (
                  <p className="text-zinc-500">● Submissions open - waiting for close</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broadcast Dialog */}
      <Dialog open={isBroadcastOpen} onOpenChange={setIsBroadcastOpen}>
        <DialogContent className="bg-black border-blue-500">
          <DialogHeader>
            <DialogTitle className="text-blue-500">Broadcast Message</DialogTitle>
            <DialogDescription>
              Send a message to all teams. They will see it on their dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Message Type</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Message</Label>
              <Textarea
                id="broadcast-message"
                name="message"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Enter your message..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBroadcastOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                startTransition(() => {
                  broadcastMsg.mutate();
                });
              }}
              disabled={broadcastMsg.isPending || !broadcastMessage}
              className="bg-blue-500 text-white hover:bg-blue-600"
            >
              {broadcastMsg.isPending ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog.action();
                setConfirmDialog(prev => ({ ...prev, open: false }));
              }}
              className={confirmDialog.variant === 'destructive' ? 'bg-red-500 hover:bg-red-600' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

