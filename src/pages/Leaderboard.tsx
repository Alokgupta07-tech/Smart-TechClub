import { useState } from "react";
import { Trophy, Clock, Medal, TrendingUp, ChevronUp, ChevronDown, Minus, Loader2, AlertCircle, Lock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { cn } from "@/lib/utils";
import { useLeaderboard } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";

const Leaderboard = () => {
  const { data, isLoading, error } = useLeaderboard();
  const [sortBy, setSortBy] = useState<"rank" | "time" | "hints">("rank");

  const resultsPublished = data?.resultsPublished ?? false;
  const leaderboardArray = data?.teams ?? [];

  const stats = {
    totalTeams: leaderboardArray.length,
    completed: leaderboardArray.filter(t => t.status === 'completed').length,
    inProgress: leaderboardArray.filter(t => t.status === 'active').length,
    waiting: leaderboardArray.filter(t => t.status === 'waiting').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="px-2 py-1 text-xs font-terminal bg-success/20 text-success rounded border border-success/30">COMPLETED</span>;
      case "active":
        return <span className="px-2 py-1 text-xs font-terminal bg-primary/20 text-primary rounded border border-primary/30">ACTIVE</span>;
      default:
        return <span className="px-2 py-1 text-xs font-terminal bg-muted/20 text-muted-foreground rounded border border-muted/30">WAITING</span>;
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-orange-400" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-terminal text-muted-foreground">{rank}</span>;
  };

  const getChangeIcon = (change: string | undefined) => {
    if (change === "up") return <ChevronUp className="w-4 h-4 text-success" />;
    if (change === "down") return <ChevronDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-background noise-overlay">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4">
            <div className="max-w-md mx-auto">
              <TerminalCard className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h2 className="text-xl font-display font-bold mb-2">CONNECTION ERROR</h2>
                <p className="text-muted-foreground mb-4">Failed to load leaderboard data. Please try again.</p>
                <Button onClick={() => window.location.reload()} variant="terminal">Retry</Button>
              </TerminalCard>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Results not published yet ─────────────────────────────────────────
  if (!isLoading && !resultsPublished) {
    return (
      <div className="min-h-screen bg-background noise-overlay">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4">
            <div className="max-w-lg mx-auto text-center">
              <BackButton label="Back" to="/dashboard" className="mb-8 text-left" />
              <TerminalCard className="py-16 px-8">
                <Lock className="w-16 h-16 text-primary mx-auto mb-6 opacity-70" />
                <h1 className="text-2xl font-display font-bold mb-3">Results Not Published Yet</h1>
                <p className="text-muted-foreground font-terminal mb-6">
                  The admin hasn't published the results yet.<br />
                  Come back once the evaluation is complete!
                </p>
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg text-sm font-terminal text-primary">
                  📋 Your answers have been submitted and are awaiting evaluation.
                </div>
                <Button
                  className="mt-8 w-full"
                  variant="terminal"
                  onClick={() => window.location.reload()}
                >
                  Refresh to Check
                </Button>
              </TerminalCard>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Main leaderboard (results published) ──────────────────────────────
  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <BackButton label="Back to Home" to="/" className="mb-6" />

            {/* Header */}
            <div className="text-center mb-12">
              <Trophy className="w-16 h-16 text-warning mx-auto mb-6 animate-float" />
              <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                FINAL <span className="text-primary text-glow-toxic">LEADERBOARD</span>
              </h1>
              <p className="text-muted-foreground font-terminal">
                Official results — congratulations to all participants!
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TerminalCard key={i} className="text-center animate-pulse">
                    <div className="w-5 h-5 mx-auto mb-2 bg-muted rounded" />
                    <div className="h-8 bg-muted rounded mb-2" />
                    <div className="h-4 bg-muted rounded" />
                  </TerminalCard>
                ))
              ) : (
                [
                  { label: "TEAMS", value: stats.totalTeams.toString(), icon: TrendingUp },
                  { label: "COMPLETED", value: stats.completed.toString(), icon: Trophy },
                  { label: "IN PROGRESS", value: stats.inProgress.toString(), icon: Clock },
                  { label: "WAITING", value: stats.waiting.toString(), icon: Clock },
                ].map((stat, i) => (
                  <TerminalCard key={i} className="text-center">
                    <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                    <div className="text-2xl font-display font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs font-terminal text-muted-foreground">{stat.label}</div>
                  </TerminalCard>
                ))
              )}
            </div>

            {/* Leaderboard Table */}
            <TerminalCard title="FINAL RANKINGS" status="active" scanLine>
              <div className="overflow-x-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <span className="ml-3 text-muted-foreground font-terminal">Loading rankings...</span>
                  </div>
                ) : leaderboardArray.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-primary/20">
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">#</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">TEAM</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground hidden md:table-cell">LEVEL</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground hidden md:table-cell">SCORE</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground hidden md:table-cell">CORRECT</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">TIME</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">HINTS</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardArray.map((team: any, index: number) => (
                        <tr
                          key={team.id}
                          className={cn(
                            "border-b border-primary/10 transition-colors hover:bg-primary/5",
                            index < 3 && "bg-primary/5"
                          )}
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              {getRankIcon(team.rank)}
                              {getChangeIcon(team.change)}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn("font-display text-sm", index < 3 && "text-primary text-glow-toxic")}>
                              {team.teamName}
                            </span>
                          </td>
                          <td className="py-4 px-4 hidden md:table-cell">
                            <span className={cn("font-terminal text-sm px-2 py-1 rounded", team.level >= 2 ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground")}>
                              Level {team.level || 1}
                            </span>
                          </td>
                          <td className="py-4 px-4 hidden md:table-cell">
                            <span className={cn("font-terminal text-sm font-bold", team.totalScore > 0 ? "text-success" : "text-muted-foreground")}>
                              {team.totalScore || 0} pts
                            </span>
                          </td>
                          <td className="py-4 px-4 hidden md:table-cell">
                            <span className={cn("font-terminal text-sm", team.puzzlesSolved > 0 ? "text-success" : "text-muted-foreground")}>
                              {team.puzzlesSolved || 0} / {team.totalQuestions || team.puzzlesSubmitted || 0}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn("font-terminal text-sm", team.totalTime ? "text-primary" : "text-muted-foreground")}>
                              {team.totalTime || "--:--:--"}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn("font-terminal text-sm", team.hintsUsed > 2 ? "text-destructive" : team.hintsUsed > 0 ? "text-warning" : "text-success")}>
                              {team.hintsUsed}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            {getStatusBadge(team.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-12">
                    <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground font-terminal text-sm">No teams on the leaderboard yet.</p>
                  </div>
                )}
              </div>
            </TerminalCard>

            {/* Legend */}
            <div className="mt-8 flex flex-wrap justify-center gap-6 text-xs font-terminal text-muted-foreground">
              <span className="flex items-center gap-2"><ChevronUp className="w-4 h-4 text-success" /> Moved Up</span>
              <span className="flex items-center gap-2"><ChevronDown className="w-4 h-4 text-destructive" /> Moved Down</span>
              <span className="flex items-center gap-2"><Minus className="w-4 h-4 text-muted-foreground" /> No Change</span>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Leaderboard;
