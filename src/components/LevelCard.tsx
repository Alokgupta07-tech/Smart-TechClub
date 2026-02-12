/**
 * ==============================================
 * LEVEL CARD COMPONENT
 * ==============================================
 * Displays level status cards on dashboard
 * Shows locked/unlocked state based on qualification
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 */

import { Lock, Unlock, Play, CheckCircle, Clock, Trophy, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useLevelStatus, type LevelStatus } from '@/hooks/useQualification';
import { useNavigate } from 'react-router-dom';

interface LevelCardProps {
  levelId: number;
  title: string;
  description: string;
  puzzleCount?: number;
  className?: string;
}

export function LevelCard({ 
  levelId, 
  title, 
  description, 
  puzzleCount = 10,
  className 
}: LevelCardProps) {
  const navigate = useNavigate();
  const { data: statusData, isLoading } = useLevelStatus();

  // Find this level's status - levels is a Record<number, LevelStatus>
  const levelStatus = statusData?.levels?.[levelId];
  
  // Determine access - Level 1 always accessible
  // Level 2+ requires previous level qualification
  const canAccess = levelId === 1 || 
    statusData?.levels?.[levelId - 1]?.qualification_status === 'QUALIFIED';

  const isLocked = !canAccess;
  // Support both `status` and `level_status` field names
  const actualStatus = levelStatus?.level_status || levelStatus?.status;
  const isCompleted = actualStatus === 'COMPLETED';
  const isInProgress = actualStatus === 'IN_PROGRESS';
  const isQualified = levelStatus?.qualification_status === 'QUALIFIED';
  const isDisqualified = levelStatus?.qualification_status === 'DISQUALIFIED';

  // Support both field name variations
  const puzzlesCompleted = levelStatus?.puzzles_completed || levelStatus?.questions_correct || 0;
  const progress = puzzlesCompleted 
    ? Math.round((puzzlesCompleted / puzzleCount) * 100)
    : 0;

  const handlePlay = () => {
    if (!isLocked) {
      navigate(`/game?level=${levelId}`);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        isLocked && "opacity-60",
        isCompleted && isQualified && "border-toxic-green/50",
        isCompleted && isDisqualified && "border-red-500/50",
        !isLocked && !isCompleted && "hover:border-toxic-green/30",
        className
      )}
    >
      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-terminal">
              Qualify Level {levelId - 1} to unlock
            </p>
          </div>
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 font-display">
            {isLocked ? (
              <Lock className="w-5 h-5 text-muted-foreground" />
            ) : isCompleted ? (
              <CheckCircle className="w-5 h-5 text-toxic-green" />
            ) : (
              <Unlock className="w-5 h-5 text-toxic-green" />
            )}
            {title}
          </CardTitle>
          
          {/* Status Badge */}
          {isCompleted && (
            <Badge 
              variant={isQualified ? "default" : "destructive"}
              className={cn(
                isQualified && "bg-toxic-green text-black"
              )}
            >
              {isQualified ? (
                <>
                  <Trophy className="w-3 h-3 mr-1" />
                  Qualified
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Not Qualified
                </>
              )}
            </Badge>
          )}
          
          {isInProgress && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-500">
              <Clock className="w-3 h-3 mr-1" />
              In Progress
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        {/* Progress Bar (if started) */}
        {(isInProgress || isCompleted) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-terminal text-toxic-green">
                {puzzlesCompleted}/{puzzleCount}
              </span>
            </div>
            <Progress 
              value={progress} 
              className="h-2"
            />
          </div>
        )}

        {/* Stats Row */}
        {levelStatus && ((levelStatus.total_score || levelStatus.score || 0) > 0 || (levelStatus.total_time_seconds || levelStatus.time_taken_seconds || 0) > 0) && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="font-terminal text-toxic-green">
                {levelStatus.total_score || levelStatus.score || 0}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-terminal text-toxic-green">
                {formatTime(levelStatus.total_time_seconds || levelStatus.time_taken_seconds || 0)}
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={handlePlay}
          disabled={isLocked}
          className={cn(
            "w-full",
            isCompleted 
              ? "bg-muted hover:bg-muted/80" 
              : "bg-toxic-green text-black hover:bg-toxic-green/80"
          )}
        >
          {isLocked ? (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Locked
            </>
          ) : isCompleted ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Completed
            </>
          ) : isInProgress ? (
            <>
              <Play className="w-4 h-4 mr-2" />
              Continue
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Level
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Level Selection Grid
 * Displays all levels with their status
 */
interface LevelSelectionProps {
  levels?: Array<{
    id: number;
    title: string;
    description: string;
    puzzleCount: number;
  }>;
}

export function LevelSelection({ levels }: LevelSelectionProps) {
  const defaultLevels = [
    {
      id: 1,
      title: 'Level 1',
      description: 'Start your journey with fundamental challenges. Complete to unlock the next level.',
      puzzleCount: 10,
    },
    {
      id: 2,
      title: 'Level 2',
      description: 'Advanced challenges await. Requires qualification from Level 1.',
      puzzleCount: 10,
    },
  ];

  const displayLevels = levels || defaultLevels;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {displayLevels.map(level => (
        <LevelCard
          key={level.id}
          levelId={level.id}
          title={level.title}
          description={level.description}
          puzzleCount={level.puzzleCount}
        />
      ))}
    </div>
  );
}

// Utility function
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default LevelCard;
