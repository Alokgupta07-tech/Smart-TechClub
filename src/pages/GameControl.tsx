import { useState } from 'react';
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

const API_BASE = 'http://localhost:5000/api';

interface GameState {
  id: string;
  game_name: string;
  current_phase: string;
  level_1_unlocked: boolean;
  level_2_unlocked: boolean;
  game_started_at: string | null;
  game_ended_at: string | null;
  is_paused: boolean;
  total_teams: number;
  active_teams: number;
  completed_teams: number;
}

export default function GameControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  // Fetch game state
  const { data: gameStateData, isLoading } = useQuery({
    queryKey: ['gameState'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      console.log('GameControl: Fetching game state, token exists:', !!token, 'token:', token?.substring(0, 20) + '...');
      const response = await fetch(`${API_BASE}/game/state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        console.error('GameControl: Failed to fetch game state, status:', response.status);
        throw new Error('Failed to fetch game state');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Start game mutation
  const startGame = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to start game');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      toast({
        title: 'Success',
        description: 'Game started! Level 1 unlocked.',
      });
    },
    onError: () => {
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
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/level2/unlock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to unlock Level 2');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      toast({
        title: 'Success',
        description: 'Level 2 unlocked!',
      });
    },
    onError: () => {
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
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to pause game');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      toast({
        title: 'Game Paused',
        description: 'All teams have been paused',
      });
    },
  });

  // Resume game mutation
  const resumeGame = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to resume game');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      toast({
        title: 'Game Resumed',
        description: 'All teams have been resumed',
      });
    },
  });

  // End game mutation
  const endGame = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to end game');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
      toast({
        title: 'Game Ended',
        description: 'All teams have been marked as completed',
      });
    },
  });

  // Restart game mutation
  const restartGame = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/restart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to restart game');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameState'] });
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
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  const gameState: GameState | undefined = gameStateData?.gameState;

  const getPhaseDisplay = (phase: string) => {
    const phases: Record<string, string> = {
      not_started: 'Not Started',
      level_1: 'Level 1 Active',
      level_2: 'Level 2 Active',
      completed: 'Game Completed',
    };
    return phases[phase] || phase;
  };

  const getPhaseColor = (phase: string) => {
    const colors: Record<string, string> = {
      not_started: 'text-zinc-400',
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
            <p className={`text-2xl font-bold ${gameState ? getPhaseColor(gameState.current_phase) : ''}`}>
              {gameState ? getPhaseDisplay(gameState.current_phase) : 'Unknown'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Total Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-toxic-green">
              {gameState?.total_teams || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Active Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">
              {gameState?.active_teams || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {gameState?.completed_teams || 0}
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
            {gameState?.level_1_unlocked ? (
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
            {gameState?.level_2_unlocked ? (
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
            {gameState?.current_phase === 'not_started' ? (
              <span className="text-zinc-500 font-semibold">⏹ Not Started</span>
            ) : gameState?.current_phase === 'completed' ? (
              <span className="text-blue-500 font-semibold">✓ Completed</span>
            ) : gameState?.is_paused ? (
              <span className="text-yellow-500 font-semibold">⏸ Paused</span>
            ) : (
              <span className="text-green-500 font-semibold">▶ Running</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Control Buttons */}
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="text-toxic-green">Game Controls</CardTitle>
          <CardDescription>
            Use these buttons to control the game flow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Start Game */}
          {gameState?.current_phase === 'not_started' && (
            <div className="flex items-center justify-between p-4 border border-toxic-green/20 rounded-lg">
              <div>
                <h3 className="font-semibold text-toxic-green">Start Game</h3>
                <p className="text-sm text-zinc-400">
                  Begin the event and unlock Level 1 for all qualified teams
                </p>
              </div>
              <Button
                onClick={() => startGame.mutate()}
                disabled={startGame.isPending}
                className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-2" />
                {startGame.isPending ? 'Starting...' : 'Start Game'}
              </Button>
            </div>
          )}

          {/* Unlock Level 2 */}
          {!!gameState?.level_1_unlocked && !gameState?.level_2_unlocked && (
            <div className="flex items-center justify-between p-4 border border-orange-500/20 rounded-lg">
              <div>
                <h3 className="font-semibold text-orange-500">Unlock Level 2</h3>
                <p className="text-sm text-zinc-400">
                  Allow teams to progress to Level 2 puzzles
                </p>
              </div>
              <Button
                onClick={() => unlockLevel2.mutate()}
                disabled={unlockLevel2.isPending}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                <Unlock className="w-4 h-4 mr-2" />
                {unlockLevel2.isPending ? 'Unlocking...' : 'Unlock Level 2'}
              </Button>
            </div>
          )}

          {/* Pause/Resume */}
          {gameState?.current_phase !== 'not_started' && gameState?.current_phase !== 'completed' && (
            <div className="flex items-center justify-between p-4 border border-yellow-500/20 rounded-lg">
              <div>
                <h3 className="font-semibold text-yellow-500">
                  {gameState?.is_paused ? 'Resume Game' : 'Pause Game'}
                </h3>
                <p className="text-sm text-zinc-400">
                  {gameState?.is_paused
                    ? 'Resume the game for all teams'
                    : 'Temporarily pause the game for all teams'}
                </p>
              </div>
              {gameState?.is_paused ? (
                <Button
                  onClick={() => resumeGame.mutate()}
                  disabled={resumeGame.isPending}
                  className="bg-green-500 text-white hover:bg-green-600"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {resumeGame.isPending ? 'Resuming...' : 'Resume'}
                </Button>
              ) : (
                <Button
                  onClick={() => pauseGame.mutate()}
                  disabled={pauseGame.isPending}
                  className="bg-yellow-500 text-black hover:bg-yellow-600"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {pauseGame.isPending ? 'Pausing...' : 'Pause'}
                </Button>
              )}
            </div>
          )}

          {/* End Game */}
          {gameState?.current_phase !== 'not_started' && gameState?.current_phase !== 'completed' && (
            <div className="flex items-center justify-between p-4 border border-red-500/20 rounded-lg">
              <div>
                <h3 className="font-semibold text-red-500">End Game</h3>
                <p className="text-sm text-zinc-400">
                  Mark all active teams as completed and end the event
                </p>
              </div>
              <Button
                onClick={() => endGame.mutate()}
                disabled={endGame.isPending}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                <Square className="w-4 h-4 mr-2" />
                {endGame.isPending ? 'Ending...' : 'End Game'}
              </Button>
            </div>
          )}

          {/* Broadcast Message */}
          <div className="flex items-center justify-between p-4 border border-blue-500/20 rounded-lg">
            <div>
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
          <div className="flex items-center justify-between p-4 border border-purple-500/20 rounded-lg">
            <div>
              <h3 className="font-semibold text-purple-500">Manage Puzzles</h3>
              <p className="text-sm text-zinc-400">
                Create, edit, and manage game puzzles
              </p>
            </div>
            <Link to="/admin/puzzles">
              <Button className="bg-purple-500 text-white hover:bg-purple-600">
                <Puzzle className="w-4 h-4 mr-2" />
                Puzzles
              </Button>
            </Link>
          </div>

          {/* Restart Game */}
          <div className="flex items-center justify-between p-4 border border-orange-500/20 rounded-lg">
            <div>
              <h3 className="font-semibold text-orange-500">Restart Game</h3>
              <p className="text-sm text-zinc-400">
                Reset the game to initial state (all progress will be lost)
              </p>
            </div>
            <Button
              onClick={() => {
                if (confirm('Are you sure you want to restart the game? All team progress will be lost!')) {
                  restartGame.mutate();
                }
              }}
              disabled={restartGame.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {restartGame.isPending ? 'Restarting...' : 'Restart Game'}
            </Button>
          </div>
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
              onClick={() => broadcastMsg.mutate()}
              disabled={broadcastMsg.isPending || !broadcastMessage}
              className="bg-blue-500 text-white hover:bg-blue-600"
            >
              {broadcastMsg.isPending ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

