// src/components/PuzzleAnalyticsPanel.tsx
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Clock, 
  AlertTriangle, 
  Lightbulb, 
  Users, 
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchWithAuth } from '@/lib/api';

interface PuzzleAnalytics {
  puzzleId: string;
  totalAttempts: number;
  successfulAttempts: number;
  avgSolveTimeSeconds: number;
  minSolveTimeSeconds: number;
  maxSolveTimeSeconds: number;
  failureRate: number;
  hintUsageRate: number;
  teamsAttempted: number;
  teamsUsedHints: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const fetchPuzzleStats = async (puzzleId: string): Promise<PuzzleAnalytics> => {
  const response = await fetchWithAuth(`${API_BASE}/admin/puzzle/${puzzleId}/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
};

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

const colorClasses: Record<string, { border: string; bg: string; text: string }> = {
  primary: { border: 'border-primary/20', bg: 'bg-primary/5', text: 'text-primary' },
  success: { border: 'border-success/20', bg: 'bg-success/5', text: 'text-success' },
  destructive: { border: 'border-destructive/20', bg: 'bg-destructive/5', text: 'text-destructive' },
  warning: { border: 'border-warning/20', bg: 'bg-warning/5', text: 'text-warning' },
};

const StatCard = ({ icon, label, value, subValue, trend, color = 'primary' }: StatCardProps) => {
  const cc = colorClasses[color] || colorClasses.primary;
  return (
  <div className={cn(
    "p-3 rounded-lg border",
    cc.border, cc.bg
  )}>
    <div className="flex items-center gap-2 mb-1">
      <span className={cc.text}>{icon}</span>
      <span className="text-xs font-terminal text-muted-foreground uppercase">{label}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <span className={cn("text-xl font-mono font-bold", cc.text)}>
        {value}
      </span>
      {trend && (
        <span className={cn(
          "text-xs",
          trend === 'up' && "text-success",
          trend === 'down' && "text-destructive"
        )}>
          {trend === 'up' && <TrendingUp className="w-3 h-3 inline" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 inline" />}
        </span>
      )}
    </div>
    {subValue && (
      <span className="text-[10px] text-muted-foreground">{subValue}</span>
    )}
  </div>
  );
};

interface PuzzleAnalyticsPanelProps {
  puzzleId: string;
  puzzleTitle?: string;
}

export const PuzzleAnalyticsPanel = ({ puzzleId, puzzleTitle }: PuzzleAnalyticsPanelProps) => {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['puzzle-stats', puzzleId],
    queryFn: () => fetchPuzzleStats(puzzleId),
    refetchInterval: 30000,
    enabled: !!puzzleId,
  });

  if (isLoading) {
    return (
      <Card className="bg-background/50 border-primary/20">
        <CardContent className="py-8">
          <div className="animate-pulse text-center text-muted-foreground">
            Loading analytics...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card className="bg-background/50 border-destructive/20">
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Failed to load analytics
          </div>
        </CardContent>
      </Card>
    );
  }

  const successRate = stats.totalAttempts > 0 
    ? ((stats.successfulAttempts / stats.totalAttempts) * 100).toFixed(1)
    : 0;

  return (
    <Card className="bg-background/50 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-primary font-terminal text-sm">
          <BarChart3 className="w-4 h-4" />
          PUZZLE ANALYTICS
          {puzzleTitle && (
            <span className="text-muted-foreground ml-2">- {puzzleTitle}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="Teams Attempted"
            value={stats.teamsAttempted}
            color="primary"
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="Avg Solve Time"
            value={formatTime(stats.avgSolveTimeSeconds)}
            subValue={`Min: ${formatTime(stats.minSolveTimeSeconds)}`}
            color="success"
          />
          <StatCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Failure Rate"
            value={`${stats.failureRate}%`}
            trend={stats.failureRate > 50 ? 'down' : 'up'}
            color="destructive"
          />
          <StatCard
            icon={<Lightbulb className="w-4 h-4" />}
            label="Hint Usage"
            value={`${stats.hintUsageRate}%`}
            subValue={`${stats.teamsUsedHints} teams`}
            color="warning"
          />
        </div>

        {/* Progress Bars */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="text-success">{successRate}%</span>
            </div>
            <Progress value={Number(successRate)} className="h-2 [&>div]:bg-success" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Difficulty (based on failure rate)</span>
              <span className={cn(
                stats.failureRate > 70 ? "text-destructive" :
                stats.failureRate > 40 ? "text-warning" : "text-success"
              )}>
                {stats.failureRate > 70 ? 'Hard' : stats.failureRate > 40 ? 'Medium' : 'Easy'}
              </span>
            </div>
            <Progress 
              value={stats.failureRate} 
              className={cn(
                "h-2",
                stats.failureRate > 70 && "[&>div]:bg-destructive",
                stats.failureRate > 40 && stats.failureRate <= 70 && "[&>div]:bg-warning",
                stats.failureRate <= 40 && "[&>div]:bg-success"
              )}
            />
          </div>
        </div>

        {/* Attempts Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-muted/20">
          <span className="text-sm text-muted-foreground">Total Attempts</span>
          <div className="flex items-center gap-4 text-sm font-mono">
            <span className="text-success">✓ {stats.successfulAttempts}</span>
            <span className="text-destructive">✗ {stats.totalAttempts - stats.successfulAttempts}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PuzzleAnalyticsPanel;
