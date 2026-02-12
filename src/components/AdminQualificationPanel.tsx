/**
 * ==============================================
 * ADMIN QUALIFICATION PANEL
 * ==============================================
 * Admin interface for managing team qualifications
 * - View all teams' qualification status
 * - Override team qualification manually
 * - Configure qualification cutoffs
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy, 
  XCircle, 
  Clock, 
  Target, 
  Edit, 
  Save, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Settings,
  Users,
  Play,
  Pause,
  Ban,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Team {
  id: string;
  teamName: string;
  level: number;
  status: string;
  progress: number;
  timeElapsed: string;
  timeElapsedSeconds: number;
  hintsUsed: number;
  qualifiedForLevel2?: boolean;
  level1Completed?: boolean;
  level2Completed?: boolean;
  // Performance Data
  correctAnswers: number;
  wrongAnswers: number;
  totalQuestions: number;
  qualificationThreshold: number;
  qualificationStatus: 'qualified' | 'disqualified';
}

export function AdminQualificationPanel() {
  return (
    <Tabs defaultValue="teams" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="teams" className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Team Status
        </TabsTrigger>
        <TabsTrigger value="cutoffs" className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Cutoff Settings
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="teams">
        <TeamQualificationTable />
      </TabsContent>
      
      <TabsContent value="cutoffs">
        <CutoffSettings />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Team Qualification Table
 * Shows all teams with their qualification status
 */
function TeamQualificationTable() {
  const queryClient = useQueryClient();
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showQualifyDialog, setShowQualifyDialog] = useState(false);
  
  // Fetch teams using the working /api/admin/teams endpoint
  const { data: teams = [], isLoading, refetch } = useQuery({
    queryKey: ['adminTeams'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams`);
      if (!response.ok) throw new Error('Failed to fetch teams');
      const data = await response.json();
      return data.teams || data || [];
    },
    refetchInterval: 5000,
  });

  // Qualify team for Level 2 mutation
  const qualifyTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams/${teamId}/qualify-level2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to qualify team');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Team qualified for Level 2!');
      queryClient.invalidateQueries({ queryKey: ['adminTeams'] });
      setShowQualifyDialog(false);
      setSelectedTeam(null);
    },
    onError: () => {
      toast.error('Failed to qualify team');
    },
  });

  // Update team status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ teamId, status }: { teamId: string; status: string }) => {
      const response = await fetchWithAuth(`${API_BASE}/admin/teams/${teamId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Team status updated');
      queryClient.invalidateQueries({ queryKey: ['adminTeams'] });
    },
    onError: () => {
      toast.error('Failed to update team status');
    },
  });

  const filteredTeams = selectedLevel === 'all' 
    ? teams 
    : teams.filter((t: Team) => t.level === parseInt(selectedLevel));

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      active: 'bg-primary/20 text-primary border-primary/30',
      waiting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      disqualified: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
      <Badge variant="outline" className={cn('font-terminal', styles[status] || styles.waiting)}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  // Updated qualification status based on 8/10 correct answers
  const getQualificationBadge = (team: Team) => {
    const isQualified = team.correctAnswers >= (team.qualificationThreshold || 8);
    
    if (isQualified) {
      return (
        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 font-bold">
          <Trophy className="w-3 h-3 mr-1" />
          QUALIFIED
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 font-bold">
        <XCircle className="w-3 h-3 mr-1" />
        DISQUALIFIED
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Team Performance & Qualification
            </CardTitle>
            <CardDescription>
              Level 1: 10 Questions | Qualification: 8+ Correct Answers | Teams ranked by correct answers and time
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Filter Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="1">Level 1</SelectItem>
                <SelectItem value="2">Level 2</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No teams found
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead className="text-center">Correct Answers</TableHead>
                  <TableHead className="text-center">Wrong Answers</TableHead>
                  <TableHead className="text-center">Final Time</TableHead>
                  <TableHead className="text-center">Qualification</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeams.map((team: Team, index: number) => (
                  <TableRow key={team.id} className={team.correctAnswers >= (team.qualificationThreshold || 8) ? 'bg-green-500/5' : 'bg-red-500/5'}>
                    <TableCell className="font-terminal font-bold">{index + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-lg">{team.teamName}</p>
                        <p className="text-xs text-muted-foreground">Level {team.level}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-green-400">{team.correctAnswers || 0}</span>
                        <span className="text-xs text-muted-foreground">out of {team.totalQuestions || 10}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-red-400">{team.wrongAnswers || 0}</span>
                        <span className="text-xs text-muted-foreground">incorrect</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-terminal font-bold text-primary">{team.timeElapsed || '00:00:00'}</span>
                        <span className="text-xs text-muted-foreground">total time</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {getQualificationBadge(team)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {team.status === 'waiting' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
                            onClick={() => updateStatusMutation.mutate({ teamId: team.id, status: 'active' })}
                            title="Activate team"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        {team.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-yellow-400 hover:bg-yellow-500/20"
                            onClick={() => updateStatusMutation.mutate({ teamId: team.id, status: 'waiting' })}
                            title="Pause team"
                          >
                            <Pause className="w-4 h-4" />
                          </Button>
                        )}
                        {!team.qualifiedForLevel2 && team.level === 1 && team.correctAnswers >= (team.qualificationThreshold || 8) && (
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
                        {team.status !== 'disqualified' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/20"
                            onClick={() => updateStatusMutation.mutate({ teamId: team.id, status: 'disqualified' })}
                            title="Disqualify team"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Qualify for Level 2 Dialog */}
      <Dialog open={showQualifyDialog} onOpenChange={setShowQualifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
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
              onClick={() => selectedTeam && qualifyTeamMutation.mutate(selectedTeam.id)}
              disabled={qualifyTeamMutation.isPending}
              className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
            >
              {qualifyTeamMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Qualify Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Cutoff Settings Component
 */
function CutoffSettings() {
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    min_score: 60,
    max_time_seconds: 1800,
    min_accuracy: 70,
    max_hints_used: 3,
  });

  // Default cutoff settings (since the API might not return anything)
  const defaultCutoffs = [
    { level_id: 1, min_score: 60, max_time_seconds: 1800, min_accuracy: 70, max_hints_used: 3 },
    { level_id: 2, min_score: 80, max_time_seconds: 1200, min_accuracy: 80, max_hints_used: 2 },
  ];

  const handleEdit = (cutoff: any) => {
    setEditingLevel(cutoff.level_id);
    setFormData({
      min_score: cutoff.min_score,
      max_time_seconds: cutoff.max_time_seconds,
      min_accuracy: cutoff.min_accuracy,
      max_hints_used: cutoff.max_hints_used,
    });
  };

  const handleSave = () => {
    toast.success('Cutoff settings saved (demo mode)');
    setEditingLevel(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Qualification Cutoff Settings
        </CardTitle>
        <CardDescription>
          Configure the minimum requirements for qualification at each level
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {defaultCutoffs.map((cutoff) => (
            <Card key={cutoff.level_id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Level {cutoff.level_id}</CardTitle>
                  {editingLevel === cutoff.level_id ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingLevel(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        className="bg-primary text-black hover:bg-primary/80"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(cutoff)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      Min Score
                    </Label>
                    {editingLevel === cutoff.level_id ? (
                      <Input
                        type="number"
                        value={formData.min_score}
                        onChange={(e) => setFormData({ ...formData, min_score: parseInt(e.target.value) })}
                        className="h-8"
                      />
                    ) : (
                      <p className="font-terminal text-primary">{cutoff.min_score}</p>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Max Time (s)
                    </Label>
                    {editingLevel === cutoff.level_id ? (
                      <Input
                        type="number"
                        value={formData.max_time_seconds}
                        onChange={(e) => setFormData({ ...formData, max_time_seconds: parseInt(e.target.value) })}
                        className="h-8"
                      />
                    ) : (
                      <p className="font-terminal text-primary">{cutoff.max_time_seconds}s</p>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Min Accuracy (%)
                    </Label>
                    {editingLevel === cutoff.level_id ? (
                      <Input
                        type="number"
                        value={formData.min_accuracy}
                        onChange={(e) => setFormData({ ...formData, min_accuracy: parseFloat(e.target.value) })}
                        className="h-8"
                      />
                    ) : (
                      <p className="font-terminal text-primary">{cutoff.min_accuracy}%</p>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Max Hints
                    </Label>
                    {editingLevel === cutoff.level_id ? (
                      <Input
                        type="number"
                        value={formData.max_hints_used}
                        onChange={(e) => setFormData({ ...formData, max_hints_used: parseInt(e.target.value) })}
                        className="h-8"
                      />
                    ) : (
                      <p className="font-terminal text-primary">{cutoff.max_hints_used}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminQualificationPanel;
