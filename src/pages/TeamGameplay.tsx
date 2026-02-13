import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle,
  Lightbulb,
  Send,
  Clock,
  Award,
  TrendingUp,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Flag,
  Circle,
  CheckCircle2,
  XCircle,
  List,
  Trophy,
  Star,
  Layers,
  Wifi,
  WifiOff,
  BookmarkPlus,
  Save,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  LogOut,
  StopCircle
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

import { WrongAnswerEffect, SuccessEffect } from '@/components/GlitchEffects';
import { BackButton } from '@/components/BackButton';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [showNavigator, setShowNavigator] = useState(true);
  
  // NEW: Enhanced exam features state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isEndQuizDialogOpen, setIsEndQuizDialogOpen] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Level time limit countdown (40 minutes = 2400 seconds)
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const navigate = useNavigate();
  
  // Track currently selected puzzle ID for navigation
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);

  // Load saved answers and session state on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('examSession');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        setMarkedForReview(new Set(session.markedForReview || []));
        setTabSwitchCount(session.tabSwitchCount || 0);
        if (!sessionRestored) {
          toast({
            title: '✓ Session Restored',
            description: 'Your previous session has been restored.',
            className: 'bg-green-500 text-white',
          });
          setSessionRestored(true);
        }
      } catch (e) {
        console.error('Failed to restore session:', e);
      }
    }
  }, []);

  // Save session state periodically
  useEffect(() => {
    const saveSession = () => {
      const session = {
        markedForReview: Array.from(markedForReview),
        tabSwitchCount,
        lastActive: new Date().toISOString(),
      };
      localStorage.setItem('examSession', JSON.stringify(session));
    };
    
    const interval = setInterval(saveSession, 5000);
    return () => clearInterval(interval);
  }, [markedForReview, tabSwitchCount]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: '🟢 Back Online',
        description: 'Your connection has been restored.',
        className: 'bg-green-500 text-white',
      });
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: '🔴 Offline',
        description: 'You are offline. Answers will be saved locally.',
        variant: 'destructive',
      });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Tab switch detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setShowTabWarning(true);
          }
          return newCount;
        });
        
        toast({
          title: '⚠️ Tab Switch Detected',
          description: `Warning ${tabSwitchCount + 1}/3: Please stay on this tab during the exam.`,
          variant: 'destructive',
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tabSwitchCount, toast]);

  // Fetch current puzzle
  const { data: puzzleData, isLoading: puzzleLoading, error: puzzleError } = useQuery({
    queryKey: ['currentPuzzle', selectedPuzzleId],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      // If a specific puzzle is selected, fetch it; otherwise get current
      const url = selectedPuzzleId 
        ? `${API_BASE}/gameplay/puzzle/current?puzzle_id=${selectedPuzzleId}`
        : `${API_BASE}/gameplay/puzzle/current`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch puzzle');
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: 3,
  });

  // Sync remaining time from API response
  useEffect(() => {
    if (puzzleData?.time_remaining_seconds !== undefined) {
      setRemainingTime(puzzleData.time_remaining_seconds);
    }
    // Handle game over from API
    if (puzzleData?.time_expired || puzzleData?.game_completed) {
      if (puzzleData?.time_expired) {
        setTimeExpired(true);
        toast({
          title: '⏰ Time\'s Up!',
          description: 'Your 40-minute session has ended.',
          variant: 'destructive',
        });
      }
    }
  }, [puzzleData, toast]);

  // Countdown timer effect
  useEffect(() => {
    if (remainingTime === null || timeExpired) return;
    
    const interval = setInterval(() => {
      setRemainingTime(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          setTimeExpired(true);
          toast({
            title: '⏰ Time\'s Up!',
            description: 'Your 40-minute session has ended. Redirecting...',
            variant: 'destructive',
          });
          // Redirect after 3 seconds
          setTimeout(() => {
            navigate('/dashboard');
          }, 3000);
          return 0;
        }
        // Warn at 5 minutes remaining
        if (prev === 300) {
          toast({
            title: '⚠️ 5 Minutes Remaining!',
            description: 'Hurry up! Only 5 minutes left.',
            className: 'bg-orange-500 text-white',
          });
        }
        // Warn at 1 minute remaining
        if (prev === 60) {
          toast({
            title: '🚨 1 Minute Remaining!',
            description: 'Final minute! Submit your answers now!',
            variant: 'destructive',
          });
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [remainingTime !== null, timeExpired, navigate, toast]);

  // Helper to format countdown time
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit answer');
      }
      return response.json();
    },
    onSuccess: async (data) => {
      // Handle "awaiting evaluation" response - silently move to next question
      if (data.awaiting_evaluation) {
        setAnswer('');
        setCurrentHint('');
        
        // Invalidate queries in low-priority batch
        startTransition(() => {
          queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
          queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
          queryClient.invalidateQueries({ queryKey: ['allPuzzles'] });
        });
        
        // Navigate to next question - either from backend or find it ourselves
        if (data.next_puzzle && data.next_puzzle.id) {
          goToQuestion.mutate(data.next_puzzle.id);
        } else {
          // Find next question from allQuestions
          const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id);
          if (currentIndex >= 0 && currentIndex < allQuestions.length - 1) {
            goToQuestion.mutate(allQuestions[currentIndex + 1].puzzle_id || allQuestions[currentIndex + 1].id);
          }
        }
        return;
      }
      
      // Handle submissions_closed error (shouldn't reach here but just in case)
      if (data.submissions_closed) {
        toast({
          title: '🔒 Submissions Closed',
          description: data.message,
          variant: 'destructive',
        });
        return;
      }
      
      // Handle answer submission - ALWAYS move to next question (no feedback)
      setAnswer('');
      setCurrentHint('');
      
      // Invalidate queries in low-priority batch
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
        queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
        queryClient.invalidateQueries({ queryKey: ['allPuzzles'] });
      });
      
      if (data.game_completed) {
        toast({
          title: '🎉 Game Completed!',
          description: 'Congratulations! You have completed all puzzles!',
          className: 'bg-toxic-green text-black',
        });
        return;
      }
      
      // ALWAYS navigate to next question after submit
      if (data.next_puzzle && data.next_puzzle.id) {
        goToQuestion.mutate(data.next_puzzle.id);
      } else {
        // Find next question from allQuestions list
        const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id);
        if (currentIndex >= 0 && currentIndex < allQuestions.length - 1) {
          goToQuestion.mutate(allQuestions[currentIndex + 1].puzzle_id || allQuestions[currentIndex + 1].id);
        }
      }
    },
    onError: (error: Error) => {
      // Check if this is a submissions_closed error
      if (error.message.includes('Submissions are closed')) {
        toast({
          title: '🔒 Submissions Closed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to submit answer',
          variant: 'destructive',
        });
      }
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
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
        queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
      });
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

  // Fetch all puzzles for question navigator
  const { data: allPuzzlesData } = useQuery({
    queryKey: ['allPuzzles'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch puzzles');
      return response.json();
    },
    refetchInterval: 10000,
  });

  // Skip question mutation
  const skipQuestion = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/game/time/skip-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          puzzle_id: puzzle?.id,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to skip question');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Silently skip and move to next question - no feedback toast
      setAnswer('');
      setCurrentHint('');
      setIsSkipDialogOpen(false);
      
      // Navigate to next question if available
      if (data.next_puzzle && data.next_puzzle.id) {
        goToQuestion.mutate(data.next_puzzle.id);
      } else {
        // Fallback: refetch and find next question
        startTransition(() => {
          queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
          queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
          queryClient.invalidateQueries({ queryKey: ['allPuzzles'] });
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Cannot Skip',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Navigate to any question mutation
  const goToQuestion = useMutation({
    mutationFn: async (puzzleId: string) => {
      // Store puzzle ID for navigation - this is the key fix
      return { puzzleId };
    },
    onSuccess: (data) => {
      // Silent navigation - update selected puzzle state
      setAnswer('');
      setCurrentHint('');
      setSelectedPuzzleId(data.puzzleId);
      // Also invalidate queries to refresh data
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
        queryClient.invalidateQueries({ queryKey: ['allPuzzles'] });
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

  // Return to skipped question mutation (keep for backward compatibility)
  const returnToQuestion = useMutation({
    mutationFn: async (puzzleId: string) => {
      // Simply navigate to the puzzle
      return { puzzleId };
    },
    onSuccess: (data) => {
      // Navigate to the puzzle
      setAnswer('');
      setCurrentHint('');
      setSelectedPuzzleId(data.puzzleId);
      startTransition(() => {
        queryClient.invalidateQueries({ queryKey: ['teamProgress'] });
        queryClient.invalidateQueries({ queryKey: ['allPuzzles'] });
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

  const puzzle: Puzzle | null = puzzleData?.puzzle || null;

  // Handle puzzle loading error with dedicated UI
  if (puzzleError) {
    const errorMessage = (puzzleError as Error).message || 'Failed to load puzzle';
    return (
      <div className="container mx-auto p-6">
        <BackButton />
        <Card className="bg-black/40 border-red-500/40 mt-6">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Puzzle Loading Error
            </CardTitle>
            <CardDescription className="text-red-400">
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Possible reasons:</strong>
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>The game has not started yet</li>
                <li>Network connectivity issues</li>
                <li>API server is temporarily unavailable</li>
                <li>Your session may have expired</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => startTransition(() => queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] }))}
                className="bg-toxic-green text-black hover:bg-toxic-green/80"
              >
                Retry
              </Button>
              <Button
                onClick={() => navigate('/dashboard')}
                variant="outline"
                className="border-toxic-green/40 text-toxic-green hover:bg-toxic-green/10"
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  const progress: TeamProgress | null = progressData?.progress || null;
  const allQuestions = allPuzzlesData?.puzzles || allPuzzlesData?.session?.questions || [];
  const sessionStats = allPuzzlesData?.session;

  // Get question status counts for exam navigation
  const getQuestionStats = () => {
    const answered = allQuestions.filter((q: any) => q.status === 'completed').length;
    const skipped = allQuestions.filter((q: any) => q.status === 'skipped').length;
    const current = allQuestions.filter((q: any) => q.status === 'active').length;
    const notVisited = allQuestions.filter((q: any) => q.status === 'not_started' || q.status === 'not_visited').length;
    return { answered, skipped, current, notVisited, total: allQuestions.length };
  };

  const questionStats = getQuestionStats();

  // Toggle mark for review
  const toggleMarkForReview = useCallback((puzzleId: string) => {
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (newSet.has(puzzleId)) {
        newSet.delete(puzzleId);
        toast({
          title: 'Unmarked',
          description: 'Question removed from review list.',
        });
      } else {
        newSet.add(puzzleId);
        toast({
          title: '🚩 Marked for Review',
          description: 'You can return to this question later.',
          className: 'bg-purple-500 text-white',
        });
      }
      return newSet;
    });
  }, [toast]);

  // Clear answer
  const clearAnswer = useCallback(() => {
    setAnswer('');
    const currentPuzzleId = puzzleData?.puzzle?.id;
    if (currentPuzzleId) {
      const savedAnswers = JSON.parse(localStorage.getItem('savedAnswers') || '{}');
      delete savedAnswers[currentPuzzleId];
      localStorage.setItem('savedAnswers', JSON.stringify(savedAnswers));
    }
    inputRef.current?.focus();
    toast({
      title: '🗑️ Answer Cleared',
      description: 'Your answer has been cleared.',
    });
  }, [puzzleData?.puzzle?.id, toast]);

  // Auto-save answer as user types
  const saveAnswerToLocal = useCallback(() => {
    const currentPuzzleId = puzzleData?.puzzle?.id;
    if (currentPuzzleId && answer) {
      const savedAnswers = JSON.parse(localStorage.getItem('savedAnswers') || '{}');
      savedAnswers[currentPuzzleId] = {
        answer,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('savedAnswers', JSON.stringify(savedAnswers));
      setLastSaved(new Date());
      setIsSaving(false);
    }
  }, [puzzleData?.puzzle?.id, answer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + S: Save answer
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveAnswerToLocal();
        toast({
          title: '💾 Answer Saved',
          description: 'Your answer has been saved.',
          className: 'bg-blue-500 text-white',
        });
      }
      
      // Ctrl + Enter: Submit answer
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (answer.trim()) {
          submitAnswer.mutate(answer);
        }
      }
      
      // Ctrl + M: Mark for review
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        const currentPuzzleId = puzzleData?.puzzle?.id;
        if (currentPuzzleId) {
          toggleMarkForReview(currentPuzzleId);
        }
      }
      
      // Ctrl + D: Clear answer
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        clearAnswer();
      }
      
      // Ctrl + Shift + F: Final submit (show dialog)
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setIsSubmitDialogOpen(true);
      }
      
      // Ctrl + Left Arrow: Previous question
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzleData?.puzzle?.id);
        if (currentIndex > 0) {
          const prevQuestion = allQuestions[currentIndex - 1];
          goToQuestion.mutate(prevQuestion.puzzle_id || prevQuestion.id);
        }
      }
      
      // Ctrl + Right Arrow: Next question
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzleData?.puzzle?.id);
        if (currentIndex < allQuestions.length - 1) {
          const nextQuestion = allQuestions[currentIndex + 1];
          goToQuestion.mutate(nextQuestion.puzzle_id || nextQuestion.id);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [answer, puzzleData?.puzzle?.id, toggleMarkForReview, clearAnswer, saveAnswerToLocal, submitAnswer, toast, allQuestions, goToQuestion]);

  // Auto-save on answer change with debounce
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    const currentPuzzleId = puzzleData?.puzzle?.id;
    if (answer && currentPuzzleId) {
      setIsSaving(true);
      autoSaveTimerRef.current = setTimeout(() => {
        saveAnswerToLocal();
      }, 2000); // Auto-save after 2 seconds of inactivity
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [answer, puzzleData?.puzzle?.id, saveAnswerToLocal]);

  // Load saved answer when puzzle changes
  useEffect(() => {
    const currentPuzzleId = puzzleData?.puzzle?.id;
    if (currentPuzzleId) {
      const savedAnswers = JSON.parse(localStorage.getItem('savedAnswers') || '{}');
      if (savedAnswers[currentPuzzleId]) {
        setAnswer(savedAnswers[currentPuzzleId].answer);
        toast({
          title: '📝 Answer Restored',
          description: 'Your previously saved answer has been loaded.',
          className: 'bg-blue-500/80 text-white',
        });
      } else {
        setAnswer('');
      }
    }
  }, [puzzleData?.puzzle?.id, toast]);

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

  // Loading skeleton
  if (puzzleLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-black/40 border border-toxic-green/20 rounded-lg p-4">
                <div className="h-4 bg-zinc-700 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-zinc-600 rounded w-3/4"></div>
              </div>
            ))}
          </div>
          {/* Main content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-black/40 border border-toxic-green/20 rounded-lg p-6">
                <div className="h-6 bg-zinc-700 rounded w-1/4 mb-4"></div>
                <div className="h-4 bg-zinc-600 rounded w-full mb-2"></div>
                <div className="h-4 bg-zinc-600 rounded w-3/4 mb-4"></div>
                <div className="h-20 bg-zinc-700 rounded w-full mb-4"></div>
                <div className="h-10 bg-zinc-600 rounded w-full"></div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-black/40 border border-toxic-green/20 rounded-lg p-4">
                <div className="h-4 bg-zinc-700 rounded w-1/2 mb-4"></div>
                <div className="grid grid-cols-5 gap-2">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-10 bg-zinc-600 rounded"></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center text-toxic-green animate-pulse">Loading puzzle...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="container mx-auto p-6">
        <BackButton />
        <Card className="bg-black/40 border-toxic-green/20 mt-6">
          <CardHeader>
            <CardTitle className="text-toxic-green">No Active Puzzle</CardTitle>
            <CardDescription>
              The game has not started yet or you have completed all puzzles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you've just registered or puzzles were recently added, please wait a moment and refresh the page.
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-toxic-green text-black hover:bg-toxic-green/80"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if question is completed (lock input)
  const isQuestionCompleted = allQuestions.find((q: any) => (q.puzzle_id || q.id) === puzzle?.id)?.status === 'completed';
  const isMarkedForReview = markedForReview.has(puzzle?.id || '');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Visual Effects */}
      <WrongAnswerEffect show={showWrongEffect} />
      <SuccessEffect show={showSuccessEffect} />
      
      {/* Tab Warning Dialog */}
      <Dialog open={showTabWarning} onOpenChange={setShowTabWarning}>
        <DialogContent className="bg-black/95 border-red-500">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Warning: Multiple Tab Switches Detected
            </DialogTitle>
            <DialogDescription className="text-zinc-300">
              You have switched tabs {tabSwitchCount} times. This activity is being logged.
              Please stay on this tab during the exam to avoid disqualification.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowTabWarning(false)} className="bg-red-500 hover:bg-red-600">
              I Understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Network Status & Auto-save Indicator */}
      <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
        {/* Network Status */}
        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${
          isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? 'Online' : 'Offline'}
        </div>
        
        {/* Auto-save Status */}
        {isSaving && (
          <div className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 animate-pulse">
            <Save className="w-3 h-3" />
            Saving...
          </div>
        )}
        {lastSaved && !isSaving && (
          <div className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-zinc-500/20 text-zinc-400">
            <Save className="w-3 h-3" />
            Saved
          </div>
        )}
      </div>

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
            <p className="text-2xl font-bold text-toxic-green">
              {allQuestions.length > 0 
                ? Math.round((questionStats.answered / allQuestions.length) * 100) 
                : (progress?.progress || 0)}%
            </p>
            <Progress value={allQuestions.length > 0 
              ? Math.round((questionStats.answered / allQuestions.length) * 100) 
              : (progress?.progress || 0)} className="mt-2" />
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
              {questionStats.answered} / {allQuestions.length || progress?.total_puzzles || 0}
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
              {sessionStats?.total_hints_used || progress?.hints_used || 0}
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-black/40 border-toxic-green/20 ${remainingTime !== null && remainingTime < 300 ? 'border-red-500 animate-pulse' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Time Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${remainingTime !== null && remainingTime < 300 ? 'text-red-500' : remainingTime !== null && remainingTime < 600 ? 'text-orange-500' : 'text-blue-500'}`}>
              {remainingTime !== null 
                ? formatCountdown(remainingTime)
                : '40:00'}
            </p>
            {remainingTime !== null && remainingTime < 300 && (
              <p className="text-xs text-red-400 mt-1 animate-pulse">⚠️ Hurry up!</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Current Puzzle */}
        <div className="lg:col-span-2 space-y-6">
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
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="answer" className="text-toxic-green text-lg">
                  Enter Your Answer
                </Label>
                {/* Mark for Review Button */}
                <Button
                  type="button"
                  onClick={() => toggleMarkForReview(puzzle?.id)}
                  variant="ghost"
                  size="sm"
                  className={`${isMarkedForReview ? 'text-purple-400 bg-purple-500/20' : 'text-zinc-400 hover:text-purple-400'}`}
                >
                  <BookmarkPlus className="w-4 h-4 mr-1" />
                  {isMarkedForReview ? 'Marked for Review' : 'Mark for Review'}
                </Button>
              </div>
              
              <div className="flex gap-2 mt-2">
                <Input
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={isQuestionCompleted ? "Question already completed" : "Type your answer here..."}
                  className="flex-1 bg-black border-toxic-green/30 focus:border-toxic-green text-lg"
                  disabled={submitAnswer.isPending || isQuestionCompleted}
                />
                {/* Clear Answer Button */}
                <Button
                  type="button"
                  onClick={clearAnswer}
                  variant="outline"
                  disabled={!answer.trim() || isQuestionCompleted}
                  className="border-zinc-500/50 text-zinc-400 hover:bg-zinc-500/10"
                  title="Clear answer (Ctrl+D)"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={submitAnswer.isPending || !answer.trim() || isQuestionCompleted}
                  className="bg-green-500 text-white hover:bg-green-600 px-8 font-bold text-lg shadow-lg shadow-green-500/50 border-2 border-green-400"
                >
                  {submitAnswer.isPending ? (
                    'Submitting...'
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Tip: Ctrl+Enter to submit, Ctrl+M to mark for review, Ctrl+D to clear, Ctrl+← / Ctrl+→ to navigate
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Hint Button */}
              {puzzle.available_hints > 0 && (
                <Button
                  type="button"
                  onClick={() => setIsHintDialogOpen(true)}
                  variant="outline"
                  className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                  disabled={isQuestionCompleted}
                >
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Request Hint ({puzzle.available_hints})
                </Button>
              )}

              {/* Skip Question Button */}
              <Button
                type="button"
                onClick={() => setIsSkipDialogOpen(true)}
                variant="outline"
                className={`border-orange-500/50 text-orange-400 hover:bg-orange-500/10 ${puzzle.available_hints <= 0 ? 'col-span-2' : ''}`}
                disabled={skipQuestion.isPending || isQuestionCompleted}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip Question
              </Button>
            </div>

            {/* Previous/Next Navigation Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-toxic-green/20">
              {/* Previous Question Button */}
              <Button
                type="button"
                onClick={() => {
                  const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id);
                  if (currentIndex > 0) {
                    const prevQuestion = allQuestions[currentIndex - 1];
                    goToQuestion.mutate(prevQuestion.puzzle_id || prevQuestion.id);
                  }
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                disabled={goToQuestion.isPending || allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id) <= 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous Question
              </Button>

              {/* Next Question Button */}
              <Button
                type="button"
                onClick={() => {
                  const currentIndex = allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id);
                  if (currentIndex < allQuestions.length - 1) {
                    const nextQuestion = allQuestions[currentIndex + 1];
                    goToQuestion.mutate(nextQuestion.puzzle_id || nextQuestion.id);
                  }
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                disabled={goToQuestion.isPending || allQuestions.findIndex((q: any) => (q.puzzle_id || q.id) === puzzle?.id) >= allQuestions.length - 1}
              >
                Next Question
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
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

      {/* Skip Question Confirmation Dialog */}
      <Dialog open={isSkipDialogOpen} onOpenChange={setIsSkipDialogOpen}>
        <DialogContent className="bg-black border-orange-500">
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <SkipForward className="w-5 h-5" />
              Skip Question?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>Are you sure you want to skip this question?</p>
                <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                  <li>You will move to the next available question</li>
                  <li>You can return to this question later</li>
                  <li className="text-orange-400 font-medium">A time penalty may be applied</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-sm text-zinc-300">
              💡 Tip: You can return to skipped questions from the Question Navigator panel.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSkipDialogOpen(false)}
            >
              Keep Working
            </Button>
            <Button
              onClick={() => skipQuestion.mutate()}
              disabled={skipQuestion.isPending}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {skipQuestion.isPending ? 'Skipping...' : 'Skip & Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>

        {/* Sidebar - Question Navigator & Inventory */}
        <div className="lg:col-span-1 space-y-6">
          {/* Question Navigator Panel */}
          <Card className="bg-black/60 border-toxic-green/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-toxic-green flex items-center gap-2">
                <List className="w-5 h-5" />
                Question Navigator
              </CardTitle>
              <CardDescription className="text-xs">
                Click on any question to navigate to it
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Question Status Legend */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-zinc-400">Answered ({questionStats.answered})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-zinc-400">Skipped ({questionStats.skipped})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-zinc-400">Current ({questionStats.current})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-zinc-400">Review ({markedForReview.size})</span>
                </div>
              </div>

              {/* Question Grid */}
              <div className="grid grid-cols-5 gap-2">
                {allQuestions.map((q: any, index: number) => {
                  const qId = q.puzzle_id || q.id;
                  const isAnswered = q.status === 'completed';
                  const isSkipped = q.status === 'skipped';
                  const isCurrent = qId === puzzle?.id;
                  const isNotStarted = q.status === 'not_started' || q.status === 'not_visited';
                  const isReview = markedForReview.has(qId);
                  // Block navigation to answered questions - users cannot view answers during quiz
                  const canNavigate = !isCurrent && !isAnswered;
                  
                  return (
                    <button
                      key={qId}
                      onClick={() => {
                        if (canNavigate) {
                          goToQuestion.mutate(qId);
                        }
                      }}
                      disabled={!canNavigate || goToQuestion.isPending}
                      className={`
                        w-10 h-10 rounded-lg font-bold text-sm transition-all
                        flex items-center justify-center relative
                        ${isAnswered ? 'bg-green-500/20 text-green-400 border border-green-500/50 cursor-not-allowed opacity-60' : ''}
                        ${isSkipped ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50 hover:bg-orange-500/30 cursor-pointer' : ''}
                        ${isCurrent && !isAnswered && !isSkipped ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500 animate-pulse cursor-default' : ''}
                        ${isNotStarted && !isCurrent ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700/50 hover:text-zinc-300 cursor-pointer' : ''}
                        ${isReview && !isCurrent ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-black' : ''}
                      `}
                      title={`Q${index + 1}: ${q.title} (${q.status})${isReview ? ' [Marked for Review]' : ''}${isAnswered ? ' - Answered (locked)' : canNavigate ? ' - Click to navigate' : ' (current)'}`}
                    >
                      {/* Review marker */}
                      {isReview && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full"></div>
                      )}
                      {isAnswered ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isSkipped ? (
                        <SkipForward className="w-4 h-4" />
                      ) : (
                        index + 1
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Skipped Questions List */}
              {questionStats.skipped > 0 && (
                <div className="mt-4 pt-4 border-t border-toxic-green/20">
                  <p className="text-xs text-orange-400 mb-2 flex items-center gap-1">
                    <Flag className="w-3 h-3" />
                    Skipped Questions (click to return)
                  </p>
                  <div className="space-y-2">
                    {allQuestions
                      .filter((q: any) => q.status === 'skipped')
                      .map((q: any) => (
                        <button
                          key={q.puzzle_id || q.id}
                          onClick={() => goToQuestion.mutate(q.puzzle_id || q.id)}
                          disabled={goToQuestion.isPending}
                          className="w-full text-left p-2 rounded bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-orange-400 truncate">
                              Q{q.puzzle_number || index + 1}: {q.title}
                            </span>
                            <ChevronRight className="w-4 h-4 text-orange-400" />
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Answered Questions Count - Users cannot view answered questions during quiz */}
              {questionStats.answered > 0 && (
                <div className="mt-4 pt-4 border-t border-toxic-green/20">
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {questionStats.answered} question(s) answered
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    You cannot view answered questions during the quiz.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Level Status Card */}
          <Card className="bg-black/60 border-toxic-green/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-toxic-green flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Level Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Current Level Badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Current Level</span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  progress?.current_level === 2 
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                    : 'bg-toxic-green/20 text-toxic-green border border-toxic-green/50'
                }`}>
                  {progress?.current_level === 2 ? '🏆 FINALS' : 'LEVEL ' + (progress?.current_level || 1)}
                </span>
              </div>
              
              {/* Qualification Status */}
              {progress && progress.current_level >= 2 && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-green-400">
                    <Trophy className="w-4 h-4" />
                    <span className="text-sm font-bold">QUALIFIED FOR FINALS</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Congratulations! You've advanced to Level 2.
                  </p>
                </div>
              )}
              
              {/* Progress Stats */}
              <div className="space-y-2 pt-2 border-t border-toxic-green/20">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Solved</span>
                  <span className="text-green-400">{questionStats.answered} puzzles</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Skipped</span>
                  <span className="text-orange-400">{questionStats.skipped} puzzles</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Hints Used</span>
                  <span className="text-yellow-400">{sessionStats?.total_hints_used || progress?.hints_used || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Status</span>
                  <span className={`${
                    progress?.status === 'active' ? 'text-green-400' : 'text-zinc-400'
                  }`}>
                    {progress?.status?.toUpperCase() || 'N/A'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* End Quiz Button */}
          <Card className="bg-black/60 border-red-500/50">
            <CardContent className="p-4">
              <Button
                onClick={() => setIsEndQuizDialogOpen(true)}
                variant="outline"
                className="w-full border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                End Quiz
              </Button>
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Submit your quiz
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* End Quiz Confirmation Dialog - Simple without revealing answers */}
      <Dialog open={isEndQuizDialogOpen} onOpenChange={setIsEndQuizDialogOpen}>
        <DialogContent className="bg-black/95 border-red-500 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <StopCircle className="w-5 h-5" />
              End Quiz?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to end your quiz?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Progress Summary - Only counts, no correct/wrong info */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-900 rounded-lg">
              <div className="text-center">
                <div className="text-xl font-bold text-green-400">{questionStats.answered}</div>
                <div className="text-xs text-zinc-400">Answered</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-400">{questionStats.skipped}</div>
                <div className="text-xs text-zinc-400">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-zinc-500">{questionStats.notVisited}</div>
                <div className="text-xs text-zinc-400">Not Visited</div>
              </div>
            </div>
            
            {/* Warning */}
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
              <div className="flex items-start gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-medium">Warning: You cannot resume after ending.</p>
                  <p className="text-zinc-400 mt-1">Unanswered questions will remain unanswered.</p>
                  <p className="text-zinc-400 mt-1">Results will be shown after you end the quiz.</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEndQuizDialogOpen(false)}
              className="border-zinc-500"
            >
              Continue Quiz
            </Button>
            <Button
              onClick={() => {
                setIsEndQuizDialogOpen(false);
                // Navigate to results page after ending
                window.location.href = '/results';
              }}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut className="w-4 h-4 mr-2" />
              End Quiz Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final Submit Confirmation Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="bg-black/95 border-toxic-green max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-toxic-green flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Exam Summary
            </DialogTitle>
            <DialogDescription>
              Review your progress before finishing
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Progress Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-900 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{questionStats.answered}</div>
                <div className="text-xs text-zinc-400">Answered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{questionStats.skipped}</div>
                <div className="text-xs text-zinc-400">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{markedForReview.size}</div>
                <div className="text-xs text-zinc-400">Marked for Review</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-400">{questionStats.notVisited}</div>
                <div className="text-xs text-zinc-400">Not Visited</div>
              </div>
            </div>
            
            {/* Warning Messages */}
            {(questionStats.skipped > 0 || markedForReview.size > 0 || questionStats.notVisited > 0) && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
                <div className="flex items-start gap-2 text-yellow-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div>
                    {questionStats.skipped > 0 && (
                      <p>You have {questionStats.skipped} skipped question(s).</p>
                    )}
                    {markedForReview.size > 0 && (
                      <p>You have {markedForReview.size} question(s) marked for review.</p>
                    )}
                    {questionStats.notVisited > 0 && (
                      <p>You have {questionStats.notVisited} question(s) not yet visited.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Time Elapsed */}
            <div className="text-center py-2 border-t border-zinc-700">
              <span className="text-zinc-400 text-sm">Time Elapsed: </span>
              <span className="text-toxic-green font-mono text-lg">
                {progress?.time_elapsed_seconds ? formatTime(progress.time_elapsed_seconds) : '00:00:00'}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSubmitDialogOpen(false)}
              className="border-zinc-500"
            >
              Continue Quiz
            </Button>
            <Button
              onClick={() => {
                // Navigate to results or submit endpoint
                toast({
                  title: '✅ Quiz Summary Viewed',
                  description: 'Continue working or check the leaderboard for your current standing.',
                  className: 'bg-toxic-green text-black',
                });
                setIsSubmitDialogOpen(false);
              }}
              className="bg-toxic-green text-black hover:bg-toxic-green/80"
            >
              View Leaderboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Expired Dialog */}
      <Dialog open={timeExpired} onOpenChange={() => {}}>
        <DialogContent className="bg-black/95 border-red-500 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2 text-xl">
              <Clock className="w-6 h-6" />
              ⏰ Time's Up!
            </DialogTitle>
            <DialogDescription className="text-zinc-300">
              Your 40-minute session has ended.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-lg text-zinc-300 mb-4">
                Your game session has been automatically completed.
              </p>
              <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-900 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{questionStats.answered}</div>
                  <div className="text-xs text-zinc-400">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-400">{questionStats.skipped}</div>
                  <div className="text-xs text-zinc-400">Skipped</div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              onClick={() => navigate('/leaderboard')}
              className="w-full bg-green-500 text-white hover:bg-green-600 font-bold text-lg py-6 flex items-center justify-center gap-2"
              style={{ minHeight: '56px' }}
            >
              <Trophy className="w-5 h-5" />
              <span>View Leaderboard</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

