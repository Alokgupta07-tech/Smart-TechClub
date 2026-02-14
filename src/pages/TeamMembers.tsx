import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Search, 
  Download, 
  Filter,
  ArrowLeft,
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TerminalCard } from '@/components/TerminalCard';
import { fetchWithAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Member {
  id: string;
  member_name: string;
  member_email: string;
  member_role?: string;
  is_leader: boolean;
  created_at: string;
}

interface TeamWithMembers {
  teamId: string;
  teamName: string;
  status: string;
  leader: {
    name: string;
    email: string;
  } | null;
  members: Member[];
  totalMembers: number;
}

const TeamMembers = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch all team members
  const { data: teamsData, isLoading, error } = useQuery({
    queryKey: ['admin', 'team-members'],
    queryFn: async () => {
      const response = await fetchWithAuth(`${API_BASE}/admin/team-members`);
      if (!response.ok) throw new Error('Failed to fetch team members');
      return response.json();
    },
    refetchInterval: 10000,
  });

  const teams: TeamWithMembers[] = teamsData?.teams || [];
  const totalMembers = teamsData?.totalMembers || 0;
  const totalTeams = teamsData?.totalTeams || 0;

  // Filter teams
  const filteredTeams = teams.filter(team => {
    const matchesSearch = 
      team.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.leader?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.leader?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.members.some(m => 
        m.member_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.member_email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    
    const matchesStatus = statusFilter === 'all' || team.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Export to CSV
  const handleExport = () => {
    const csvRows = [];
    csvRows.push(['Team Name', 'Team Status', 'Member Name', 'Member Email', 'Role', 'Is Leader']);
    
    filteredTeams.forEach(team => {
      // Add leader
      if (team.leader) {
        csvRows.push([
          team.teamName,
          team.status,
          team.leader.name,
          team.leader.email,
          'Leader',
          'Yes'
        ]);
      }
      
      // Add members
      team.members.forEach(member => {
        csvRows.push([
          team.teamName,
          team.status,
          member.member_name,
          member.member_email || 'N/A',
          member.member_role || 'Member',
          member.is_leader ? 'Yes' : 'No'
        ]);
      });
    });

    const csvContent = csvRows.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `team_members_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-success/20 text-success border-success/30',
      waiting: 'bg-warning/20 text-warning border-warning/30',
      completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      disqualified: 'bg-destructive/20 text-destructive border-destructive/30',
    };

    return (
      <Badge className={cn('font-terminal border', variants[status] || variants.waiting)}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center">
        <TerminalCard className="max-w-md">
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-display font-bold mb-2">ERROR</h2>
            <p className="text-muted-foreground mb-4">Failed to load team members data</p>
            <Button onClick={() => navigate('/admin')} variant="terminal">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
          </div>
        </TerminalCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/10 bg-background/95 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/admin')}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-display text-lg tracking-wider text-primary">TEAM MEMBERS</h1>
                <p className="text-xs font-terminal text-muted-foreground">
                  {totalTeams} Teams • {totalMembers} Members
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="terminal"
                size="sm"
                onClick={handleExport}
                disabled={filteredTeams.length === 0}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-24 pb-12">
        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="member-search"
              name="search"
              placeholder="Search teams or members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 font-terminal"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
              className="font-terminal"
            >
              All
            </Button>
            <Button
              variant={statusFilter === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('active')}
              className="font-terminal"
            >
              Active
            </Button>
            <Button
              variant={statusFilter === 'waiting' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('waiting')}
              className="font-terminal"
            >
              Waiting
            </Button>
          </div>
        </div>

        {/* Teams and Members */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="ml-3 text-muted-foreground font-terminal">Loading team members...</span>
          </div>
        ) : filteredTeams.length === 0 ? (
          <TerminalCard>
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground font-terminal text-sm">
                {searchQuery ? 'No teams match your search' : 'No teams found'}
              </p>
            </div>
          </TerminalCard>
        ) : (
          <div className="space-y-6">
            {filteredTeams.map((team) => (
              <TerminalCard key={team.teamId} className="overflow-hidden">
                {/* Team Header */}
                <div className="flex items-center justify-between p-4 border-b border-primary/10 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="font-display text-lg text-foreground">{team.teamName}</h3>
                      <p className="text-xs font-terminal text-muted-foreground">
                        {team.totalMembers} member{team.totalMembers !== 1 ? 's' : ''}
                        {team.leader && ` • Leader: ${team.leader.name}`}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(team.status)}
                </div>

                {/* Members Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-primary/10 bg-muted/20">
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">#</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">NAME</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">EMAIL</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">ROLE</th>
                        <th className="text-left py-3 px-4 text-xs font-terminal text-muted-foreground">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Leader Row */}
                      {team.leader && (
                        <tr className="border-b border-primary/10 bg-primary/5">
                          <td className="py-3 px-4 font-terminal text-sm">👑</td>
                          <td className="py-3 px-4">
                            <div className="font-terminal text-sm text-foreground flex items-center gap-2">
                              {team.leader.name}
                              <CheckCircle className="w-3 h-3 text-primary" />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {team.leader.email}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className="bg-primary/20 text-primary border-primary/30 font-terminal text-xs">
                              LEADER
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <CheckCircle className="w-4 h-4 text-success" />
                          </td>
                        </tr>
                      )}
                      
                      {/* Member Rows */}
                      {team.members.map((member, index) => (
                        <tr key={member.id} className="border-b border-primary/10 hover:bg-muted/10">
                          <td className="py-3 px-4 font-terminal text-sm text-muted-foreground">{index + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-terminal text-sm text-foreground">
                              {member.member_name}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {member.member_email ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="w-3 h-3" />
                                {member.member_email}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No email</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge className="bg-muted/20 text-muted-foreground border-muted/30 font-terminal text-xs">
                              {member.member_role?.toUpperCase() || 'MEMBER'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {member.member_email ? (
                              <CheckCircle className="w-4 h-4 text-success" />
                            ) : (
                              <XCircle className="w-4 h-4 text-warning" />
                            )}
                          </td>
                        </tr>
                      ))}

                      {team.members.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground font-terminal">
                            No additional members registered
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TerminalCard>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeamMembers;
