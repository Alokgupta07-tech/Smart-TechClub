import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  Lightbulb,
  Send,
  Clock,
  Award,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { GlitchText } from '@/components/GlitchText';
import { PuzzleTimer } from '@/components/PuzzleTimer';
import { InventoryPanel } from '@/components/InventoryPanel';
import { WrongAnswerEffect, SuccessEffect } from '@/components/GlitchEffects';
import { BackButton } from '@/components/BackButton';

const API_BASE = 'http://localhost:5000/api';

interface Puzzle {
  id: string;
  level: number;
  puzzle_number: number;
  title: string;
  description: string;
  puzzle_type: string;
  puzzle_content: string;
  points: number;
  time_limit_minutes: number;
  progress: {
    attempts: number;
    hints_used: number;
    started_at: string;
  };
  available_hints: number;
  total_hints: number;
}

interface TeamProgress {
  name: string;
  current_level: number;
  current_puzzle: number;
  progress: number;
  hints_used: number;
  status: string;
  completed_puzzles: number;
  total_puzzles: number;
  time_elapsed_seconds: number;
}

export default function TeamGameplay() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState('');
  const [isHintDialogOpen, setIsHintDialogOpen] = useState(false);
  const [currentHint, setCurrentHint] = useState('');
  const [showWrongEffect, setShowWrongEffect] = useState(false);
  const [showSuccessEffect, setShowSuccessEffect] = useState(false);

  // Fetch current puzzle
  const { data: puzzleData, isLoading: puzzleLoading } = useQuery({
    queryKey: ['currentPuzzle'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/gameplay/puzzle/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch puzzle');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch team progress
  const { data: progressData } = useQuery({
    queryKey: ['teamProgress'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/gameplay/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch progress');
      return response.json();
    },
    refetchInterval: 5000,
  });

  // Submit answer mutation
  const submitAnswer = useMutation({
    mutationFn: async (submittedAnswer: string) => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/gameplay/puzzle/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          puzzle_id: puzzle?.id,
          answer: submittedAnswer,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to submit answer');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.is_correct) {
        setShowSuccessEffect(true);
        setTimeout(() => setShowSuccessEffect(false), 2000);
        
        toast({
          title: '✓ Correct!',
          description: data.message,
          className: 'bg-green-500 text-white',
        });
        setAnswer('');
        queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
        queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
        
        if (data.game_completed) {
          toast({
            title: '🎉 Game Completed!',
            description: 'Congratulations! You have completed all puzzles!',
            className: 'bg-toxic-green text-black',
          });
        }
      } else {
        setShowWrongEffect(true);
        setTimeout(() => setShowWrongEffect(false), 500);
        
        toast({
          title: '✗ Incorrect',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit answer',
        variant: 'destructive',
      });
    },
  });

  // Request hint mutation
  const requestHint = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/gameplay/puzzle/hint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          puzzle_id: puzzle?.id,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get hint');
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentHint(data.hint.hint_text);
      const penalty = Math.floor(data.hint.time_penalty_seconds / 60);
      toast({
        title: 'Hint Revealed',
        description: `Time penalty: +${penalty} minutes`,
        className: 'bg-yellow-500 text-black',
      });
      queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
      queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
    },
    onError: (error: any) => {
      toast({
        title: 'No Hints Available',
        description: 'No more hints available for this puzzle',
        variant: 'destructive',
      });
      setIsHintDialogOpen(false);
    },
  });

  const puzzle: Puzzle | null = puzzleData?.puzzle || null;
  const progress: TeamProgress | null = progressData?.progress || null;

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) {
      toast({
        title: 'Empty Answer',
        description: 'Please enter an answer',
        variant: 'destructive',
      });
      return;
    }
    submitAnswer.mutate(answer);
  };

  const handleRequestHint = () => {
    requestHint.mutate();
  };

  if (puzzleLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-toxic-green">Loading puzzle...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="container mx-auto p-6">
        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader>
            <CardTitle className="text-toxic-green">No Active Puzzle</CardTitle>
            <CardDescription>
              The game has not started yet or you have completed all puzzles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Visual Effects */}
      <WrongAnswerEffect show={showWrongEffect} />
      <SuccessEffect show={showSuccessEffect} />

      {/* Back Button */}
      <BackButton label="Back to Dashboard" to="/dashboard" />

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-toxic-green">{progress?.progress || 0}%</p>
            <Progress value={progress?.progress || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {progress?.completed_puzzles || 0} / {progress?.total_puzzles || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Hints Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">
              {progress?.hints_used || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time Elapsed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-500">
              {progress?.time_elapsed_seconds ? formatTime(progress.time_elapsed_seconds) : '00:00:00'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Current Puzzle */}
        <div className="lg:col-span-2 space-y-6">
          {/* Puzzle Timer */}
          {puzzle && (
            <PuzzleTimer 
              timeLimitMinutes={puzzle.time_limit_minutes}
              startedAt={puzzle.progress?.started_at}
              onExpire={() => {
                toast({
                  title: '⏰ Time Limit Exceeded',
                  description: 'The time limit for this puzzle has expired, but you can still continue.',
                  className: 'bg-yellow-500 text-black',
                });
              }}
            />
          )}

          {/* Puzzle Card */}
      <Card className="bg-black/60 border-toxic-green">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-toxic-green font-mono mb-2">
                LEVEL {puzzle.level} - PUZZLE {puzzle.puzzle_number}
              </div>
              <CardTitle className="text-2xl">
                <GlitchText>{puzzle.title}</GlitchText>
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                {puzzle.description}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <div className="flex items-center gap-2 text-yellow-500">
                <Award className="w-5 h-5" />
                <span className="font-bold">{puzzle.points} pts</span>
              </div>
              <div className="flex items-center gap-2 text-blue-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{puzzle.time_limit_minutes} min</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Puzzle Content */}
          <div className="p-6 bg-black border border-toxic-green/30 rounded-lg">
            <div className="text-xs text-toxic-green font-mono mb-2">
              PUZZLE TYPE: {puzzle.puzzle_type.toUpperCase()}
            </div>
            <pre className="text-zinc-100 whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {puzzle.puzzle_content}
            </pre>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <div>Attempts: <span className="text-toxic-green">{puzzle.progress?.attempts || 0}</span></div>
            <div>
              Hints Available: 
              <span className="text-yellow-500 ml-1">
                {puzzle.available_hints} / {puzzle.total_hints}
              </span>
            </div>
          </div>

          {/* Current Hint Display */}
          {currentHint && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-yellow-500 mb-1">Hint:</div>
                  <p className="text-zinc-200">{currentHint}</p>
                </div>
              </div>
            </div>
          )}

          {/* Answer Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="answer" className="text-toxic-green text-lg">
                Enter Your Answer
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="flex-1 bg-black border-toxic-green/30 focus:border-toxic-green text-lg"
                  disabled={submitAnswer.isPending}
                />
                <Button
                  type="submit"
                  disabled={submitAnswer.isPending || !answer.trim()}
                  className="bg-toxic-green text-black hover:bg-toxic-green/90 px-8"
                >
                  {submitAnswer.isPending ? (
                    'Submitting...'
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Hint Button */}
            {puzzle.available_hints > 0 && (
              <Button
                type="button"
                onClick={() => setIsHintDialogOpen(true)}
                variant="outline"
                className="w-full border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
              >
                <Lightbulb className="w-4 h-4 mr-2" />
                Request Hint ({puzzle.available_hints} remaining)
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Hint Confirmation Dialog */}
      <Dialog open={isHintDialogOpen} onOpenChange={setIsHintDialogOpen}>
        <DialogContent className="bg-black border-yellow-500">
          <DialogHeader>
            <DialogTitle className="text-yellow-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Request Hint
            </DialogTitle>
            <DialogDescription>
              Using a hint will add a time penalty to your total score. 
              Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-zinc-300">
              ⚠️ Time penalties apply when using hints. This will affect your final ranking.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsHintDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleRequestHint();
                setIsHintDialogOpen(false);
              }}
              disabled={requestHint.isPending}
              className="bg-yellow-500 text-black hover:bg-yellow-600"
            >
              {requestHint.isPending ? 'Getting Hint...' : 'Get Hint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>

        {/* Sidebar - Inventory */}
        <div className="lg:col-span-1">
          <InventoryPanel />
        </div>
      </div>
    </div>
  );
}

