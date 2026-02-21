import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

import {
  Users,
  Clock,
  Trophy,
  Zap,
  AlertTriangle,
  Terminal,
  Lock,
  CheckCircle,
  LogOut,
  MessageSquare,
  Loader2,
  ArrowRight,
  Star,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as authAPI from "@/lib/authApi";
import { BackButton } from "@/components/BackButton";
import { QualificationMessageModal } from "@/components/QualificationMessageModal";
// Celebration Modal - Shows winner/runner-up celebration when results are published
import { CelebrationModal } from "@/components/CelebrationModal";
import { useCelebration } from "@/hooks/useCelebration";

interface TeamData {
  id: string;
  teamName: string;
  level: number;
  status: 'waiting' | 'active' | 'completed' | 'disqualified';
  progress: number;
  startTime: string | null;
  endTime: string | null;
  hintsUsed: number;
  timeElapsed: string;
  createdAt: string;
  // Qualification status
  qualifiedForLevel2?: boolean;
  level1Completed?: boolean;
  level2Unlocked?: boolean;
  canStartLevel2?: boolean;
  gameState?: {
    level1Unlocked: boolean;
    level2Unlocked: boolean;
    level1StartTime: string | null;
    level2StartTime: string | null;
  };
}

const puzzles = [
  { id: 1, title: "DECRYPT THE MESSAGE", status: "current", points: 100 },
  { id: 2, title: "BINARY SEQUENCE", status: "locked", points: 150 }
];

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Celebration modal hook - shows winner/runner-up celebration when results are published
  // Pass the current team ID to check if they're in the top 3
  const celebration = useCelebration(team?.id || null);

  // Fetch team data - optimized polling interval for 200+ users
  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const teamData = await authAPI.getMyTeam();
        setTeam(teamData);
      } catch (error) {
        console.error('Failed to fetch team:', error);
        toast.error('Failed to load team data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamData();
    const interval = setInterval(fetchTeamData, 30000); // Optimized: 30s instead of 10s
    return () => clearInterval(interval);
  }, []);

  // Clear stale game data from localStorage when team is in 'waiting' state
  // This handles the case where admin resets the game - all old answers/session data must go
  useEffect(() => {
    if (team?.status === 'waiting') {
      localStorage.removeItem('examSession');
      localStorage.removeItem('savedAnswers');
    }
  }, [team?.status]);

  // Fetch broadcast messages - optimized interval for 200+ users
  useEffect(() => {
    const fetchBroadcasts = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE}/game/broadcast`);
        if (response.ok) {
          const data = await response.json();
          setBroadcasts(data.messages || []);
        }
      } catch (error) {
        console.error('Failed to fetch broadcasts:', error);
      }
    };

    fetchBroadcasts();
    const interval = setInterval(fetchBroadcasts, 30000); // Optimized: 30s instead of 5s
    return () => clearInterval(interval);
  }, []);

  const handleRequestHint = () => {
    toast.info("Hint system", {
      description: "Contact admin for hints during the event."
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-terminal">Loading team data...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center">
        <TerminalCard title="ERROR" status="danger">
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">Failed to load team data</p>
            <Button onClick={() => window.location.reload()} variant="terminal" className="mt-4">
              Retry
            </Button>
          </div>
        </TerminalCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/10 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton label="" to="/" className="p-1" />
              <BiohazardIcon className="w-8 h-8 text-primary" />
              <div>
                <span className="font-display text-sm tracking-widest">LOCKDOWN</span>
                <span className="block text-[10px] font-terminal text-primary">{team.teamName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/leaderboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Trophy className="w-4 h-4" />
                  <span className="hidden sm:inline">Leaderboard</span>
                </Button>
              </Link>
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
                <span className="hidden sm:inline">Exit</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto">
          {/* Waiting Room */}
          {team.status === "waiting" && (
            <div className="max-w-2xl mx-auto text-center animate-fade-in">
              <BiohazardIcon className="w-24 h-24 text-primary mx-auto mb-8 animate-pulse-glow" />

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-warning/30 bg-warning/10 mb-6">
                <Clock className="w-4 h-4 text-warning" />
                <span className="text-xs font-terminal uppercase tracking-widest text-warning">
                  AWAITING EVENT START
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                WELCOME, <span className="text-primary text-glow-toxic">{team.teamName}</span>
              </h1>

              <p className="text-muted-foreground font-terminal mb-8">
                Your team is registered and ready. Wait for the admin to start the event.
              </p>

              {/* Team Status */}
              <TerminalCard title="TEAM STATUS" status="active" className="mb-8 text-left">
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Team: {team.teamName}</p>
                  <p className="text-xs text-muted-foreground font-terminal mt-2">Registered {new Date(team.createdAt).toLocaleString()}</p>
                </div>
              </TerminalCard>

              {/* Broadcast Messages */}
              {broadcasts.length > 0 && (
                <TerminalCard title="ANNOUNCEMENTS" status="warning" className="mb-8 text-left">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {broadcasts.slice(0, 5).map((msg: any, i: number) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-lg border",
                          msg.message_type === "alert" && "bg-red-500/10 border-red-500/30",
                          msg.message_type === "warning" && "bg-yellow-500/10 border-yellow-500/30",
                          msg.message_type === "success" && "bg-green-500/10 border-green-500/30",
                          msg.message_type === "info" && "bg-blue-500/10 border-blue-500/30"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={cn(
                            "w-4 h-4 mt-0.5",
                            msg.message_type === "alert" && "text-red-500",
                            msg.message_type === "warning" && "text-yellow-500",
                            msg.message_type === "success" && "text-green-500",
                            msg.message_type === "info" && "text-blue-500"
                          )} />
                          <div className="flex-1">
                            <p className="text-sm">{msg.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TerminalCard>
              )}

              <div className="text-muted-foreground font-terminal">
                <p>Wait for admin to start the event...</p>
              </div>
            </div>
          )}

          {/* Active Event */}
          {team.status === "active" && (
            <div className="space-y-6 animate-fade-in">
              {/* Quick Action Button */}
              <div className="flex justify-center">
                <Button
                  onClick={() => navigate('/gameplay')}
                  variant="toxic"
                  size="lg"
                  className="gap-2 text-lg"
                >
                  <Terminal className="w-5 h-5" />
                  Start Solving Puzzles
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Level Header */}
                  <TerminalCard title="CURRENT LEVEL" status="warning" scanLine>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-display font-bold text-primary mb-1">
                          {team.level === 1 ? 'LEVEL 1: QUALIFICATION ROUND' : 'LEVEL 2: FINALS'}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {team.level === 1
                            ? 'Break through the initial security layer'
                            : 'The final challenge awaits - Good luck!'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground font-terminal">PROGRESS</p>
                        <p className="text-2xl font-display font-bold text-warning">{team.progress}%</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="infected-progress">
                        <div className="infected-progress-bar" style={{ width: `${team.progress}%` }} />
                      </div>
                    </div>

                    {/* Qualification Badge */}
                    {team.qualifiedForLevel2 && team.level === 2 && (
                      <div className="mt-4 flex items-center gap-2 text-green-400">
                        <Star className="w-4 h-4" />
                        <span className="text-sm font-terminal">QUALIFIED FINALIST</span>
                      </div>
                    )}
                  </TerminalCard>

                  {/* Puzzle Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {puzzles.map((puzzle, i) => (
                      <TerminalCard
                        key={puzzle.id}
                        status={puzzle.status === "current" ? "active" : "offline"}
                        className={cn(
                          "transition-all",
                          puzzle.status === "current" && "ring-1 ring-primary/50",
                          puzzle.status === "locked" && "opacity-50"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "p-3 rounded-lg",
                            puzzle.status === "current"
                              ? "bg-primary/20 border border-primary/30"
                              : "bg-muted/20"
                          )}>
                            {puzzle.status === "locked" ? (
                              <Lock className="w-6 h-6 text-muted-foreground" />
                            ) : puzzle.status === "completed" ? (
                              <CheckCircle className="w-6 h-6 text-success" />
                            ) : (
                              <Terminal className="w-6 h-6 text-primary" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-terminal text-muted-foreground">
                                PUZZLE {String(puzzle.id).padStart(2, "0")}
                              </span>
                              <span className="text-xs font-terminal text-warning">
                                {puzzle.points} PTS
                              </span>
                            </div>
                            <h3 className="font-display text-sm">{puzzle.title}</h3>
                            {puzzle.status === "current" && (
                              <Button
                                variant="toxic"
                                size="sm"
                                className="mt-3 w-full"
                                onClick={() => navigate('/gameplay')}
                              >
                                ENTER PUZZLE
                              </Button>
                            )}
                          </div>
                        </div>
                      </TerminalCard>
                    ))}
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Team */}
                  <TerminalCard title="TEAM INFO" status="active">
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Team:</span>
                        <span className="ml-2 text-primary">{team.teamName}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Level:</span>
                        <span className="ml-2">{team.level}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Hints Used:</span>
                        <span className="ml-2">{team.hintsUsed}/3</span>
                      </div>
                      {/* Qualification Status */}
                      {team.qualifiedForLevel2 && (
                        <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                          <div className="flex items-center gap-2 text-green-400">
                            <Trophy className="w-4 h-4" />
                            <span className="text-sm font-terminal">QUALIFIED FOR LEVEL 2</span>
                          </div>
                        </div>
                      )}
                      {team.level1Completed && !team.qualifiedForLevel2 && (
                        <div className="mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <div className="flex items-center gap-2 text-yellow-400">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm font-terminal">LEVEL 1 COMPLETED</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Awaiting qualification results...
                          </p>
                        </div>
                      )}
                    </div>
                  </TerminalCard>

                  {/* Level 2 Transition Card */}
                  {team.canStartLevel2 && team.level === 1 && (
                    <TerminalCard title="LEVEL 2 UNLOCKED" status="warning" className="animate-pulse-glow">
                      <div className="text-center py-4">
                        <div className="flex justify-center mb-3">
                          <div className="relative">
                            <Sparkles className="w-12 h-12 text-yellow-400" />
                            <div className="absolute -inset-2 bg-yellow-500/20 rounded-full animate-ping" />
                          </div>
                        </div>
                        <h3 className="text-lg font-display text-yellow-400 mb-2">
                          FINALS AWAITS
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You've qualified for Level 2! The finals are now unlocked.
                        </p>
                        <Button
                          variant="toxic"
                          className="w-full gap-2"
                          onClick={() => navigate('/gameplay')}
                        >
                          <ArrowRight className="w-4 h-4" />
                          START LEVEL 2
                        </Button>
                      </div>
                    </TerminalCard>
                  )}

                  {/* Rules Reminder */}
                  <TerminalCard title="REMINDER" status="danger">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        <p className="mb-2">No external help allowed.</p>
                        <p>Tab switching is monitored.</p>
                      </div>
                    </div>
                  </TerminalCard>

                  {/* Team Chat Placeholder */}
                  <TerminalCard title="TEAM COMMS" status="active">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Team chat coming soon</p>
                    </div>
                  </TerminalCard>
                </div>
              </div>
            </div>
          )}

          {/* Completed State */}
          {team.status === "completed" && (
            <div className="max-w-2xl mx-auto text-center animate-fade-in">
              <div className="relative">
                <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-8" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-yellow-400/20 animate-ping" />
                </div>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-green-500/30 bg-green-500/10 mb-6">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs font-terminal uppercase tracking-widest text-green-400">
                  GAME COMPLETED
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                CONGRATULATIONS, <span className="text-primary text-glow-toxic">{team.teamName}!</span>
              </h1>

              <p className="text-muted-foreground font-terminal mb-8">
                You have successfully completed the Lockdown challenge!
              </p>

              <TerminalCard title="FINAL STATS" status="active" className="mb-8 text-left">
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground font-terminal">LEVEL</p>
                    <p className="text-2xl font-display text-primary">{team.level}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground font-terminal">PROGRESS</p>
                    <p className="text-2xl font-display text-green-400">{team.progress}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground font-terminal">HINTS USED</p>
                    <p className="text-2xl font-display text-yellow-400">{team.hintsUsed}</p>
                  </div>
                </div>
              </TerminalCard>

              <Link to="/leaderboard">
                <Button variant="toxic" size="lg" className="gap-2">
                  <Trophy className="w-5 h-5" />
                  View Leaderboard
                </Button>
              </Link>
            </div>
          )}

          {/* Disqualified State */}
          {team.status === "disqualified" && (
            <div className="max-w-2xl mx-auto text-center animate-fade-in">
              <AlertTriangle className="w-24 h-24 text-red-500 mx-auto mb-8" />

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10 mb-6">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-terminal uppercase tracking-widest text-red-400">
                  DISQUALIFIED
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                TEAM <span className="text-red-500">{team.teamName}</span>
              </h1>

              <p className="text-muted-foreground font-terminal mb-8">
                Your team has been disqualified from the competition.
              </p>

              <TerminalCard title="STATUS" status="danger" className="mb-8 text-left">
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    If you believe this is an error, please contact the event administrators.
                  </p>
                  <p className="text-xs text-red-400 font-terminal">
                    Disqualification may occur due to rule violations, suspicious activity, or admin decision.
                  </p>
                </div>
              </TerminalCard>

              <Link to="/leaderboard">
                <Button variant="terminal" size="lg" className="gap-2">
                  <Trophy className="w-5 h-5" />
                  View Leaderboard
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Qualification Message Modal - Shows notifications from admin */}
      <QualificationMessageModal autoShow={true} />

      {/* Celebration Modal - Shows when results are published and user is in top 3 */}
      <CelebrationModal
        isResultPublished={celebration.isResultPublished}
        resultData={celebration.resultData}
        onClose={celebration.onClose}
      />
    </div>
  );
};

export default Dashboard;


