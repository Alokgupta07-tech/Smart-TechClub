import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  Trophy,
  Clock,
  AlertCircle,
  ArrowLeft,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GlitchText } from '@/components/GlitchText';
import { BackButton } from '@/components/BackButton';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface QuestionResult {
  questionNumber: number;
  title: string;
  level: number;
  points: number;
  attempted: boolean;
  status: 'correct' | 'wrong' | 'not_attempted';
  attempts: number;
  submittedAnswer: string | null;
  isCorrect: boolean;
  timeTaken: number | null;
}

interface GameSummary {
  team: {
    id: string;
    name: string;
    level: number;
    status: string;
    progress: number;
    hintsUsed: number;
  };
  stats: {
    totalQuestions: number;
    attemptedQuestions: number;
    correctAnswers: number;
    wrongAnswers: number;
    notAttempted: number;
    totalTimeSeconds: number;
    qualificationThreshold: number;
    qualified: boolean;
    isFinalLevel?: boolean;
    rank?: number | null;
  };
  questions: QuestionResult[];
}

export default function Results() {
  const navigate = useNavigate();
  
  // Fetch game summary
  const { data: summaryData, isLoading, error } = useQuery({
    queryKey: ['gameSummary'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const response = await fetchWithAuth(`${API_BASE}/game/time/game-summary`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch results');
      }
      
      return response.json();
    },
  });

  const summary: GameSummary | null = summaryData?.summary || null;

  // Format time
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-toxic-green mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Card className="bg-black/80 border-red-500/50 max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Results</h2>
            <p className="text-zinc-400 mb-4">Unable to load your quiz results. Please try again.</p>
            <Button onClick={() => navigate('/dashboard')} className="bg-toxic-green text-black">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-black/80 border-b border-toxic-green/30 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton />
            <GlitchText className="text-2xl font-bold text-toxic-green">
              Quiz Results
            </GlitchText>
          </div>
          <div className="text-zinc-400">
            Team: <span className="text-toxic-green">{summary.team.name}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Status Banner */}
        {summary.stats.isFinalLevel ? (
          <Card className="border-2 border-yellow-500 bg-yellow-500/10">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Trophy className="w-10 h-10 text-yellow-400" />
                <h1 className="text-3xl font-bold text-yellow-400">
                  GAME COMPLETE!
                </h1>
                <Trophy className="w-10 h-10 text-yellow-400" />
              </div>
              <p className="text-zinc-300 text-lg mb-2">
                Congratulations! You scored {summary.stats.correctAnswers} out of {summary.stats.totalQuestions} questions correctly.
              </p>
              {summary.stats.rank && (
                <div className="mt-4 inline-flex items-center gap-2 bg-yellow-500/20 px-6 py-3 rounded-full border border-yellow-500/40">
                  <Award className="w-6 h-6 text-yellow-400" />
                  <span className="text-2xl font-bold text-yellow-400">Rank #{summary.stats.rank}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className={`border-2 ${summary.stats.qualified ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                {summary.stats.qualified ? (
                  <Trophy className="w-10 h-10 text-green-400" />
                ) : (
                  <XCircle className="w-10 h-10 text-red-400" />
                )}
                <h1 className={`text-3xl font-bold ${summary.stats.qualified ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.stats.qualified ? 'QUALIFIED!' : 'NOT QUALIFIED'}
                </h1>
              </div>
              <p className="text-zinc-400">
                You scored {summary.stats.correctAnswers} out of {summary.stats.totalQuestions} questions correctly
                {!summary.stats.qualified && ` (Need ${summary.stats.qualificationThreshold} to qualify)`}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-black/60 border-blue-500/50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-400">{summary.stats.totalQuestions}</div>
              <div className="text-sm text-zinc-400">Total Questions</div>
            </CardContent>
          </Card>
          <Card className="bg-black/60 border-green-500/50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-400">{summary.stats.correctAnswers}</div>
              <div className="text-sm text-zinc-400">Correct</div>
            </CardContent>
          </Card>
          <Card className="bg-black/60 border-red-500/50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-400">{summary.stats.wrongAnswers}</div>
              <div className="text-sm text-zinc-400">Wrong</div>
            </CardContent>
          </Card>
          <Card className="bg-black/60 border-zinc-500/50">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-zinc-400">{summary.stats.notAttempted}</div>
              <div className="text-sm text-zinc-400">Not Attempted</div>
            </CardContent>
          </Card>
        </div>

        {/* Time and Additional Stats */}
        <Card className="bg-black/60 border-toxic-green/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <Clock className="w-6 h-6 text-toxic-green mx-auto mb-1" />
                <div className="text-xl font-mono text-toxic-green">{formatTime(summary.stats.totalTimeSeconds)}</div>
                <div className="text-xs text-zinc-400">Time Taken</div>
              </div>
              <div className="text-center">
                <Award className="w-6 h-6 text-yellow-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-yellow-400">{summary.team.hintsUsed}</div>
                <div className="text-xs text-zinc-400">Hints Used</div>
              </div>
              <div className="text-center">
                <Trophy className="w-6 h-6 text-purple-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-purple-400">Level {summary.team.level}</div>
                <div className="text-xs text-zinc-400">Level</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Question-by-Question Results */}
        <Card className="bg-black/60 border-toxic-green/30">
          <CardHeader>
            <CardTitle className="text-toxic-green flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Detailed Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.questions.map((q, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border ${
                  q.status === 'correct' 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : q.status === 'wrong' 
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-zinc-800/50 border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {q.status === 'correct' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : q.status === 'wrong' ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-zinc-400" />
                    )}
                    <span className="font-medium">
                      Q{q.questionNumber}. {q.title}
                    </span>
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    q.status === 'correct' 
                      ? 'bg-green-500/20 text-green-400' 
                      : q.status === 'wrong' 
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {q.status === 'correct' ? '✓ Correct' : q.status === 'wrong' ? '✗ Wrong' : 'Not Attempted'}
                  </span>
                </div>
                
                {q.attempted && (
                  <div className="pl-7 space-y-1">
                    <div className="text-sm">
                      <span className="text-zinc-500">Your answer: </span>
                      <span className={`font-medium ${q.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {q.submittedAnswer || '-'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 flex gap-4">
                      <span>Attempts: {q.attempts}</span>
                      <span>Points: {q.points}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => navigate('/leaderboard')}
            className="bg-green-500 text-black hover:bg-green-400 font-semibold"
          >
            <Trophy className="w-4 h-4 mr-2" />
            View Leaderboard
          </Button>
          <Button
            onClick={() => navigate('/dashboard')}
            variant="outline"
            className="border-toxic-green/50 text-toxic-green hover:bg-toxic-green/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
