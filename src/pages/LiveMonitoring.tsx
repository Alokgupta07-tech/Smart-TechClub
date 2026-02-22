import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Lightbulb,
  TrendingUp,
  Users,
  XCircle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GlitchText } from '@/components/GlitchText';
import { BackButton } from '@/components/BackButton';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface TeamStatus {
  id: string;
  team_id?: string;
  team_name: string;
  current_level: number;
  current_puzzle: number;
  puzzle_title?: string;
  progress: number;
  total_hints_used?: number;
  hints_used?: number;
  current_attempts?: number;
  total_attempts?: number;
  status: string;
  time_elapsed?: string;
  elapsed_seconds?: number;
  last_activity?: string;
  completed_puzzles?: number;
}

interface ActivityLog {
  id: string;
  team_name: string;
  activity_type: string;
  description: string;
  timestamp: string;
}

interface SuspiciousActivity {
  team_id: string;
  team_name: string;
  issue_type: string;
  details: string;
  detected_at: string;
}

interface MonitorStats {
  total_teams: number;
  active_teams: number;
  completed_teams: number;
  average_progress: number;
}

export default function LiveMonitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch live team data
  const { data: monitorData, isLoading } = useQuery({
    queryKey: ['liveMonitoring'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/monitor/live`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch live data');
      }
      return response.json();
    },
    refetchInterval: (query) => {
      const msg = query.state.error?.message || '';
      if (msg.includes('Unauthorized') || msg.includes('Session expired')) return false;
      return autoRefresh ? 3000 : false;
    },
    retry: (_, error) => {
      const msg = (error as Error).message || '';
      return !msg.includes('Unauthorized') && !msg.includes('Session expired');
    },
  });

  // Fetch activity logs
  const { data: activityData } = useQuery({
    queryKey: ['activityLogs'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/activity?limit=50`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch activity logs');
      }
      return response.json();
    },
    refetchInterval: (query) => {
      const msg = query.state.error?.message || '';
      if (msg.includes('Unauthorized') || msg.includes('Session expired')) return false;
      return autoRefresh ? 5000 : false;
    },
    retry: (_, error) => {
      const msg = (error as Error).message || '';
      return !msg.includes('Unauthorized') && !msg.includes('Session expired');
    },
  });

  // Fetch suspicious activity
  const { data: suspiciousData } = useQuery({
    queryKey: ['suspiciousActivity'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/suspicious`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch suspicious activity');
      }
      return response.json();
    },
    refetchInterval: (query) => {
      const msg = query.state.error?.message || '';
      if (msg.includes('Unauthorized') || msg.includes('Session expired')) return false;
      return autoRefresh ? 10000 : false;
    },
    retry: (_, error) => {
      const msg = (error as Error).message || '';
      return !msg.includes('Unauthorized') && !msg.includes('Session expired');
    },
  });

  const teams: TeamStatus[] = monitorData?.teams || [];
  const stats: MonitorStats = monitorData?.stats || {
    total_teams: 0,
    active_teams: 0,
    completed_teams: 0,
    average_progress: 0,
  };
  const activities: ActivityLog[] = activityData?.logs || [];
  const suspicious: SuspiciousActivity[] = suspiciousData?.activities || [];

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: { color: string; icon: any } } = {
      active: { color: 'bg-green-500', icon: Activity },
      completed: { color: 'bg-blue-500', icon: CheckCircle },
      paused: { color: 'bg-yellow-500', icon: Clock },
      waiting: { color: 'bg-orange-500', icon: Clock },
      inactive: { color: 'bg-gray-500', icon: XCircle },
    };

    const variant = variants[status] || variants.inactive;
    const Icon = variant.icon;

    return (
      <Badge className={`${variant.color} text-white`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'puzzle_completed':
      case 'puzzle_solve':
      case 'level_complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'wrong_answer':
      case 'puzzle_fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'hint_requested':
      case 'hint_use':
      case 'hint_used':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'login':
      case 'logout':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'tab_switch':
      case 'suspicious_activity':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <Activity className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return 'No activity yet';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'No activity yet';
    
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 0) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleString();
  };

  const formatElapsedTime = (seconds?: number) => {
    if (!seconds) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-toxic-green">Loading monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back Button */}
      <BackButton label="Back to Admin" to="/admin" />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            <GlitchText>Live Monitoring</GlitchText>
          </h1>
          <p className="text-zinc-400 mt-1">Real-time team activity tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-sm text-zinc-400">
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-black/40 border-toxic-green/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-toxic-green">{stats.total_teams}</p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Active Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-500">{stats.active_teams}</p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-500">{stats.completed_teams}</p>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-yellow-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Avg Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-500">{stats.average_progress.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Suspicious Activity Alert */}
      {suspicious.length > 0 && (
        <Card className="bg-red-950/20 border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Suspicious Activity Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suspicious.map((item, index) => (
                <div key={index} className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-red-400">{item.team_name}</div>
                      <div className="text-sm text-zinc-300 mt-1">{item.details}</div>
                    </div>
                    <Badge variant="destructive">{item.issue_type}</Badge>
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">{formatTimestamp(item.detected_at)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Teams Table */}
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Team Status
          </CardTitle>
          <CardDescription>
            Real-time tracking of all team progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-toxic-green/20">
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Puzzle</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Hints</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team, index) => (
                <TableRow key={team.id || team.team_id || index} className="border-toxic-green/10">
                  <TableCell className="font-semibold text-toxic-green">
                    {team.team_name}
                  </TableCell>
                  <TableCell>{getStatusBadge(team.status)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-mono">L{team.current_level}-P{team.current_puzzle}</div>
                      <div className="text-zinc-500 text-xs">{team.puzzle_title || ''}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="w-24">
                      <Progress value={team.progress || 0} className="h-2" />
                      <div className="text-xs text-zinc-400 mt-1">{team.progress || 0}%</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                      {team.total_attempts || team.current_attempts || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-blue-500 border-blue-500/50">
                      {team.hints_used || team.total_hints_used || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {team.status === 'waiting' 
                      ? '--:--:--' 
                      : (team.time_elapsed || formatElapsedTime(team.elapsed_seconds))}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400">
                    {team.last_activity ? formatTimestamp(team.last_activity) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Activity Feed
          </CardTitle>
          <CardDescription>
            Recent team activities (last 50)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {activities.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-black/40 border border-toxic-green/10 rounded-lg hover:border-toxic-green/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {getActivityIcon(log.activity_type)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-toxic-green text-sm">
                        {log.team_name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1">{log.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

