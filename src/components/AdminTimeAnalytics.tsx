/**
 * Admin Time Analytics Panel
 * ===========================
 * Comprehensive time tracking dashboard for admins
 * 
 * Features:
 * - Real-time team timing data
 * - Per-question time breakdown
 * - Statistics (avg, fastest, slowest)
 * - Live updates with polling
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Trophy,
  TrendingUp,
  TrendingDown,
  SkipForward,
  AlertTriangle,
  Users,
  CheckCircle,
  Timer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const API_BASE = 'http://localhost:5000/api';

interface TeamTiming {
  id: string;
  team_name: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  effective_time_seconds: number;
  active_time_seconds: number;
  total_skip_penalty_seconds: number;
  total_hint_penalty_seconds: number;
  questions_completed: number;
  questions_skipped: number;
  session_start: string | null;
  session_end: string | null;
  total_puzzles: number;
  question_times: Array<{
    puzzle_id: string;
    title: string;
    level: number;
    puzzle_number: number;
    status: string;
    time_spent_seconds: number;
    skip_count: number;
    skip_penalty_seconds: number;
  }>;
}

interface Statistics {
  total_teams: number;
  active_teams: number;
  completed_teams: number;
  average_solve_time_seconds: number;
  fastest_team: {
    id: string;
    name: string;
    time_seconds: number;
  } | null;
  slowest_team: {
    id: string;
    name: string;
    time_seconds: number;
  } | null;
}

export function AdminTimeAnalytics() {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'time' | 'progress' | 'name'>('progress');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Format time helper
  const formatTime = (seconds: number | null | undefined) => {
    if (!seconds) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  
  // Fetch team timings
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['adminTeamTimings'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/admin/team-timings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch team timings');
      return response.json();
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });
  
  const teams: TeamTiming[] = data?.teams || [];
  const statistics: Statistics = data?.statistics || {
    total_teams: 0,
    active_teams: 0,
    completed_teams: 0,
    average_solve_time_seconds: 0,
    fastest_team: null,
    slowest_team: null,
  };
  
  // Sort teams
  const sortedTeams = [...teams].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'time':
        comparison = (a.effective_time_seconds || 0) - (b.effective_time_seconds || 0);
        break;
      case 'progress':
        comparison = (a.questions_completed || 0) - (b.questions_completed || 0);
        break;
      case 'name':
        comparison = a.team_name.localeCompare(b.team_name);
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  // Toggle team expansion
  const toggleTeam = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };
  
  // Export data
  const exportData = () => {
    const csvContent = [
      ['Team Name', 'Status', 'Questions Completed', 'Questions Skipped', 'Active Time', 'Penalties', 'Effective Time'].join(','),
      ...teams.map(t => [
        t.team_name,
        t.status,
        t.questions_completed,
        t.questions_skipped,
        formatTime(t.active_time_seconds),
        formatTime((t.total_skip_penalty_seconds || 0) + (t.total_hint_penalty_seconds || 0)),
        formatTime(t.effective_time_seconds),
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-timings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };
  
  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      waiting: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    
    return (
      <span className={cn(
        'px-2 py-0.5 text-xs rounded border',
        styles[status] || styles.waiting
      )}>
        {status?.toUpperCase() || 'UNKNOWN'}
      </span>
    );
  };
  
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-800 rounded-lg"></div>
        <div className="h-64 bg-gray-800 rounded-lg"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Teams */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Users className="w-4 h-4" />
            Total Teams
          </div>
          <div className="text-2xl font-bold text-white">
            {statistics.total_teams}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {statistics.active_teams} active • {statistics.completed_teams} completed
          </div>
        </div>
        
        {/* Average Time */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Clock className="w-4 h-4" />
            Avg Solve Time
          </div>
          <div className="text-2xl font-bold font-mono text-toxic-green">
            {formatTime(statistics.average_solve_time_seconds)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Completed teams only
          </div>
        </div>
        
        {/* Fastest Team */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
            <Trophy className="w-4 h-4" />
            Fastest Team
          </div>
          {statistics.fastest_team ? (
            <>
              <div className="text-lg font-bold text-green-400 truncate">
                {statistics.fastest_team.name}
              </div>
              <div className="text-xl font-mono text-white">
                {formatTime(statistics.fastest_team.time_seconds)}
              </div>
            </>
          ) : (
            <div className="text-gray-500">No data yet</div>
          )}
        </div>
        
        {/* Slowest Team */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
            <TrendingDown className="w-4 h-4" />
            Slowest Team
          </div>
          {statistics.slowest_team ? (
            <>
              <div className="text-lg font-bold text-red-400 truncate">
                {statistics.slowest_team.name}
              </div>
              <div className="text-xl font-mono text-white">
                {formatTime(statistics.slowest_team.time_seconds)}
              </div>
            </>
          ) : (
            <div className="text-gray-500">No data yet</div>
          )}
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy('progress')}
            className={sortBy === 'progress' ? 'border-toxic-green text-toxic-green' : ''}
          >
            Progress
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortBy('time')}
            className={sortBy === 'time' ? 'border-toxic-green text-toxic-green' : ''}
          >
            Time
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'desc' ? '↓' : '↑'}
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      
      {/* Teams Table */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-900/50">
              <TableHead className="w-10"></TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Progress</TableHead>
              <TableHead className="text-center">Skipped</TableHead>
              <TableHead className="text-right">Active Time</TableHead>
              <TableHead className="text-right">Penalties</TableHead>
              <TableHead className="text-right">Effective Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTeams.map((team, index) => (
              <Collapsible key={team.id} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow
                      className="cursor-pointer hover:bg-gray-800/50"
                      onClick={() => toggleTeam(team.id)}
                    >
                      <TableCell>
                        {expandedTeams.has(team.id) ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">#{index + 1}</span>
                          <span className="font-medium">{team.team_name}</span>
                          {index === 0 && team.status === 'completed' && (
                            <Trophy className="w-4 h-4 text-yellow-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(team.status)}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono">
                          {team.questions_completed || 0}/{team.total_puzzles || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {team.questions_skipped > 0 ? (
                          <span className="text-orange-400 flex items-center justify-center gap-1">
                            <SkipForward className="w-3 h-3" />
                            {team.questions_skipped}
                          </span>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-toxic-green">
                        {formatTime(team.active_time_seconds)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(team.total_skip_penalty_seconds || 0) + (team.total_hint_penalty_seconds || 0) > 0 ? (
                          <span className="text-orange-400 font-mono">
                            +{formatTime((team.total_skip_penalty_seconds || 0) + (team.total_hint_penalty_seconds || 0))}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatTime(team.effective_time_seconds)}
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent asChild>
                    <TableRow className="bg-gray-900/30">
                      <TableCell colSpan={8} className="p-0">
                        {expandedTeams.has(team.id) && team.question_times && team.question_times.length > 0 && (
                          <div className="p-4 border-t border-gray-700">
                            <div className="text-xs text-gray-400 mb-2">Per-Question Breakdown</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                              {team.question_times.map((qt) => (
                                <div
                                  key={qt.puzzle_id}
                                  className={cn(
                                    'p-2 rounded border text-xs',
                                    qt.status === 'completed' && 'bg-green-500/10 border-green-500/30',
                                    qt.status === 'active' && 'bg-blue-500/10 border-blue-500/30 animate-pulse',
                                    qt.status === 'skipped' && 'bg-orange-500/10 border-orange-500/30',
                                    qt.status === 'paused' && 'bg-yellow-500/10 border-yellow-500/30',
                                    qt.status === 'not_started' && 'bg-gray-700/30 border-gray-600',
                                  )}
                                >
                                  <div className="font-medium truncate">{qt.title}</div>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-gray-400">L{qt.level}.{qt.puzzle_number}</span>
                                    <span className="font-mono">
                                      {formatTime(qt.time_spent_seconds)}
                                    </span>
                                  </div>
                                  {qt.skip_count > 0 && (
                                    <div className="text-orange-400 mt-1">
                                      +{formatTime(qt.skip_penalty_seconds)} penalty
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
        
        {teams.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No team timing data available yet
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminTimeAnalytics;
