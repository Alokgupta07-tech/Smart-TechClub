// src/components/ProgressiveHints.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Lock, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
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

interface Hint {
  id: string;
  hint_number: number;
  hint_text: string;
  time_penalty_seconds: number;
  penalty_multiplier: number;
  unlock_after_seconds: number;
  is_used: boolean;
  isUnlocked: boolean;
  canUnlock: boolean;
  penaltySeconds: number;
}

interface HintsData {
  hints: Hint[];
  nextHintUnlockIn: number | null;
  elapsedSeconds: number;
  lastHintNumber: number;
}

const API_BASE = 'http://localhost:5000/api';

const fetchHints = async (puzzleId: string): Promise<HintsData> => {
  const accessToken = localStorage.getItem('accessToken');
  const response = await fetch(`${API_BASE}/gameplay/puzzle/${puzzleId}/hints`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to fetch hints');
  return response.json();
};

const useHintMutation = async ({ puzzleId, hintId }: { puzzleId: string; hintId: string }) => {
  const accessToken = localStorage.getItem('accessToken');
  const response = await fetch(`${API_BASE}/gameplay/puzzle/${puzzleId}/hint/${hintId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to use hint');
  }
  return response.json();
};

interface ProgressiveHintsProps {
  puzzleId: string;
  onHintUsed?: (hintText: string, penalty: number) => void;
}

export const ProgressiveHints = ({ puzzleId, onHintUsed }: ProgressiveHintsProps) => {
  const queryClient = useQueryClient();
  const [selectedHint, setSelectedHint] = useState<Hint | null>(null);
  const [revealedHints, setRevealedHints] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['hints', puzzleId],
    queryFn: () => fetchHints(puzzleId),
    refetchInterval: 5000, // Check for newly unlocked hints
    enabled: !!puzzleId,
  });

  const useHint = useMutation({
    mutationFn: useHintMutation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hints', puzzleId] });
      setRevealedHints(prev => new Set([...prev, selectedHint!.id]));
      setSelectedHint(null);
      toast.warning(`Hint unlocked! Time penalty: +${Math.floor(result.penaltySeconds / 60)} min`);
      onHintUsed?.(result.hintText, result.penaltySeconds);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setSelectedHint(null);
    }
  });

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card className="bg-background/50 border-warning/20">
        <CardContent className="py-4">
          <div className="animate-pulse flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-warning" />
            <span className="text-sm">Loading hints...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <>
      <Card className="bg-background/50 border-warning/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-warning font-terminal">
              <Lightbulb className="w-4 h-4" />
              HINTS
            </span>
            {data.nextHintUnlockIn !== null && data.nextHintUnlockIn > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Next in: {formatTime(data.nextHintUnlockIn)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.hints.map((hint, index) => {
            const isRevealed = revealedHints.has(hint.id) || hint.is_used;
            const penaltyMinutes = Math.floor(hint.penaltySeconds / 60);

            return (
              <div
                key={hint.id}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  hint.is_used && "border-warning/30 bg-warning/5",
                  hint.canUnlock && !hint.is_used && "border-warning/50 bg-warning/10 cursor-pointer hover:bg-warning/20",
                  !hint.isUnlocked && !hint.is_used && "border-muted/20 bg-muted/5 opacity-50"
                )}
                onClick={() => {
                  if (hint.canUnlock && !hint.is_used) {
                    setSelectedHint(hint);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hint.is_used ? (
                      <Lightbulb className="w-4 h-4 text-warning" />
                    ) : hint.isUnlocked || hint.canUnlock ? (
                      <Lightbulb className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-terminal">
                      Hint {hint.hint_number}
                    </span>
                  </div>

                  {!hint.is_used && (
                    <span className="text-xs text-destructive">
                      -{penaltyMinutes}min penalty
                    </span>
                  )}

                  {hint.canUnlock && !hint.is_used && (
                    <ChevronRight className="w-4 h-4 text-warning" />
                  )}
                </div>

                {/* Revealed hint text */}
                {isRevealed && hint.hint_text && (
                  <div className="mt-2 pt-2 border-t border-warning/20">
                    <p className="text-sm text-warning/90">{hint.hint_text}</p>
                  </div>
                )}

                {/* Locked message */}
                {!hint.isUnlocked && !hint.is_used && index > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Unlock previous hint first
                  </p>
                )}
              </div>
            );
          })}

          {data.hints.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hints available for this puzzle
            </p>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedHint} onOpenChange={() => setSelectedHint(null)}>
        <AlertDialogContent className="border-warning/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Use Hint {selectedHint?.hint_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Using this hint will add a{' '}
              <span className="text-destructive font-bold">
                {selectedHint ? Math.floor(selectedHint.penaltySeconds / 60) : 0} minute
              </span>{' '}
              time penalty to your final score. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => {
                if (selectedHint) {
                  useHint.mutate({ puzzleId, hintId: selectedHint.id });
                }
              }}
              disabled={useHint.isPending}
            >
              {useHint.isPending ? 'Unlocking...' : 'Use Hint'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProgressiveHints;
