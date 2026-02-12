// src/components/TeamTimeline.tsx
import { useQuery } from '@tanstack/react-query';
import { 
  LogIn, 
  LogOut, 
  Play, 
  CheckCircle, 
  XCircle, 
  Lightbulb, 
  Trophy, 
  AlertTriangle,
  ArrowRightLeft,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchWithAuth } from '@/lib/api';

interface TimelineActivity {
  id: string;
  action_type: string;
  description: string;
  puzzle_id: string | null;
  puzzle_title: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const fetchTeamTimeline = async (teamId: string): Promise<TimelineActivity[]> => {
  const response = await fetchWithAuth(`${API_BASE}/admin/team/${teamId}/timeline?limit=100`);
  if (!response.ok) throw new Error('Failed to fetch timeline');
  return response.json();
};

const actionIcons: Record<string, React.ReactNode> = {
  login: <LogIn className="w-4 h-4" />,
  logout: <LogOut className="w-4 h-4" />,
  puzzle_start: <Play className="w-4 h-4" />,
  puzzle_solve: <CheckCircle className="w-4 h-4" />,
  puzzle_fail: <XCircle className="w-4 h-4" />,
  hint_use: <Lightbulb className="w-4 h-4" />,
  level_complete: <Trophy className="w-4 h-4" />,
  tab_switch: <ArrowRightLeft className="w-4 h-4" />,
  suspicious_activity: <AlertTriangle className="w-4 h-4" />,
};

const actionColors: Record<string, string> = {
  login: 'text-success border-success/30',
  logout: 'text-muted-foreground border-muted/30',
  puzzle_start: 'text-primary border-primary/30',
  puzzle_solve: 'text-success border-success/30',
  puzzle_fail: 'text-destructive border-destructive/30',
  hint_use: 'text-warning border-warning/30',
  level_complete: 'text-yellow-400 border-yellow-400/30',
  tab_switch: 'text-warning border-warning/30',
  suspicious_activity: 'text-destructive border-destructive/30',
};

interface TeamTimelineProps {
  teamId: string;
  teamName?: string;
  maxHeight?: string;
}

export const TeamTimeline = ({ teamId, teamName, maxHeight = '400px' }: TeamTimelineProps) => {
  const { data: activities, isLoading, error } = useQuery({
    queryKey: ['team-timeline', teamId],
    queryFn: () => fetchTeamTimeline(teamId),
    refetchInterval: 10000,
    enabled: !!teamId,
  });

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <Card className="bg-background/50 border-primary/20">
        <CardContent className="py-8">
          <div className="animate-pulse text-center text-muted-foreground">
            Loading timeline...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-background/50 border-destructive/20">
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Failed to load timeline
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group by date
  const groupedActivities = activities?.reduce((acc, activity) => {
    const date = formatDate(activity.created_at);
    if (!acc[date]) acc[date] = [];
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, TimelineActivity[]>) || {};

  return (
    <Card className="bg-background/50 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-primary font-terminal text-sm">
          <Clock className="w-4 h-4" />
          ACTIVITY TIMELINE
          {teamName && (
            <span className="text-muted-foreground">- {teamName}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ maxHeight }} className="pr-4">
          {Object.entries(groupedActivities).map(([date, dayActivities]) => (
            <div key={date} className="mb-4">
              <div className="text-xs font-terminal text-muted-foreground mb-2 sticky top-0 bg-background/90 py-1">
                {date}
              </div>
              <div className="space-y-2 relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-primary/20" />

                {dayActivities.map((activity) => {
                  const icon = actionIcons[activity.action_type] || <Clock className="w-4 h-4" />;
                  const colorClass = actionColors[activity.action_type] || 'text-muted-foreground border-muted/30';

                  return (
                    <div key={activity.id} className="flex gap-3 relative">
                      {/* Icon */}
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 bg-background flex items-center justify-center z-10",
                        colorClass
                      )}>
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-xs font-terminal uppercase",
                            colorClass.split(' ')[0]
                          )}>
                            {activity.action_type.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(activity.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {activity.description}
                        </p>
                        {activity.puzzle_title && (
                          <p className="text-xs text-primary/70">
                            📋 {activity.puzzle_title}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {(!activities || activities.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              No activity recorded yet
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TeamTimeline;
