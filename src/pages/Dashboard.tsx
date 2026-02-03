import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Users, 
  Clock, 
  Trophy, 
  Zap, 
  AlertTriangle,
  Terminal,
  Lock,
  CheckCircle,
  HelpCircle,
  LogOut,
  MessageSquare,
  Timer,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as authAPI from "@/lib/authApi";
import { InventoryPanel } from "@/components/InventoryPanel";
import { BackButton } from "@/components/BackButton";

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
}

const puzzles = [
  { id: 1, title: "DECRYPT THE MESSAGE", status: "current", points: 100 },
  { id: 2, title: "BINARY SEQUENCE", status: "locked", points: 150 },
  { id: 3, title: "NETWORK TRACE", status: "locked", points: 200 },
  { id: 4, title: "FIREWALL BYPASS", status: "locked", points: 250 }
];

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timer, setTimer] = useState(0);

  // Fetch team data
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
    const interval = setInterval(fetchTeamData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Fetch broadcast messages
  useEffect(() => {
    const fetchBroadcasts = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch('http://localhost:5000/api/game/broadcast', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setBroadcasts(data.messages || []);
        }
      } catch (error) {
        console.error('Failed to fetch broadcasts:', error);
      }
    };

    fetchBroadcasts();
    const interval = setInterval(fetchBroadcasts, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // Timer effect
  useEffect(() => {
    if (team?.status === "active") {
      const interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [team?.status]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

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

            {/* Timer */}
            {team.status === "active" && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30">
                <Timer className="w-4 h-4 text-primary" />
                <span className="font-terminal text-lg text-primary text-glow-toxic">
                  {formatTime(timer)}
                </span>
              </div>
            )}

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
                        LEVEL 1: FIREWALL BREACH
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Break through the initial security layer
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-terminal">PROGRESS</p>
                      <p className="text-2xl font-display font-bold text-warning">1/4</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="infected-progress">
                      <div className="infected-progress-bar" style={{ width: "25%" }} />
                    </div>
                  </div>
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
                            <Button variant="toxic" size="sm" className="mt-3 w-full">
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
                {/* Hints */}
                <TerminalCard title="HINT SYSTEM" status="warning">
                  <div className="text-center mb-4">
                    <p className="text-xs text-muted-foreground font-terminal mb-2">HINTS REMAINING</p>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3].map((i) => (
                        <div 
                          key={i}
                          className={cn(
                            "w-10 h-10 rounded-lg border flex items-center justify-center",
                            i <= team.hintsUsed 
                              ? "border-muted-foreground/20 bg-muted/10 text-muted-foreground"
                              : "border-warning/50 bg-warning/10 text-warning"
                          )}
                        >
                          <HelpCircle className="w-5 h-5" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button 
                    variant="terminal" 
                    onClick={handleRequestHint}
                    disabled={team.hintsUsed >= 3}
                    className="w-full gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    REQUEST HINT (-5 MIN)
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-3 font-terminal">
                    ⚠ Each hint adds 5 minutes to your time
                  </p>
                </TerminalCard>

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
                  </div>
                </TerminalCard>

                {/* Inventory Panel */}
                <InventoryPanel />

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
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

