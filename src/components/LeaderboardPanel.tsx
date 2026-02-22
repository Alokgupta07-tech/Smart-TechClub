// src/components/LeaderboardPanel.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, TrendingDown, Minus, Clock, Lightbulb, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api';

interface LeaderboardEntry {
  rank: number;
  id: string;
  teamName: string;
  level: number;
  status: string;
  progress: number;
  puzzlesSolved: number;
  hintsUsed: number;
  totalTimeSeconds: number;
  effectiveTime: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const response = await fetchWithAuth(`${API_BASE}/leaderboard`);
  if (!response.ok) throw new Error('Failed to fetch leaderboard');
  return response.json();
};

const formatTime = (seconds: number): string => {
  if (!seconds) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const LeaderboardPanel = ({ currentTeamId }: { currentTeamId?: string }) => {
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['live-leaderboard'],
    queryFn: fetchLeaderboard,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 2000,
  });

  // Track rank changes
  useEffect(() => {
    if (leaderboard) {
      const newRanks: Record<string, number> = {};
      leaderboard.forEach(entry => {
        newRanks[entry.id] = entry.rank;
      });
      setPreviousRanks(prev => {
        if (Object.keys(prev).length === 0) return newRanks;
        return prev;  // keep original snapshot for trend comparison
      });
      // Note: To make rank trends live-updating, replace the above with:
      // setPreviousRanks(currentRanks); and track currentRanks separately
    }
  }, [leaderboard]);

  const getRankChange = (teamId: string, currentRank: number) => {
    const prevRank = previousRanks[teamId];
    if (!prevRank) return 'same';
    if (currentRank < prevRank) return 'up';
    if (currentRank > prevRank) return 'down';
    return 'same';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Trophy className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Trophy className="w-5 h-5 text-amber-600" />;
    return <span className="text-sm font-mono text-muted-foreground">#{rank}</span>;
  };

  if (isLoading) {
    return (
      <Card className="bg-background/50 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary font-terminal">
            <Trophy className="w-5 h-5" />
            LIVE LEADERBOARD
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-primary/10 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-background/50 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-primary font-terminal text-sm">
            <Trophy className="w-5 h-5" />
            LIVE LEADERBOARD
          </span>
          <span className="text-xs text-muted-foreground font-terminal">
            Auto-refresh: 5s
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {leaderboard?.slice(0, 10).map((entry, index) => {
          const isTop3 = entry.rank <= 3;
          const isCurrentTeam = entry.id === currentTeamId;
          const rankChange = getRankChange(entry.id, entry.rank);

          return (
            <div
              key={entry.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg transition-all",
                isTop3 && "bg-primary/10 border border-primary/30",
                isCurrentTeam && "ring-2 ring-primary",
                !isTop3 && !isCurrentTeam && "bg-background/30 hover:bg-background/50"
              )}
            >
              {/* Rank & Team */}
              <div className="flex items-center gap-3">
                <div className="w-8 flex justify-center">
                  {getRankIcon(entry.rank)}
                </div>
                <div>
                  <div className={cn(
                    "font-terminal text-sm",
                    isTop3 && "text-primary",
                    isCurrentTeam && "font-bold"
                  )}>
                    {entry.teamName}
                    {isCurrentTeam && <span className="ml-2 text-xs text-primary">(YOU)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Level {entry.level} • {entry.progress}%
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4">
                {/* Puzzles Solved */}
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm">
                    <Target className="w-3 h-3 text-success" />
                    <span className="font-mono">{entry.puzzlesSolved}</span>
                  </div>
                </div>

                {/* Hints Used */}
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm text-warning">
                    <Lightbulb className="w-3 h-3" />
                    <span className="font-mono">{entry.hintsUsed}</span>
                  </div>
                </div>

                {/* Time */}
                <div className="text-right min-w-[60px]">
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">{formatTime(entry.effectiveTime)}</span>
                  </div>
                </div>

                {/* Rank Change Indicator */}
                <div className="w-5">
                  {rankChange === 'up' && <TrendingUp className="w-4 h-4 text-success animate-bounce" />}
                  {rankChange === 'down' && <TrendingDown className="w-4 h-4 text-destructive" />}
                  {rankChange === 'same' && <Minus className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </div>
          );
        })}

        {leaderboard && leaderboard.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No teams on leaderboard yet
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LeaderboardPanel;
