/**
 * LevelEvaluationPanel Component
 * Reusable evaluation control panel for a single level
 * Provides clear separation between Level 1 and Level 2 evaluations
 */

import { startTransition } from 'react';
import { Lock, ClipboardCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface EvaluationStatus {
  level_id: number;
  evaluation_state: 'IN_PROGRESS' | 'SUBMISSIONS_CLOSED' | 'EVALUATING' | 'RESULTS_PUBLISHED' | 'NOT_UNLOCKED';
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

interface LevelEvaluationPanelProps {
  level: 1 | 2;
  evaluationStatus: EvaluationStatus | undefined;
  onCloseSubmissions: () => void;
  onReopenSubmissions: () => void;
  onEvaluateAnswers: () => void;
  onPublishResults: () => void;
  onResetEvaluation: () => void;
  isLoading?: boolean;
  accentColor?: string;
}

export function LevelEvaluationPanel({
  level,
  evaluationStatus,
  onCloseSubmissions,
  onReopenSubmissions,
  onEvaluateAnswers,
  onPublishResults,
  onResetEvaluation,
  isLoading = false,
  accentColor = level === 1 ? 'blue' : 'purple',
}: LevelEvaluationPanelProps) {
  const colorClasses = {
    blue: {
      border: 'border-blue-500/30',
      text: 'text-blue-500',
      bg: 'bg-blue-500',
      hover: 'hover:bg-blue-600',
      bgSoft: 'bg-blue-500/10',
    },
    purple: {
      border: 'border-purple-500/30',
      text: 'text-purple-500',
      bg: 'bg-purple-500',
      hover: 'hover:bg-purple-600',
      bgSoft: 'bg-purple-500/10',
    },
  };

  const colors = colorClasses[accentColor as keyof typeof colorClasses] || colorClasses.blue;

  if (evaluationStatus?.evaluation_state === 'NOT_UNLOCKED') {
    return (
      <Card className={`bg-black/40 ${colors.border}`}>
        <CardHeader>
          <CardTitle className={`${colors.text} flex items-center gap-2`}>
            <Lock className="w-5 h-5" />
            Level {level} Evaluation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-6 border border-zinc-700 rounded-lg bg-zinc-900/50">
            <div className="flex items-center gap-3 mb-2">
              <Lock className="w-6 h-6 text-zinc-500" />
              <h3 className="text-lg font-semibold text-zinc-400">Level {level} Not Unlocked</h3>
            </div>
            <p className="text-zinc-500">
              {level === 2 
                ? 'Complete and publish Level 1 results before accessing Level 2 evaluation.'
                : 'This level is currently locked.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-black/40 ${colors.border}`}>
      <CardHeader>
        <CardTitle className={`${colors.text} flex items-center gap-2`}>
          <ClipboardCheck className="w-5 h-5" />
          Level {level} Evaluation
        </CardTitle>
        <CardDescription>
          Independent evaluation controls for Level {level}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Evaluation Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-lg ${colors.bgSoft} border ${colors.border}`}>
            <p className="text-xs text-zinc-400 mb-1">Current State</p>
            <p className={`text-sm font-bold ${colors.text}`}>
              {evaluationStatus?.evaluation_state?.replace(/_/g, ' ') || 'IN PROGRESS'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Submissions</p>
            <p className="text-sm font-bold text-cyan-500">
              {evaluationStatus?.submissions?.total_submissions || 0}
              <span className="text-xs text-zinc-500 ml-1">
                ({evaluationStatus?.submissions?.pending || 0} pending)
              </span>
            </p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Teams</p>
            <p className="text-sm font-bold text-cyan-500">
              {evaluationStatus?.submissions?.teams_with_submissions || 0}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Qualified</p>
            <p className="text-sm font-bold text-green-500">
              {evaluationStatus?.teams?.qualified || 0}
              <span className="text-xs text-red-400 ml-1">
                / {evaluationStatus?.teams?.disqualified || 0} DQ
              </span>
            </p>
          </div>
        </div>

        {/* Action Buttons - Vertical Stack */}
<div className="space-y-3">
          {/* Step 1: Close/Reopen Submissions */}
          {(evaluationStatus?.actions?.can_close_submissions || evaluationStatus?.actions?.can_reopen_submissions) && (
            <div className="flex items-center justify-between p-3 border border-orange-500/30 rounded-lg bg-orange-500/5">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-orange-500 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  {evaluationStatus?.actions?.can_close_submissions ? 'Close Submissions' : 'Reopen Submissions'}
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {evaluationStatus?.actions?.can_close_submissions 
                    ? 'Lock answer submissions'
                    : 'Allow new submissions (resets evaluation)'}
                </p>
              </div>
              {evaluationStatus?.actions?.can_close_submissions ? (
                <Button
                  size="sm"
                  onClick={onCloseSubmissions}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  Close
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onReopenSubmissions}
                  className="border-green-500 text-green-400 hover:bg-green-500/20"
                >
                  Reopen
                </Button>
              )}
            </div>
          )}

          {/* Step 2: Evaluate Answers */}
          {evaluationStatus?.actions?.can_evaluate && (
            <div className="flex items-center justify-between p-3 border border-yellow-500/30 rounded-lg bg-yellow-500/5">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-yellow-500 flex items-center gap-2">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Evaluate Answers
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Calculate scores and qualification
                </p>
              </div>
              <Button
                size="sm"
                onClick={onEvaluateAnswers}
                className="bg-yellow-500 text-black hover:bg-yellow-600"
              >
                Evaluate
              </Button>
            </div>
          )}

          {/* Step 3: Publish Results */}
          {evaluationStatus?.actions?.can_publish && (
            <div className="flex items-center justify-between p-3 border border-green-500/30 rounded-lg bg-green-500/5">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-green-500 flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5" />
                  Publish Results
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Make results visible to teams
                </p>
              </div>
              <Button
                size="sm"
                onClick={onPublishResults}
                className="bg-green-500 text-white hover:bg-green-600"
              >
                Publish
              </Button>
            </div>
          )}
        </div>

        {/* Timeline */}
        {evaluationStatus && (
          <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-zinc-400">Timeline</h4>
              {(evaluationStatus.evaluation_state === 'EVALUATING' || evaluationStatus.evaluation_state === 'RESULTS_PUBLISHED') && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onResetEvaluation}
                  className="h-6 px-2 text-xs text-red-400 hover:bg-red-500/20"
                >
                  Reset
                </Button>
              )}
            </div>
            <div className="space-y-1 text-xs">
              {evaluationStatus.timestamps?.submissions_closed_at && (
                <p className="text-orange-400">
                  ● Closed: {new Date(evaluationStatus.timestamps.submissions_closed_at).toLocaleString()}
                </p>
              )}
              {evaluationStatus.timestamps?.evaluated_at && (
                <p className="text-yellow-400">
                  ● Evaluated: {new Date(evaluationStatus.timestamps.evaluated_at).toLocaleString()}
                </p>
              )}
              {evaluationStatus.timestamps?.results_published_at && (
                <p className="text-green-400">
                  ● Published: {new Date(evaluationStatus.timestamps.results_published_at).toLocaleString()}
                </p>
              )}
              {!evaluationStatus.timestamps?.submissions_closed_at && (
                <p className="text-zinc-500">● Submissions open</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
