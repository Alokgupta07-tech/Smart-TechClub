import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Trophy, 
  Clock,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Eye,
  Ban,
  Search,
  Filter,
  ChevronRight,
  Lock,
  Unlock,
  Zap,
  Timer,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Star,
  Medal,
  Plus,
  Pencil,
  Trash2,
  FileQuestion,
  Save,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TerminalCard } from "@/components/TerminalCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Team {
  id: string;
  teamName: string;
  status: string;
  level: number;
  progress: number;
  timeElapsed: string;
  hintsUsed: number;
  questionsCompleted?: number;
  level1Completed?: boolean;
  level2Completed?: boolean;
  qualifiedForLevel2?: boolean;
}

interface LevelStats {
  totalTeams: number;
  activeTeams: number;
  completedTeams: number;
  waitingTeams: number;
  avgTime: string;
}

interface Puzzle {
  id: string;
  level: number;
  puzzle_number: number;
  title: string;
  description?: string;
  puzzle_type: string;
  puzzle_content?: string;
  correct_answer: string;
  points: number;
  time_limit_minutes: number;
  is_active: boolean;
}

// Level configuration - Level 1 has 10 questions, Level 2 has 5 questions
const LEVEL_CONFIG = {
  1: { totalQuestions: 10, name: "QUALIFICATION" },
  2: { totalQuestions: 5, name: "FINALS" }
};

const AdminLevelManagement = () => {
  const queryClient = useQueryClient();
  const [activeLevel, setActiveLevel] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showQualifyDialog, setShowQualifyDialog] = useState(false);
  const [showDisqualifyDialog, setShowDisqualifyDialog] = useState(false);
  
  // Puzzle management state
  const [showPuzzleDialog, setShowPuzzleDialog] = useState(false);
  const [editingPuzzle, setEditingPuzzle] = useState<Puzzle | null>(null);
  const [puzzleForm, setPuzzleForm] = useState({
    title: "",
    description: "",
    puzzle_type: "text",
    puzzle_content: "",
    correct_answer: "",
    points: 100,
    time_limit_minutes: 10,
  });
  const [showDeletePuzzleDialog, setShowDeletePuzzleDialog] = useState(false);
  const [puzzleToDelete, setPuzzleToDelete] = useState<Puzzle | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"teams" | "questions">("questions");

  // Fetch game state (level unlock status)
  const { data: gameState } = useQuery({
    queryKey: ["gameState"],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/state`);
      if (!response.ok) throw new Error("Failed to fetch game state");
      const data = await response.json();
      return data.gameState || data;
    },
  });

  // Fetch teams for specific level
  const { data: levelTeams, isLoading: teamsLoading } = useQuery({
    queryKey: ["levelTeams", activeLevel],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams`);
      if (!response.ok) throw new Error("Failed to fetch teams");
      const data = await response.json();
      
      // Filter teams by current level
      const teams = data.teams || data || [];
      return teams.filter((team: Team) => {
        if (activeLevel === 1) {
          // Level 1: Show teams at level 1
          return team.level === 1;
        } else {
          // Level 2: Show teams that are at level 2 or qualified for level 2
          return team.level === 2 || team.qualifiedForLevel2;
        }
      });
    },
    refetchInterval: 5000,
  });

  // Calculate level-specific stats from teams
  const levelStats = levelTeams ? {
    totalTeams: levelTeams.length,
    activeTeams: levelTeams.filter((t: Team) => t.status === "active").length,
    completedTeams: levelTeams.filter((t: Team) => 
      activeLevel === 1 ? (t.progress >= 100 || t.qualifiedForLevel2) : t.progress >= 100
    ).length,
    waitingTeams: levelTeams.filter((t: Team) => t.status === "waiting").length,
    avgTime: "00:00:00",
  } : null;

  // Fetch puzzles for current level
  const { data: levelPuzzles, isLoading: puzzlesLoading } = useQuery({
    queryKey: ["puzzles", activeLevel],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles?level=${activeLevel}`);
      if (!response.ok) throw new Error("Failed to fetch puzzles");
      const data = await response.json();
      return (data.puzzles || []).sort((a: Puzzle, b: Puzzle) => a.puzzle_number - b.puzzle_number);
    },
  });

  // Create puzzle mutation
  const createPuzzle = useMutation({
    mutationFn: async (puzzleData: any) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(puzzleData),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to create puzzle");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Question created successfully!");
      queryClient.invalidateQueries({ queryKey: ["puzzles"] });
      setShowPuzzleDialog(false);
      resetPuzzleForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create question");
    },
  });

  // Update puzzle mutation
  const updatePuzzle = useMutation({
    mutationFn: async ({ id, ...puzzleData }: any) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(puzzleData),
      });
      if (!response.ok) throw new Error("Failed to update puzzle");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Question updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["puzzles"] });
      setShowPuzzleDialog(false);
      setEditingPuzzle(null);
      resetPuzzleForm();
    },
    onError: () => {
      toast.error("Failed to update question");
    },
  });

  // Delete puzzle mutation
  const deletePuzzle = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete puzzle");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Question deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["puzzles"] });
      setShowDeletePuzzleDialog(false);
      setPuzzleToDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete question");
    },
  });

  // Reset puzzle form
  const resetPuzzleForm = () => {
    setPuzzleForm({
      title: "",
      description: "",
      puzzle_type: "text",
      puzzle_content: "",
      correct_answer: "",
      points: 100,
      time_limit_minutes: 10,
    });
  };

  // Open add puzzle dialog
  const openAddPuzzleDialog = () => {
    setEditingPuzzle(null);
    resetPuzzleForm();
    setShowPuzzleDialog(true);
  };

  // Open edit puzzle dialog
  const openEditPuzzleDialog = (puzzle: Puzzle) => {
    setEditingPuzzle(puzzle);
    setPuzzleForm({
      title: puzzle.title,
      description: puzzle.description || "",
      puzzle_type: puzzle.puzzle_type,
      puzzle_content: puzzle.puzzle_content || "",
      correct_answer: puzzle.correct_answer,
      points: puzzle.points,
      time_limit_minutes: puzzle.time_limit_minutes,
    });
    setShowPuzzleDialog(true);
  };

  // Save puzzle (create or update)
  const savePuzzle = () => {
    const nextPuzzleNumber = editingPuzzle 
      ? editingPuzzle.puzzle_number 
      : (levelPuzzles?.length || 0) + 1;
    
    const puzzleData = {
      ...puzzleForm,
      level: activeLevel,
      puzzle_number: nextPuzzleNumber,
    };

    if (editingPuzzle) {
      updatePuzzle.mutate({ id: editingPuzzle.id, ...puzzleData });
    } else {
      createPuzzle.mutate(puzzleData);
    }
  };

  // Get question count info
  const questionCountInfo = {
    current: levelPuzzles?.length || 0,
    max: LEVEL_CONFIG[activeLevel].totalQuestions,
    canAdd: (levelPuzzles?.length || 0) < LEVEL_CONFIG[activeLevel].totalQuestions,
  };

  // Unlock Level 2 mutation
  const unlockLevel2 = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/game/level2/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to unlock Level 2");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Level 2 unlocked! Qualified teams can now proceed.");
      queryClient.invalidateQueries({ queryKey: ["gameState"] });
      queryClient.invalidateQueries({ queryKey: ["levelTeams"] });
    },
    onError: () => {
      toast.error("Failed to unlock Level 2");
    },
  });

  // Qualify team for Level 2
  const qualifyTeamForLevel2 = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams/${teamId}/qualify-level2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to qualify team");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Team qualified for Level 2!");
      queryClient.invalidateQueries({ queryKey: ["levelTeams"] });
      setShowQualifyDialog(false);
      setSelectedTeam(null);
    },
    onError: () => {
      toast.error("Failed to qualify team");
    },
  });

  // Activate all teams for current level
  const activateAllTeams = useMutation({
    mutationFn: async () => {
      const waitingTeams = levelTeams?.filter((t: Team) => t.status === "waiting") || [];
      const results = await Promise.all(
        waitingTeams.map((team: Team) =>
          fetchWithAuth(`${API_BASE}/admin/teams/${team.id}/status`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "active" }),
          })
        )
      );
      return results;
    },
    onSuccess: () => {
      toast.success(`All Level ${activeLevel} teams activated!`);
      queryClient.invalidateQueries({ queryKey: ["levelTeams"] });
    },
  });

  // Pause all teams for current level
  const pauseAllTeams = useMutation({
    mutationFn: async () => {
      const activeTeams = levelTeams?.filter((t: Team) => t.status === "active") || [];
      const results = await Promise.all(
        activeTeams.map((team: Team) =>
          fetchWithAuth(`${API_BASE}/admin/teams/${team.id}/status`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "waiting" }),
          })
        )
      );
      return results;
    },
    onSuccess: () => {
      toast.success(`All Level ${activeLevel} teams paused!`);
      queryClient.invalidateQueries({ queryKey: ["levelTeams"] });
    },
  });

  // Update team status
  const updateTeamStatus = async (teamId: string, status: string) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams/${teamId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      toast.success("Team status updated");
      queryClient.invalidateQueries({ queryKey: ["levelTeams"] });
    } catch (error) {
      toast.error("Failed to update team status");
    }
  };

  const filteredTeams = levelTeams?.filter((team: Team) =>
    team.teamName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-green-500/20 text-green-400 border-green-500/30",
      active: "bg-primary/20 text-primary border-primary/30",
      waiting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      disqualified: "bg-red-500/20 text-red-400 border-red-500/30",
      qualified: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return (
      <span className={cn("px-2 py-1 text-xs font-terminal rounded border", styles[status] || styles.waiting)}>
        {status.toUpperCase()}
      </span>
    );
  };

  const isLevel2Unlocked = gameState?.level2_open;

  return (
    <div className="space-y-6">
      {/* Level Tabs */}
      <Tabs value={String(activeLevel)} onValueChange={(v) => setActiveLevel(Number(v) as 1 | 2)}>
        <TabsList className="grid w-full grid-cols-2 bg-black/50 border border-primary/20">
          <TabsTrigger 
            value="1" 
            className="font-terminal data-[state=active]:bg-primary data-[state=active]:text-black gap-2"
          >
            <Medal className="w-4 h-4" />
            LEVEL 1 - QUALIFICATION
          </TabsTrigger>
          <TabsTrigger 
            value="2" 
            className={cn(
              "font-terminal data-[state=active]:bg-primary data-[state=active]:text-black gap-2",
              !isLevel2Unlocked && "opacity-50"
            )}
          >
            {isLevel2Unlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            LEVEL 2 - FINALS
            {!isLevel2Unlocked && <span className="text-xs">(LOCKED)</span>}
          </TabsTrigger>
        </TabsList>

        {/* Level 1 Content */}
        <TabsContent value="1" className="space-y-6 mt-6">
          {/* Level Stats & Question Count */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <TerminalCard className="text-center">
              <FileQuestion className="w-5 h-5 mx-auto mb-2 text-purple-400" />
              <div className="text-xl font-display font-bold">{questionCountInfo.current}/{questionCountInfo.max}</div>
              <div className="text-xs font-terminal text-muted-foreground">QUESTIONS</div>
            </TerminalCard>
            <TerminalCard className="text-center">
              <Users className="w-5 h-5 mx-auto mb-2 text-primary" />
              <div className="text-xl font-display font-bold">{levelStats?.totalTeams || 0}</div>
              <div className="text-xs font-terminal text-muted-foreground">TEAMS</div>
            </TerminalCard>
            <TerminalCard className="text-center">
              <Zap className="w-5 h-5 mx-auto mb-2 text-green-400" />
              <div className="text-xl font-display font-bold">{levelStats?.activeTeams || 0}</div>
              <div className="text-xs font-terminal text-muted-foreground">ACTIVE</div>
            </TerminalCard>
            <TerminalCard className="text-center">
              <Trophy className="w-5 h-5 mx-auto mb-2 text-yellow-400" />
              <div className="text-xl font-display font-bold">{levelStats?.completedTeams || 0}</div>
              <div className="text-xs font-terminal text-muted-foreground">QUALIFIED</div>
            </TerminalCard>
            <TerminalCard className="text-center">
              <Clock className="w-5 h-5 mx-auto mb-2 text-orange-400" />
              <div className="text-xl font-display font-bold">{levelStats?.waitingTeams || 0}</div>
              <div className="text-xs font-terminal text-muted-foreground">WAITING</div>
            </TerminalCard>
            <TerminalCard className="text-center">
              <Timer className="w-5 h-5 mx-auto mb-2 text-blue-400" />
              <div className="text-xl font-display font-bold">{levelStats?.avgTime || "00:00:00"}</div>
              <div className="text-xs font-terminal text-muted-foreground">AVG TIME</div>
            </TerminalCard>
          </div>

          {/* Sub-tabs for Questions and Teams */}
          <div className="flex gap-2 border-b border-primary/20 pb-2">
            <Button
              variant={activeSubTab === "questions" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab("questions")}
              className={cn(
                "gap-2",
                activeSubTab === "questions" ? "bg-purple-500 text-white" : "text-purple-400"
              )}
            >
              <FileQuestion className="w-4 h-4" />
              QUESTIONS ({questionCountInfo.current}/{questionCountInfo.max})
            </Button>
            <Button
              variant={activeSubTab === "teams" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab("teams")}
              className={cn(
                "gap-2",
                activeSubTab === "teams" ? "bg-primary text-black" : ""
              )}
            >
              <Users className="w-4 h-4" />
              TEAMS ({levelStats?.totalTeams || 0})
            </Button>
            <div className="flex-1" />
            <Button 
              onClick={() => unlockLevel2.mutate()}
              disabled={isLevel2Unlocked}
              size="sm"
              className={cn(
                "gap-2",
                isLevel2Unlocked 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/30"
              )}
              variant="outline"
            >
              {isLevel2Unlocked ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  L2 UNLOCKED
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  UNLOCK L2
                </>
              )}
            </Button>
          </div>

          {/* Questions Tab Content */}
          {activeSubTab === "questions" && (
            <TerminalCard title={`LEVEL 1 QUESTIONS (${questionCountInfo.current}/${questionCountInfo.max})`} status="active" scanLine>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Level 1 Qualification Round - {LEVEL_CONFIG[1].totalQuestions} questions required
                </p>
                <Button
                  onClick={openAddPuzzleDialog}
                  disabled={!questionCountInfo.canAdd}
                  className="gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border-purple-500/30"
                  variant="outline"
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                  ADD QUESTION
                </Button>
              </div>

              {puzzlesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading questions...</div>
              ) : (
                <div className="space-y-3">
                  {levelPuzzles?.map((puzzle: Puzzle) => (
                    <div
                      key={puzzle.id}
                      className="flex items-center justify-between p-3 bg-black/30 border border-primary/20 rounded-lg hover:border-primary/40 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-display font-bold">
                          Q{puzzle.puzzle_number}
                        </div>
                        <div>
                          <h4 className="font-display text-sm">{puzzle.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="uppercase">{puzzle.puzzle_type}</span>
                            <span>|</span>
                            <span>{puzzle.points} pts</span>
                            <span>|</span>
                            <span>{puzzle.time_limit_minutes} min</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={puzzle.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                          {puzzle.is_active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-blue-400 hover:bg-blue-500/20"
                          onClick={() => openEditPuzzleDialog(puzzle)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20"
                          onClick={() => {
                            setPuzzleToDelete(puzzle);
                            setShowDeletePuzzleDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!levelPuzzles || levelPuzzles.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileQuestion className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No questions added yet for Level 1.</p>
                      <p className="text-sm">Click "Add Question" to create your first question.</p>
                    </div>
                  )}
                  {questionCountInfo.current < questionCountInfo.max && (
                    <div className="text-center py-4 border border-dashed border-primary/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {questionCountInfo.max - questionCountInfo.current} more question(s) needed
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TerminalCard>
          )}

          {/* Teams Tab Content */}
          {activeSubTab === "teams" && (
            <>
              {/* Level 1 Actions */}
              <Card className="bg-black/50 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="font-terminal text-sm text-primary flex items-center gap-2">
                    <Medal className="w-4 h-4" />
                    LEVEL 1 TEAM CONTROLS
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button 
                    onClick={() => activateAllTeams.mutate()}
                    className="gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30"
                    variant="outline"
                  >
                    <Play className="w-4 h-4" />
                    START ALL
                  </Button>
                  <Button 
                    onClick={() => pauseAllTeams.mutate()}
                    className="gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/30"
                    variant="outline"
                  >
                    <Pause className="w-4 h-4" />
                    PAUSE ALL
                  </Button>
                </CardContent>
              </Card>

              {/* Level 1 Teams Table */}
              <TerminalCard title="LEVEL 1 TEAMS" status="active" scanLine>
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="level1-team-search"
                      name="search"
                      placeholder="Search teams..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-background/50 border-primary/20"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-primary/20">
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TEAM</th>
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">STATUS</th>
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">PROGRESS</th>
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TIME</th>
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">L2 STATUS</th>
                        <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.map((team: Team) => (
                        <tr 
                          key={team.id}
                          className="border-b border-primary/10 hover:bg-primary/5 transition-colors"
                        >
                          <td className="py-3 px-2">
                            <span className="font-display text-sm">{team.teamName}</span>
                          </td>
                          <td className="py-3 px-2">{getStatusBadge(team.status)}</td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full",
                                    team.progress === 100 ? "bg-green-500" : "bg-primary"
                                  )}
                                  style={{ width: `${team.progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-terminal">{team.progress}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 font-terminal text-sm">{team.timeElapsed || "--:--:--"}</td>
                          <td className="py-3 px-2">
                            {team.qualifiedForLevel2 || team.level1Completed ? (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                <Star className="w-3 h-3 mr-1" />
                                QUALIFIED
                              </Badge>
                            ) : (
                              <Badge className="bg-muted/20 text-muted-foreground border-muted/30">
                                PENDING
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex gap-2">
                              {team.status === "waiting" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
                                  onClick={() => updateTeamStatus(team.id, "active")}
                                  title="Activate team"
                                >
                                  <Play className="w-4 h-4" />
                                </Button>
                              ) : team.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-yellow-400 hover:bg-yellow-500/20"
                                  onClick={() => updateTeamStatus(team.id, "waiting")}
                                  title="Pause team"
                                >
                                  <Pause className="w-4 h-4" />
                                </Button>
                              ) : null}
                              
                              {!team.qualifiedForLevel2 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-blue-400 hover:bg-blue-500/20"
                                  onClick={() => {
                                    setSelectedTeam(team);
                                    setShowQualifyDialog(true);
                                  }}
                                  title="Qualify for Level 2"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                </Button>
                              )}
                              
                              {team.status === "disqualified" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
                                  onClick={() => updateTeamStatus(team.id, "active")}
                                  title="Qualify team (reverse disqualification)"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20"
                                  onClick={() => {
                                    setSelectedTeam(team);
                                    setShowDisqualifyDialog(true);
                                  }}
                                  title="Disqualify team"
                                >
                                  <Ban className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTeams.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">
                            No teams found for Level 1
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TerminalCard>
            </>
          )}
        </TabsContent>

        {/* Level 2 Content */}
        <TabsContent value="2" className="space-y-6 mt-6">
          {!isLevel2Unlocked ? (
            <Card className="bg-black/50 border-yellow-500/30">
              <CardContent className="py-12 text-center">
                <Lock className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
                <h3 className="text-xl font-display font-bold mb-2 text-yellow-400">LEVEL 2 IS LOCKED</h3>
                <p className="text-muted-foreground mb-6">
                  Level 2 must be unlocked before teams can proceed. Only teams who qualify from Level 1 will be able to participate.
                </p>
                <Button
                  onClick={() => unlockLevel2.mutate()}
                  className="gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/30"
                  variant="outline"
                >
                  <Unlock className="w-4 h-4" />
                  UNLOCK LEVEL 2 NOW
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Level 2 Stats */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <TerminalCard className="text-center">
                  <FileQuestion className="w-5 h-5 mx-auto mb-2 text-blue-400" />
                  <div className="text-xl font-display font-bold">{questionCountInfo.current}/{questionCountInfo.max}</div>
                  <div className="text-xs font-terminal text-muted-foreground">QUESTIONS</div>
                </TerminalCard>
                <TerminalCard className="text-center">
                  <Users className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <div className="text-xl font-display font-bold">{levelStats?.totalTeams || 0}</div>
                  <div className="text-xs font-terminal text-muted-foreground">QUALIFIED</div>
                </TerminalCard>
                <TerminalCard className="text-center">
                  <Zap className="w-5 h-5 mx-auto mb-2 text-green-400" />
                  <div className="text-xl font-display font-bold">{levelStats?.activeTeams || 0}</div>
                  <div className="text-xs font-terminal text-muted-foreground">PLAYING</div>
                </TerminalCard>
                <TerminalCard className="text-center">
                  <Trophy className="w-5 h-5 mx-auto mb-2 text-yellow-400" />
                  <div className="text-xl font-display font-bold">{levelStats?.completedTeams || 0}</div>
                  <div className="text-xs font-terminal text-muted-foreground">FINISHED</div>
                </TerminalCard>
                <TerminalCard className="text-center">
                  <Clock className="w-5 h-5 mx-auto mb-2 text-orange-400" />
                  <div className="text-xl font-display font-bold">{levelStats?.waitingTeams || 0}</div>
                  <div className="text-xs font-terminal text-muted-foreground">WAITING</div>
                </TerminalCard>
                <TerminalCard className="text-center">
                  <Timer className="w-5 h-5 mx-auto mb-2 text-blue-400" />
                  <div className="text-xl font-display font-bold">{levelStats?.avgTime || "00:00:00"}</div>
                  <div className="text-xs font-terminal text-muted-foreground">AVG TIME</div>
                </TerminalCard>
              </div>

              {/* Level 2 Sub-tabs */}
              <div className="flex gap-2 border-b border-blue-500/20 pb-2">
                <Button
                  variant={activeSubTab === "questions" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSubTab("questions")}
                  className={cn(
                    "gap-2",
                    activeSubTab === "questions" ? "bg-blue-500 text-white" : "text-blue-400"
                  )}
                >
                  <FileQuestion className="w-4 h-4" />
                  QUESTIONS ({questionCountInfo.current}/{questionCountInfo.max})
                </Button>
                <Button
                  variant={activeSubTab === "teams" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSubTab("teams")}
                  className={cn(
                    "gap-2",
                    activeSubTab === "teams" ? "bg-primary text-black" : ""
                  )}
                >
                  <Users className="w-4 h-4" />
                  TEAMS ({levelStats?.totalTeams || 0})
                </Button>
              </div>

              {/* Level 2 Questions Tab */}
              {activeSubTab === "questions" && (
                <TerminalCard title={`LEVEL 2 QUESTIONS (${questionCountInfo.current}/${questionCountInfo.max})`} status="active" scanLine>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-muted-foreground">
                      Level 2 Finals - {LEVEL_CONFIG[2].totalQuestions} questions required
                    </p>
                    <Button
                      onClick={openAddPuzzleDialog}
                      disabled={!questionCountInfo.canAdd}
                      className="gap-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/30"
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="w-4 h-4" />
                      ADD QUESTION
                    </Button>
                  </div>

                  {puzzlesLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading questions...</div>
                  ) : (
                    <div className="space-y-3">
                      {levelPuzzles?.map((puzzle: Puzzle) => (
                        <div
                          key={puzzle.id}
                          className="flex items-center justify-between p-3 bg-black/30 border border-blue-500/20 rounded-lg hover:border-blue-500/40 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-display font-bold">
                              Q{puzzle.puzzle_number}
                            </div>
                            <div>
                              <h4 className="font-display text-sm">{puzzle.title}</h4>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="uppercase">{puzzle.puzzle_type}</span>
                                <span>|</span>
                                <span>{puzzle.points} pts</span>
                                <span>|</span>
                                <span>{puzzle.time_limit_minutes} min</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={puzzle.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                              {puzzle.is_active ? "ACTIVE" : "INACTIVE"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-blue-400 hover:bg-blue-500/20"
                              onClick={() => openEditPuzzleDialog(puzzle)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20"
                              onClick={() => {
                                setPuzzleToDelete(puzzle);
                                setShowDeletePuzzleDialog(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!levelPuzzles || levelPuzzles.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileQuestion className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No questions added yet for Level 2.</p>
                          <p className="text-sm">Click "Add Question" to create your first question.</p>
                        </div>
                      )}
                      {questionCountInfo.current < questionCountInfo.max && (
                        <div className="text-center py-4 border border-dashed border-blue-500/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            {questionCountInfo.max - questionCountInfo.current} more question(s) needed
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </TerminalCard>
              )}

              {/* Level 2 Teams Tab */}
              {activeSubTab === "teams" && (
                <>
                  {/* Level 2 Actions */}
                  <Card className="bg-black/50 border-blue-500/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-terminal text-sm text-blue-400 flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        LEVEL 2 TEAM CONTROLS - FINALS
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-3">
                      <Button 
                        onClick={() => activateAllTeams.mutate()}
                        className="gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30"
                        variant="outline"
                      >
                        <Play className="w-4 h-4" />
                        START ALL L2 TEAMS
                      </Button>
                      <Button 
                        onClick={() => pauseAllTeams.mutate()}
                        className="gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/30"
                        variant="outline"
                      >
                        <Pause className="w-4 h-4" />
                        PAUSE ALL L2 TEAMS
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Level 2 Teams Table */}
                  <TerminalCard title="LEVEL 2 TEAMS - FINALS" status="active" scanLine>
                    <div className="flex gap-4 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="level2-team-search"
                          name="search"
                          placeholder="Search qualified teams..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 bg-background/50 border-primary/20"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-blue-500/20">
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">RANK</th>
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TEAM</th>
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">STATUS</th>
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">L2 PROGRESS</th>
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">TIME</th>
                            <th className="text-left py-3 px-2 text-xs font-terminal text-muted-foreground">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTeams.map((team: Team, index: number) => (
                            <tr 
                              key={team.id}
                              className="border-b border-blue-500/10 hover:bg-blue-500/5 transition-colors"
                            >
                              <td className="py-3 px-2">
                                <span className={cn(
                                  "font-display text-lg",
                                  index === 0 && "text-yellow-400",
                                  index === 1 && "text-gray-300",
                                  index === 2 && "text-amber-600"
                                )}>
                                  #{index + 1}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className="font-display text-sm">{team.teamName}</span>
                              </td>
                              <td className="py-3 px-2">{getStatusBadge(team.status)}</td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full",
                                        team.level2Completed ? "bg-green-500" : "bg-blue-500"
                                      )}
                                      style={{ width: `${team.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-terminal">{team.progress}%</span>
                                </div>
                              </td>
                              <td className="py-3 px-2 font-terminal text-sm">{team.timeElapsed || "--:--:--"}</td>
                              <td className="py-3 px-2">
                                <div className="flex gap-2">
                                  {team.status === "waiting" ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
                                      onClick={() => updateTeamStatus(team.id, "active")}
                                    >
                                      <Play className="w-4 h-4" />
                                    </Button>
                                  ) : team.status === "active" ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-yellow-400 hover:bg-yellow-500/20"
                                      onClick={() => updateTeamStatus(team.id, "waiting")}
                                    >
                                      <Pause className="w-4 h-4" />
                                    </Button>
                                  ) : null}
                                  
                                  {team.status === "disqualified" ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
                                      onClick={() => updateTeamStatus(team.id, "active")}
                                      title="Qualify team (reverse disqualification)"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20"
                                      onClick={() => {
                                        setSelectedTeam(team);
                                        setShowDisqualifyDialog(true);
                                      }}
                                      title="Disqualify team"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredTeams.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                No qualified teams for Level 2 yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TerminalCard>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Puzzle Dialog */}
      <Dialog open={showPuzzleDialog} onOpenChange={setShowPuzzleDialog}>
        <DialogContent className="bg-background border-primary/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-purple-400" />
              {editingPuzzle ? "Edit Question" : "Add New Question"} - Level {activeLevel}
            </DialogTitle>
            <DialogDescription>
              {editingPuzzle 
                ? `Editing question ${editingPuzzle.puzzle_number} of ${LEVEL_CONFIG[activeLevel].totalQuestions}` 
                : `Adding question ${(levelPuzzles?.length || 0) + 1} of ${LEVEL_CONFIG[activeLevel].totalQuestions}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-terminal text-muted-foreground">TITLE</label>
                <Input
                  id="puzzle-title"
                  name="title"
                  value={puzzleForm.title}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, title: e.target.value })}
                  placeholder="Enter question title"
                  className="mt-1"
                />
              </div>
              
              <div className="col-span-2">
                <label className="text-sm font-terminal text-muted-foreground">DESCRIPTION</label>
                <Textarea
                  id="puzzle-description"
                  name="description"
                  value={puzzleForm.description}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, description: e.target.value })}
                  placeholder="Enter question description/instructions"
                  className="mt-1"
                  rows={2}
                />
              </div>
              
              <div>
                <label className="text-sm font-terminal text-muted-foreground">TYPE</label>
                <Select
                  value={puzzleForm.puzzle_type}
                  onValueChange={(value) => setPuzzleForm({ ...puzzleForm, puzzle_type: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="cipher">Cipher</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="qr">QR Code</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-terminal text-muted-foreground">POINTS</label>
                <Input
                  id="puzzle-points"
                  name="points"
                  type="number"
                  value={puzzleForm.points}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, points: parseInt(e.target.value) || 100 })}
                  className="mt-1"
                />
              </div>
              
              <div className="col-span-2">
                <label className="text-sm font-terminal text-muted-foreground">PUZZLE CONTENT</label>
                <Textarea
                  id="puzzle-content"
                  name="puzzle_content"
                  value={puzzleForm.puzzle_content}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, puzzle_content: e.target.value })}
                  placeholder="Enter the puzzle/question content"
                  className="mt-1 font-mono"
                  rows={4}
                />
              </div>
              
              <div>
                <label className="text-sm font-terminal text-muted-foreground">CORRECT ANSWER</label>
                <Input
                  id="puzzle-answer"
                  name="correct_answer"
                  value={puzzleForm.correct_answer}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, correct_answer: e.target.value })}
                  placeholder="Enter correct answer"
                  className="mt-1"
                />
              </div>
              
              <div>
                <label className="text-sm font-terminal text-muted-foreground">TIME LIMIT (minutes)</label>
                <Input
                  id="puzzle-time-limit"
                  name="time_limit_minutes"
                  type="number"
                  value={puzzleForm.time_limit_minutes}
                  onChange={(e) => setPuzzleForm({ ...puzzleForm, time_limit_minutes: parseInt(e.target.value) || 10 })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPuzzleDialog(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={savePuzzle}
              disabled={!puzzleForm.title || !puzzleForm.correct_answer}
              className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingPuzzle ? "Update Question" : "Save Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Puzzle Confirmation Dialog */}
      <Dialog open={showDeletePuzzleDialog} onOpenChange={setShowDeletePuzzleDialog}>
        <DialogContent className="bg-background border-red-500/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Question
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{puzzleToDelete?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeletePuzzleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => puzzleToDelete && deletePuzzle.mutate(puzzleToDelete.id)}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Qualify for Level 2 Dialog */}
      <Dialog open={showQualifyDialog} onOpenChange={setShowQualifyDialog}>
        <DialogContent className="bg-background border-primary/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              Qualify Team for Level 2
            </DialogTitle>
            <DialogDescription>
              This will allow team "{selectedTeam?.teamName}" to proceed to Level 2 finals.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowQualifyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedTeam && qualifyTeamForLevel2.mutate(selectedTeam.id)}
              className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Qualify Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disqualify Dialog */}
      <Dialog open={showDisqualifyDialog} onOpenChange={setShowDisqualifyDialog}>
        <DialogContent className="bg-background border-red-500/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Disqualify Team
            </DialogTitle>
            <DialogDescription>
              This will disqualify team "{selectedTeam?.teamName}" from the competition.
              This action can be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisqualifyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedTeam) {
                  updateTeamStatus(selectedTeam.id, "disqualified");
                  setShowDisqualifyDialog(false);
                  setSelectedTeam(null);
                }
              }}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              <Ban className="w-4 h-4 mr-2" />
              Disqualify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLevelManagement;
