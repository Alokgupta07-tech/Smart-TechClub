import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Users, 
  Clock, 
  Trophy, 
  Shield, 
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Ban,
  CheckCircle,
  XCircle,
  Settings,
  BarChart3,
  Zap,
  Bell,
  Search,
  Filter,
  MoreVertical,
  LogOut,
  Timer,
  Download,
  Loader2,
  Stopwatch
} from "lucide-react";
import AdminTimeDashboard from "@/components/AdminTimeDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTeams, useAdminStats, useAlerts, useTeamAction } from "@/hooks/useAdminData";
import { Team, Alert } from "@/types/api";

const Admin = () => {
  // ============================================
  // STATE & DATA FETCHING (NO MOCK DATA)
  // ============================================
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [eventStatus, setEventStatus] = useState<"waiting" | "active" | "paused" | "ended">("active");
  const [globalTimer, setGlobalTimer] = useState(5432);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"teams" | "timeTracking">("teams");

  // Fetch real data from MySQL backend
  const { data: teams, isLoading: teamsLoading, error: teamsError } = useTeams();
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: alerts, isLoading: alertsLoading } = useAlerts();
  const teamAction = useTeamAction();

  // ============================================
  // DERIVED STATE - NO HARDCODED VALUES
  // ============================================
  const filteredTeams = teams?.filter(team => 
    team.teamName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    if (!status) return null;
    
    const styles = {
      completed: "bg-success/20 text-success border-success/30",
      active: "bg-primary/20 text-primary border-primary/30",
      waiting: "bg-muted/20 text-muted-foreground border-muted/30",
      disqualified: "bg-destructive/20 text-destructive border-destructive/30"
    };
    return (
      <span className={cn("px-2 py-1 text-xs font-terminal rounded border", styles[status as keyof typeof styles] || styles.waiting)}>
        {status.toUpperCase()}
      </span>
    );
  };

  const handleEventAction = (action: string) => {
    switch (action) {
      case "start":
        setEventStatus("active");
        toast.success("Event started!");
        break;
      case "pause":
        setEventStatus("paused");
        toast.warning("Event paused");
        break;
      case "resume":
        setEventStatus("active");
        toast.success("Event resumed");
        break;
      case "end":
        setEventStatus("ended");
        toast.info("Event ended");
        break;
    }
  };

  const handleTeamAction = (teamId: string, action: 'pause' | 'resume' | 'disqualify' | 'reset') => {
    teamAction.mutate({ teamId, action });
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Are you sure you want to delete team "${teamName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(`http://localhost:5000/api/admin/teams/${teamId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete team');

      toast.success(`Team "${teamName}" deleted successfully`);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to delete team');
      console.error(error);
    }
  };

  const handleQualifyTeam = async (teamId: string, teamName: string, currentStatus: string) => {
    const newStatus = currentStatus === 'disqualified' ? 'waiting' : 'disqualified';
    const actionText = newStatus === 'disqualified' ? 'disqualify' : 'qualify';

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(`http://localhost:5000/api/admin/teams/${teamId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) throw new Error(`Failed to ${actionText} team`);

      toast.success(`Team "${teamName}" ${actionText === 'disqualify' ? 'disqualified' : 'qualified'} successfully`);
      window.location.reload();
    } catch (error) {
      toast.error(`Failed to ${actionText} team`);
      console.error(error);
    }
  };

  const handleApproveTeam = async (teamId: string, teamName: string) => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(`http://localhost:5000/api/admin/teams/${teamId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'active' })
      });

      if (!response.ok) throw new Error('Failed to approve team');

      toast.success(`Team "${teamName}" approved and activated!`);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to approve team');
      console.error(error);
    }
  };

  const handleActivateAllTeams = async () => {
    const waitingTeams = teams?.filter(t => t.status === 'waiting') || [];
    
    if (waitingTeams.length === 0) {
      toast.info('No teams waiting for approval');
      return;
    }

    if (!confirm(`Are you sure you want to activate all ${waitingTeams.length} waiting teams?`)) {
      return;
    }

    try {
      const accessToken = localStorage.getItem('accessToken');
      let successCount = 0;
      let failCount = 0;

      for (const team of waitingTeams) {
        try {
          const response = await fetch(`http://localhost:5000/api/admin/teams/${team.id}/status`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'active' })
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} teams activated successfully!`);
      }
      if (failCount > 0) {
        toast.error(`Failed to activate ${failCount} teams`);
      }
      
      window.location.reload();
    } catch (error) {
      toast.error('Failed to activate teams');
      console.error(error);
    }
  };

  const handlePauseAllTeams = async () => {
    const activeTeams = teams?.filter(t => t.status === 'active') || [];
    
    if (activeTeams.length === 0) {
      toast.info('No active teams to pause');
      return;
    }

    if (!confirm(`Are you sure you want to pause all ${activeTeams.length} active teams?`)) {
      return;
    }

    try {
      const accessToken = localStorage.getItem('accessToken');
      let successCount = 0;
      let failCount = 0;

      for (const team of activeTeams) {
        try {
          const response = await fetch(`http://localhost:5000/api/admin/teams/${team.id}/status`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'waiting' })
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} teams paused successfully!`);
      }
      if (failCount > 0) {
        toast.error(`Failed to pause ${failCount} teams`);
      }
      
      window.location.reload();
    } catch (error) {
      toast.error('Failed to pause teams');
      console.error(error);
    }
  };

  // ============================================
  // QUICK ACTIONS HANDLERS
  // ============================================
  const handleResetGame = async () => {
    if (!confirm('Are you sure you want to RESET THE ENTIRE GAME? This will clear all team progress, submissions, and activity logs!')) {
      return;
    }

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch('http://localhost:5000/api/game/restart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to reset game');

      toast.success('Game reset successfully! All progress cleared.');
      window.location.reload();
    } catch (error) {
      toast.error('Failed to reset game');
      console.error(error);
    }
  };

  const handleExportResults = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch('http://localhost:5000/api/admin/export/results', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to export results');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lockdown-hq-results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Results exported successfully!');
    } catch (error) {
      toast.error('Failed to export results');
      console.error(error);
    }
  };

  const handleViewReports = () => {
    navigate('/admin/live-monitoring');
  };

  const handleViewSecurity = () => {
    // Navigate to audit logs or security page
    navigate('/admin/live-monitoring');
    toast.info('Security logs available in Live Monitoring');
  };

  const handleViewDetails = async (teamId: string) => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(`http://localhost:5000/api/admin/teams/${teamId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch team details');

      const teamData = await response.json();
      console.log('Team data received:', teamData);
      setSelectedTeam(teamData);
      setIsDetailsOpen(true);
    } catch (error) {
      toast.error('Failed to load team details');
      console.error('Error fetching team details:', error);
    }
  };

  // ============================================
  // LOADING & ERROR STATES
  // ============================================
  if (teamsError) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center">
        <TerminalCard className="max-w-md">
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-display font-bold mb-2">CONNECTION ERROR</h2>
            <p className="text-muted-foreground mb-4">
              Failed to connect to backend API. Please ensure the server is running.
            </p>
            <Button onClick={() => window.location.reload()} variant="terminal">
              Retry Connection
            </Button>
          </div>
        </TerminalCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Admin Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/10 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-3">
                <BiohazardIcon className="w-8 h-8 text-destructive" />
                <div>
                  <span className="font-display text-sm tracking-widest text-destructive">ADMIN</span>
                  <span className="block text-[10px] font-terminal text-muted-foreground">MISSION CONTROL</span>
                </div>
              </Link>
            </div>

            {/* Global Timer */}
            <div className="flex items-center gap-4">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg border",
                eventStatus === "active" 
                  ? "bg-primary/10 border-primary/30" 
                  : eventStatus === "paused"
                    ? "bg-warning/10 border-warning/30"
                    : "bg-muted/10 border-muted/30"
              )}>
                <Timer className={cn(
                  "w-4 h-4",
                  eventStatus === "active" ? "text-primary" : eventStatus === "paused" ? "text-warning" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "font-terminal text-lg",
                  eventStatus === "active" ? "text-primary text-glow-toxic" : "text-muted-foreground"
                )}>
                  {formatTime(globalTimer)}
                </span>
                <span className="text-xs font-terminal text-muted-foreground uppercase">
                  {eventStatus}
                </span>
              </div>

              {/* Event Controls */}
              <div className="flex items-center gap-2">
                {eventStatus === "waiting" && (
                  <Button variant="toxic" size="sm" onClick={() => handleEventAction("start")} className="gap-2">
                    <Play className="w-4 h-4" /> START
                  </Button>
                )}
                {eventStatus === "active" && (
                  <Button variant="terminal" size="sm" onClick={() => handleEventAction("pause")} className="gap-2">
                    <Pause className="w-4 h-4" /> PAUSE
                  </Button>
                )}
                {eventStatus === "paused" && (
                  <Button variant="toxic" size="sm" onClick={() => handleEventAction("resume")} className="gap-2">
                    <Play className="w-4 h-4" /> RESUME
                  </Button>
                )}
                <Button variant="blood" size="sm" onClick={() => handleEventAction("end")} className="gap-2">
                  <XCircle className="w-4 h-4" /> END
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon">
                <Bell className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 text-destructive"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto">
          {/* Quick Navigation */}
          <div className="mb-6 flex gap-3 flex-wrap">
            <Button 
              onClick={() => setActivePanel('teams')} 
              variant={activePanel === 'teams' ? 'default' : 'terminal'}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              Teams Overview
            </Button>
            <Button 
              onClick={() => setActivePanel('timeTracking')} 
              variant={activePanel === 'timeTracking' ? 'default' : 'terminal'}
              className="gap-2"
            >
              <Timer className="w-4 h-4" />
              Time Tracking
            </Button>
            <Button 
              onClick={() => navigate('/admin/puzzles')} 
              variant="terminal" 
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Puzzle Management
            </Button>
            <Button 
              onClick={() => navigate('/admin/game-control')} 
              variant="terminal" 
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Game Control
            </Button>
            <Button 
              onClick={() => navigate('/admin/monitoring')} 
              variant="terminal" 
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Live Monitoring
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {statsLoading ? (
              // Loading skeleton
              Array.from({ length: 6 }).map((_, i) => (
                <TerminalCard key={i} className="text-center animate-pulse">
                  <div className="w-5 h-5 mx-auto mb-2 bg-muted rounded" />
                  <div className="h-6 bg-muted rounded mb-2" />
                  <div className="h-4 bg-muted rounded" />
                </TerminalCard>
              ))
            ) : stats ? (
              // Real data from API
              [
                { label: "TOTAL TEAMS", value: stats.totalTeams, icon: Users, color: "text-primary" },
                { label: "ACTIVE", value: stats.active, icon: Zap, color: "text-success" },
                { label: "COMPLETED", value: stats.completed, icon: Trophy, color: "text-warning" },
                { label: "WAITING", value: stats.waiting, icon: Clock, color: "text-muted-foreground" },
                { label: "AVG TIME", value: stats.avgTime, icon: Timer, color: "text-accent" },
                { label: "HINTS USED", value: stats.hintsUsed, icon: AlertTriangle, color: "text-warning" }
              ].map((stat, i) => (
                <TerminalCard key={i} className="text-center">
                  <stat.icon className={cn("w-5 h-5 mx-auto mb-2", stat.color)} />
                  <div className="text-xl font-display font-bold">{stat.value}</div>
                  <div className="text-xs font-terminal text-muted-foreground">{stat.label}</div>
                </TerminalCard>
              ))
            ) : (
              // Empty state
              <div className="col-span-6 text-center py-8 text-muted-foreground">
                No statistics available
              </div>
            )}
          </div>

          {/* Conditional Panel Rendering */}
          {activePanel === 'timeTracking' ? (
            <AdminTimeDashboard />
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Teams List */}
            <div className="lg:col-span-2">
              <TerminalCard title="LIVE TEAMS MONITOR" status="active" scanLine>
                {/* Search & Filter */}
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search teams..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-background/50 border-primary/20"
                    />
                  </div>
                  <Button 
                    variant="terminal" 
                    className="gap-2 bg-success/20 hover:bg-success/30 text-success border-success/30"
                    onClick={handleActivateAllTeams}
                    title="Activate all waiting teams"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Activate All
                  </Button>
                  <Button 
                    variant="terminal" 
                    className="gap-2 bg-warning/20 hover:bg-warning/30 text-warning border-warning/30"
                    onClick={handlePauseAllTeams}
                    title="Pause all active teams"
                  >
                    <Pause className="w-4 h-4" />
                    Pause All
                  </Button>
                  <Button variant="terminal" size="icon">
                    <Filter className="w-4 h-4" />
                  </Button>
                  <Button variant="terminal" size="icon">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>

                {/* Teams Table */}
                <div className="overflow-x-auto">
                  {teamsLoading ? (
                    // Loading state
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <span className="ml-3 text-muted-foreground font-terminal">Loading teams...</span>
                    </div>
                  ) : filteredTeams.length === 0 ? (
                    // Empty state - NO MOCK DATA
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground font-terminal text-sm">
                        {teams?.length === 0 
                          ? "No teams have registered yet" 
                          : "No teams match your search"}
                      </p>
                    </div>
                  ) : (
                    // Real teams data
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-primary/20">
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TEAM</th>
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">STATUS</th>
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">PROGRESS</th>
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TIME</th>
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">HINTS</th>
                          <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeams.map((team) => (
                          <tr 
                            key={team.id}
                            className={cn(
                              "border-b border-primary/10 transition-colors hover:bg-primary/5",
                              team.status === "disqualified" && "opacity-50"
                            )}
                          >
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <span className="font-display text-sm">{team.teamName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">{getStatusBadge(team.status)}</td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      team.progress === 100 ? "bg-success" : "bg-primary"
                                    )}
                                    style={{ width: `${team.progress}%` }}
                                  />
                                </div>
                                <span className="text-xs font-terminal text-muted-foreground">{team.progress}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className="font-terminal text-sm">{team.timeElapsed || "--:--:--"}</span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={cn(
                                "font-terminal text-sm",
                                team.hintsUsed > 2 ? "text-destructive" : "text-muted-foreground"
                              )}>
                                {team.hintsUsed}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  title="View details"
                                  onClick={() => handleViewDetails(team.id)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {team.status === 'waiting' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-success hover:text-success"
                                    onClick={() => handleApproveTeam(team.id, team.teamName)}
                                    title="Approve team"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className={cn("h-8 w-8", team.status === 'disqualified' ? 'text-success' : 'text-destructive')}
                                  onClick={() => handleQualifyTeam(team.id, team.teamName, team.status)}
                                  title={team.status === 'disqualified' ? 'Qualify team' : 'Disqualify team'}
                                >
                                  {team.status === 'disqualified' ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <Ban className="w-4 h-4" />
                                  )}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => handleViewDetails(team.id)}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      View Details
                                    </DropdownMenuItem>
                                    {team.status === 'waiting' && (
                                      <DropdownMenuItem onClick={() => handleApproveTeam(team.id, team.teamName)}>
                                        <CheckCircle className="w-4 h-4 mr-2 text-success" />
                                        Approve Team
                                      </DropdownMenuItem>
                                    )}
                                    {team.status === 'active' && (
                                      <DropdownMenuItem onClick={() => handleTeamAction(team.id, 'pause')}>
                                        <Pause className="w-4 h-4 mr-2" />
                                        Pause Team
                                      </DropdownMenuItem>
                                    )}
                                    {team.status === 'active' && (
                                      <DropdownMenuItem onClick={() => handleTeamAction(team.id, 'reset')}>
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Reset Progress
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem 
                                      onClick={() => handleQualifyTeam(team.id, team.teamName, team.status)}
                                    >
                                      {team.status === 'disqualified' ? (
                                        <>
                                          <CheckCircle className="w-4 h-4 mr-2 text-success" />
                                          Qualify Team
                                        </>
                                      ) : (
                                        <>
                                          <Ban className="w-4 h-4 mr-2 text-destructive" />
                                          Disqualify Team
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeleteTeam(team.id, team.teamName)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Delete Team
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </TerminalCard>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Alerts */}
              <TerminalCard title="RECENT ALERTS" status="warning">
                {alertsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : alerts && alerts.length > 0 ? (
                  <div className="space-y-3">
                    {alerts.slice(0, 10).map((alert) => (
                      <div 
                        key={alert.id}
                        className={cn(
                          "p-3 rounded-lg border",
                          alert.type === "critical" || alert.type === "violation"
                            ? "bg-destructive/10 border-destructive/30" 
                            : alert.type === "warning" || alert.type === "tab_switch"
                              ? "bg-warning/10 border-warning/30"
                              : "bg-primary/10 border-primary/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-display">{alert.team}</span>
                          <span className="text-xs font-terminal text-muted-foreground">
                            {alert.timeAgo}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{alert.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground font-terminal text-sm">
                    No recent alerts
                  </div>
                )}
              </TerminalCard>

              {/* Quick Actions */}
              <TerminalCard title="QUICK ACTIONS" status="active">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="terminal" size="sm" className="gap-2" onClick={handleResetGame}>
                    <RotateCcw className="w-4 h-4" /> Reset
                  </Button>
                  <Button variant="terminal" size="sm" className="gap-2" onClick={handleViewReports}>
                    <BarChart3 className="w-4 h-4" /> Reports
                  </Button>
                  <Button variant="terminal" size="sm" className="gap-2" onClick={handleViewSecurity}>
                    <Shield className="w-4 h-4" /> Security
                  </Button>
                  <Button variant="terminal" size="sm" className="gap-2" onClick={handleExportResults}>
                    <Download className="w-4 h-4" /> Export
                  </Button>
                </div>
              </TerminalCard>

              {/* Level Control */}
              <TerminalCard title="LEVEL CONTROL" status="active">
                <div className="space-y-3">
                  {["Level 1: Firewall Breach", "Level 2: The Mainframe"].map((level, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background/50">
                      <span className="text-sm font-terminal">{level}</span>
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        i === 0 ? "bg-success" : "bg-warning"
                      )} />
                    </div>
                  ))}
                </div>
              </TerminalCard>
            </div>
          </div>
          )}
        </div>
      </main>

      {/* Team Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display text-primary">
              {selectedTeam?.teamName || 'Team Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedTeam && (
            <div className="space-y-4">
              {/* Team Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">STATUS</label>
                  <div>{getStatusBadge(selectedTeam.status)}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">PROGRESS</label>
                  <div className="text-sm font-terminal">{selectedTeam.progress}%</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">TIME ELAPSED</label>
                  <div className="text-sm font-terminal">{selectedTeam.timeElapsed || '--:--:--'}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">HINTS USED</label>
                  <div className="text-sm font-terminal">{selectedTeam.hintsUsed || 0}</div>
                </div>
              </div>

              {/* Team Members */}
              <div className="space-y-2">
                <label className="text-xs font-terminal text-muted-foreground">TEAM MEMBERS</label>
                <div className="space-y-2">
                  {selectedTeam.members && selectedTeam.members.length > 0 ? (
                    selectedTeam.members.map((member: any, index: number) => (
                      <div key={index} className="p-3 rounded-lg bg-muted/30 border border-primary/10">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-terminal text-sm text-foreground">{member.name}</div>
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          </div>
                          <span className={cn(
                            "text-xs font-terminal px-2 py-1 rounded border",
                            member.role === 'leader' 
                              ? "bg-primary/20 text-primary border-primary/30" 
                              : "bg-muted/20 text-muted-foreground border-muted/30"
                          )}>
                            {member.role?.toUpperCase() || 'MEMBER'}
                          </span>
                        </div>
                        {member.phone && (
                          <div className="text-xs text-muted-foreground mt-1">📞 {member.phone}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground font-terminal">No member details available</div>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">TEAM ID</label>
                  <div className="text-xs font-mono text-muted-foreground">{selectedTeam.id}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-terminal text-muted-foreground">CREATED AT</label>
                  <div className="text-xs font-terminal text-muted-foreground">
                    {selectedTeam.createdAt ? new Date(selectedTeam.createdAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;

