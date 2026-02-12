/**
 * Skipped Questions Panel
 * ========================
 * Shows list of skipped questions that team can return to
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SkipForward,
  Clock,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface SkippedQuestion {
  puzzle_id: string;
  title: string;
  level: number;
  puzzle_number: number;
  status: string;
  time_spent_seconds: number;
  skip_count: number;
  skip_penalty_seconds: number;
}

interface SkippedQuestionsPanelProps {
  onReturnToQuestion?: (puzzleId: string) => void;
  className?: string;
}

export function SkippedQuestionsPanel({
  onReturnToQuestion,
  className,
}: SkippedQuestionsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  
  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  
  // Fetch skipped questions
  const { data, isLoading } = useQuery({
    queryKey: ['skippedQuestions'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/time/skipped-questions`);
      
      if (!response.ok) throw new Error('Failed to fetch skipped questions');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  
  // Return to question mutation
  const returnMutation = useMutation({
    mutationFn: async (puzzleId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/game/time/unskip-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ puzzle_id: puzzleId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to return to question');
      }
      return response.json();
    },
    onSuccess: (data, puzzleId) => {
      toast({
        title: 'Returning to Question',
        description: 'Your timer will resume where you left off.',
      });
      queryClient.invalidateQueries({ queryKey: ['skippedQuestions'] });
      queryClient.invalidateQueries({ queryKey: ['currentPuzzle'] });
      onReturnToQuestion?.(puzzleId);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const skippedQuestions: SkippedQuestion[] = data?.skipped_questions || [];
  const totalSkipped = data?.total_skipped || 0;
  
  if (isLoading || totalSkipped === 0) {
    return null;
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between border-orange-500/30 hover:border-orange-500/50',
            'bg-orange-500/5 hover:bg-orange-500/10'
          )}
        >
          <div className="flex items-center gap-2">
            <SkipForward className="w-4 h-4 text-orange-400" />
            <span className="text-orange-400">
              Skipped Questions ({totalSkipped})
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-orange-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-orange-400" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2">
        <div className="border border-orange-500/20 rounded-lg bg-black/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-orange-400 mb-3">
            <AlertCircle className="w-3 h-3" />
            <span>You can return to these questions at any time</span>
          </div>
          
          {skippedQuestions.map((question) => (
            <div
              key={question.puzzle_id}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-orange-500/10 hover:border-orange-500/30 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    L{question.level}.{question.puzzle_number}
                  </span>
                  <span className="text-sm font-medium text-white">
                    {question.title}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(question.time_spent_seconds)} spent
                  </span>
                  {question.skip_penalty_seconds > 0 && (
                    <span className="text-orange-400">
                      +{formatTime(question.skip_penalty_seconds)} penalty
                    </span>
                  )}
                </div>
              </div>
              
              <Button
                size="sm"
                onClick={() => returnMutation.mutate(question.puzzle_id)}
                disabled={returnMutation.isPending}
                className="bg-orange-600 hover:bg-orange-500"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                Return
              </Button>
            </div>
          ))}
          
          {/* Total penalty info */}
          <div className="mt-3 pt-3 border-t border-orange-500/20 text-center text-xs text-orange-400">
            Total skip penalties:{' '}
            <span className="font-mono font-bold">
              +{formatTime(skippedQuestions.reduce((sum, q) => sum + q.skip_penalty_seconds, 0))}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default SkippedQuestionsPanel;
