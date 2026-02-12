
/**
 * Admin Team Timings Component
 * ============================
 * Shows detailed time tracking data for admin dashboard
 */

import { useState } from "react";
import { 
  Clock, 
  Timer, 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  Users,
  SkipForward,
  AlertCircle,
  CheckCircle,
  Pause,
  Play,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAdminTeamTimings, useQuestionAnalytics, useGameSettings } from "@/hooks/useTimeTracking";

/**
 * Format seconds to HH:MM:SS
 */
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Main Admin Time Tracking Dashboard
 */
export const AdminTimeDashboard = () => {
  return (
    <div className="space-y-6">
      <AdminStatsOverview />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TeamTimingsTable />
        <QuestionAnalyticsPanel />
      </div>
    </div>
  );
};

/**
 * Stats Overview Cards
 */
const AdminStatsOverview = () => {
  const { data: teamsData, isLoading } = useAdminTeamTimings();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-8 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const teams = teamsData?.teams || [];
  const activeTeams = teams.filter((t: any) => t.currentStatus === 'active').length;
  
  // Only count teams that have completed all questions OR have status 'completed'
  const completedTeams = teams.filter((t: any) => 
    t.currentStatus === 'completed' || t.questionsCompleted >= (t.totalQuestions || 10)
  ).length;
  
  // Calculate average time only for teams that have started (totalTime > 0)
  const teamsWithTime = teams.filter((t: any) => t.totalTime > 0 && t.totalTime < 86400); // Max 24 hours
  const avgTotalTime = teamsWithTime.length > 0 
    ? Math.round(teamsWithTime.reduce((acc: number, t: any) => acc + t.totalTime, 0) / teamsWithTime.length)
    : 0;
  
  // Find fastest completed team (must have completed and have valid time)
  const completedTeamsWithTime = teams.filter((t: any) => 
    (t.currentStatus === 'completed' || t.questionsCompleted >= (t.totalQuestions || 10)) &&
    t.totalTime > 0 && t.totalTime < 86400
  );
  const fastestTeam = completedTeamsWithTime.length > 0
    ? completedTeamsWithTime.reduce((fastest: any, t: any) => {
        if (!fastest || t.totalTime < fastest.totalTime) return t;
        return fastest;
      }, null)
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-toxic-green/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-terminal">Active Teams</p>
              <p className="text-2xl font-bold text-toxic-green font-terminal">{activeTeams}</p>
            </div>
            <Play className="w-8 h-8 text-toxic-green" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-500/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-terminal">Completed</p>
              <p className="text-2xl font-bold text-blue-400 font-terminal">{completedTeams}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-blue-400" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-yellow-500/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-terminal">Avg Time</p>
              <p className="text-2xl font-bold text-yellow-400 font-terminal">
                {teamsWithTime.length > 0 ? formatTime(avgTotalTime) : '--:--:--'}
              </p>
            </div>
            <Timer className="w-8 h-8 text-yellow-400" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-500/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-terminal">Fastest</p>
              <p className="text-lg font-bold text-purple-400 font-terminal truncate max-w-24">
                {fastestTeam?.teamName || 'N/A'}
              </p>
              {fastestTeam && (
                <p className="text-xs text-muted-foreground font-terminal">
                  {formatTime(fastestTeam.totalTime)}
                </p>
              )}
            </div>
            <Trophy className="w-8 h-8 text-purple-400" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Team Timings Table
 */
const TeamTimingsTable = () => {
  const { data, isLoading, error, refetch, isRefetching } = useAdminTeamTimings();
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-terminal flex items-center gap-2 text-toxic-green">
          <Users className="w-5 h-5" />
          Team Time Tracking
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isRefetching}
          className="font-terminal"
        >
          <RefreshCw className={cn("w-4 h-4 mr-1", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            Failed to load team data
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {data?.teams?.map((team: any) => (
              <Collapsible 
                key={team.teamId}
                open={expandedTeam === team.teamId}
                onOpenChange={() => setExpandedTeam(
                  expandedTeam === team.teamId ? null : team.teamId
                )}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-terminal font-semibold">{team.teamName}</span>
                        <span className="text-xs text-muted-foreground">
                          Q{team.currentQuestion || 1}/{team.totalQuestions || 10}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className={cn(
                          "font-terminal text-lg",
                          team.currentStatus === 'active' && "text-toxic-green",
                          team.currentStatus === 'paused' && "text-yellow-400",
                          team.currentStatus === 'completed' && "text-blue-400"
                        )}>
                          {formatTime(team.totalTime || 0)}
                        </span>
                        {team.penaltyTime > 0 && (
                          <span className="text-xs text-orange-400 ml-1">
                            (+{formatTime(team.penaltyTime)})
                          </span>
                        )}
                      </div>
                      <StatusBadge status={team.currentStatus} />
                      {expandedTeam === team.teamId ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 bg-background border border-border rounded-lg">
                    <h4 className="font-terminal text-sm text-muted-foreground mb-2">
                      Question Breakdown
                    </h4>
                    {team.questionTimes?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-terminal">Q#</TableHead>
                            <TableHead className="font-terminal">Time</TableHead>
                            <TableHead className="font-terminal">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {team.questionTimes.map((q: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-terminal">{idx + 1}</TableCell>
                              <TableCell className="font-terminal">{formatTime(q.timeSpent || 0)}</TableCell>
                              <TableCell>
                                <StatusBadge status={q.status} small />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground">No question data yet</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-border flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Skips: <span className="text-orange-400 font-semibold">{team.skipsUsed || 0}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Hints: <span className="text-blue-400 font-semibold">{team.hintsUsed || 0}</span>
                      </span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
            {(!data?.teams || data.teams.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No teams participating yet
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Question Analytics Panel
 */
const QuestionAnalyticsPanel = () => {
  const { data, isLoading, error } = useQuestionAnalytics();

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-terminal flex items-center gap-2 text-toxic-green">
          <TrendingUp className="w-5 h-5" />
          Question Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            Failed to load analytics
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {data?.questions?.map((q: any, idx: number) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded flex items-center justify-center font-terminal text-sm",
                    q.difficulty === 'hard' && "bg-red-500/20 text-red-400",
                    q.difficulty === 'medium' && "bg-yellow-500/20 text-yellow-400",
                    q.difficulty === 'easy' && "bg-green-500/20 text-green-400",
                    !q.difficulty && "bg-muted text-muted-foreground"
                  )}>
                    Q{idx + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-terminal text-sm truncate max-w-32">
                      {q.title || `Question ${idx + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {q.completedCount || 0} solved • {q.skippedCount || 0} skipped
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="font-terminal text-sm">
                        {formatTime(q.avgTime || 0)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">avg time</span>
                  </div>
                  <div className="flex items-center" title={(q.avgTime || 0) > (data?.overallAvgTime || 600) ? 'Slower than average' : 'Faster than average'}>
                    {(q.avgTime || 0) > (data?.overallAvgTime || 600) ? (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!data?.questions || data.questions.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No question data available
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Admin Game Settings
 */
const AdminGameSettings = () => {
  const { 
    settings, 
    isLoading, 
    updateSetting, 
    isUpdating 
  } = useGameSettings();
  
  const [localSettings, setLocalSettings] = useState({
    skipEnabled: true,
    maxSkips: 3,
    skipPenaltySeconds: 60,
    timeLimitMinutes: 30
  });

  // Sync local with server settings
  useState(() => {
    if (settings) {
      setLocalSettings({
        skipEnabled: settings.skipEnabled ?? true,
        maxSkips: settings.maxSkips ?? 3,
        skipPenaltySeconds: settings.skipPenaltySeconds ?? 60,
        timeLimitMinutes: settings.timeLimitMinutes ?? 30
      });
    }
  });

  const handleSave = async () => {
    // Save each setting individually
    for (const [key, value] of Object.entries(localSettings)) {
      await updateSetting({ key, value });
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-terminal flex items-center gap-2 text-toxic-green">
          <Clock className="w-5 h-5" />
          Game Time Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Skip Toggle */}
          <div className="flex items-center justify-between space-x-4">
            <Label htmlFor="skip-enabled" className="font-terminal">
              Enable Skipping
            </Label>
            <Switch
              id="skip-enabled"
              checked={localSettings.skipEnabled}
              onCheckedChange={(checked) => 
                setLocalSettings(s => ({ ...s, skipEnabled: checked }))
              }
            />
          </div>

          {/* Max Skips */}
          <div className="space-y-2">
            <Label htmlFor="max-skips" className="font-terminal">
              Max Skips Per Team
            </Label>
            <Input
              id="max-skips"
              type="number"
              min={0}
              max={10}
              value={localSettings.maxSkips}
              onChange={(e) => 
                setLocalSettings(s => ({ ...s, maxSkips: parseInt(e.target.value) || 0 }))
              }
              className="font-terminal"
              disabled={!localSettings.skipEnabled}
            />
          </div>

          {/* Skip Penalty */}
          <div className="space-y-2">
            <Label htmlFor="skip-penalty" className="font-terminal">
              Skip Penalty (seconds)
            </Label>
            <Input
              id="skip-penalty"
              type="number"
              min={0}
              max={600}
              value={localSettings.skipPenaltySeconds}
              onChange={(e) => 
                setLocalSettings(s => ({ ...s, skipPenaltySeconds: parseInt(e.target.value) || 0 }))
              }
              className="font-terminal"
              disabled={!localSettings.skipEnabled}
            />
          </div>

          {/* Time Limit */}
          <div className="space-y-2">
            <Label htmlFor="time-limit" className="font-terminal">
              Question Time Limit (min)
            </Label>
            <Input
              id="time-limit"
              type="number"
              min={0}
              max={120}
              value={localSettings.timeLimitMinutes}
              onChange={(e) => 
                setLocalSettings(s => ({ ...s, timeLimitMinutes: parseInt(e.target.value) || 0 }))
              }
              className="font-terminal"
            />
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <Button 
            onClick={handleSave}
            disabled={isUpdating || isLoading}
            className="font-terminal bg-green-500 text-black hover:bg-green-400 font-bold px-6 py-2 shadow-lg shadow-green-500/50"
          >
            {isUpdating ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Status Badge Component
 */
const StatusBadge = ({ status, small }: { status: string, small?: boolean }) => {
  const config: Record<string, { color: string; icon: any; label: string }> = {
    active: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Play, label: 'Active' },
    paused: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Pause, label: 'Paused' },
    skipped: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: SkipForward, label: 'Skipped' },
    completed: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: CheckCircle, label: 'Done' },
    not_started: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: Clock, label: 'Waiting' }
  };

  const { color, icon: Icon, label } = config[status] || config.not_started;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        color, 
        "font-terminal",
        small && "text-xs px-1.5 py-0"
      )}
    >
      <Icon className={cn("mr-1", small ? "w-3 h-3" : "w-4 h-4")} />
      {label}
    </Badge>
  );
};

export default AdminTimeDashboard;
