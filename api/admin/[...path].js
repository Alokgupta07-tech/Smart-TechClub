const { getSupabase } = require('../_lib/supabase');
const { verifyAuth, requireAdmin, setCorsHeaders } = require('../_lib/auth');

// Transform team row from snake_case DB to camelCase frontend
function mapTeam(t, usersMap) {
  var elapsed = '--:--:--';
  if (t.start_time) {
    var end = t.end_time ? new Date(t.end_time) : new Date();
    var diffSec = Math.floor((end - new Date(t.start_time)) / 1000);
    var h = Math.floor(diffSec / 3600);
    var m = Math.floor((diffSec % 3600) / 60);
    var s = diffSec % 60;
    elapsed = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  var leader = usersMap && usersMap[t.user_id] ? usersMap[t.user_id] : null;
  return {
    id: t.id,
    teamName: t.team_name || '',
    level: t.level || 1,
    status: t.status || 'waiting',
    progress: t.progress || 0,
    startTime: t.start_time || null,
    endTime: t.end_time || null,
    hintsUsed: t.hints_used || 0,
    timeElapsed: elapsed,
    createdAt: t.created_at || null,
    leader_name: leader ? leader.name : null,
    leader_email: leader ? leader.email : null,
    user_id: t.user_id
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();

  // Verify authentication
  const authResult = verifyAuth(req);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error, code: authResult.code });
  }

  // Verify admin role
  const adminCheck = requireAdmin(authResult.user);
  if (adminCheck) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const path = req.url.replace('/api/admin', '').split('?')[0];

  try {
    // ─── GET /api/admin/teams ───
    if (req.method === 'GET' && path === '/teams') {
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });
      if (tErr) throw tErr;

      var userIds = [];
      (teams || []).forEach(function (t) {
        if (t.user_id && userIds.indexOf(t.user_id) === -1) userIds.push(t.user_id);
      });
      var usersMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        (users || []).forEach(function (u) { usersMap[u.id] = u; });
      }

      var result = (teams || []).map(function (t) { return mapTeam(t, usersMap); });
      return res.json(result);
    }

    // ─── GET /api/admin/teams/:id ───
    if (req.method === 'GET' && path.match(/^\/teams\/[^\/]+$/)) {
      var teamId = path.split('/')[2];

      const { data: team, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (tErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const { data: leader } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', team.user_id)
        .single();

      const { data: members, error: membersErr } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('is_leader', { ascending: false })
        .order('created_at', { ascending: true });

      if (membersErr) {
        console.error('Error fetching members:', membersErr);
      }

      var usMap = {};
      if (leader) usMap[team.user_id] = leader;
      var mapped = mapTeam(team, usMap);
      mapped.members = members || [];

      // Add debug logging
      console.log('Team details for', teamId, '- Members count:', (members || []).length);

      return res.json(mapped);
    }

    // ─── GET /api/admin/stats ───
    if (req.method === 'GET' && path === '/stats') {
      const { count: totalTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true });

      const { count: active } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: completed } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      const { count: waiting } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting');

      // Calculate avg time from completed teams
      const { data: completedTeams } = await supabase
        .from('teams')
        .select('start_time, end_time')
        .eq('status', 'completed')
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      var avgTime = '00:00:00';
      if (completedTeams && completedTeams.length > 0) {
        var totalSec = 0;
        completedTeams.forEach(function (t) {
          totalSec += Math.floor((new Date(t.end_time) - new Date(t.start_time)) / 1000);
        });
        var avgSec = Math.floor(totalSec / completedTeams.length);
        var ah = Math.floor(avgSec / 3600);
        var am = Math.floor((avgSec % 3600) / 60);
        var as2 = avgSec % 60;
        avgTime = String(ah).padStart(2, '0') + ':' + String(am).padStart(2, '0') + ':' + String(as2).padStart(2, '0');
      }

      // Total hints used
      const { data: hintData } = await supabase
        .from('teams')
        .select('hints_used');
      var totalHints = 0;
      (hintData || []).forEach(function (t) { totalHints += (t.hints_used || 0); });

      return res.json({
        totalTeams: totalTeams || 0,
        active: active || 0,
        completed: completed || 0,
        waiting: waiting || 0,
        avgTime: avgTime,
        hintsUsed: totalHints
      });
    }

    // ─── GET /api/admin/alerts ───
    if (req.method === 'GET' && path === '/alerts') {
      // Try audit_logs table for alerts
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        // If audit_logs doesn't exist, return empty array
        return res.json([]);
      }

      var alerts = (logs || []).map(function (log, idx) {
        var timeAgo = '';
        if (log.created_at) {
          var diffMs = Date.now() - new Date(log.created_at).getTime();
          var diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 1) timeAgo = 'just now';
          else if (diffMin < 60) timeAgo = diffMin + 'm ago';
          else if (diffMin < 1440) timeAgo = Math.floor(diffMin / 60) + 'h ago';
          else timeAgo = Math.floor(diffMin / 1440) + 'd ago';
        }
        return {
          id: log.id || idx,
          teamId: log.team_id || '',
          team: log.team_name || log.action || 'System',
          type: log.action_type || log.severity || 'info',
          message: log.description || log.action || 'Activity logged',
          createdAt: log.created_at || '',
          timeAgo: timeAgo
        };
      });

      return res.json(alerts);
    }

    // ─── PUT/PATCH /api/admin/teams/:id/status ───
    if ((req.method === 'PUT' || req.method === 'PATCH') && path.match(/^\/teams\/[^\/]+\/status$/)) {
      var statusTeamId = path.split('/')[2];
      const { status } = req.body;

      const { error } = await supabase
        .from('teams')
        .update({ status: status })
        .eq('id', statusTeamId);
      if (error) throw error;

      return res.json({ message: 'Team status updated' });
    }

    // ─── DELETE /api/admin/teams/:id ───
    if (req.method === 'DELETE' && path.match(/^\/teams\/[^\/]+$/)) {
      var delTeamId = path.split('/')[2];

      // Delete team members first
      await supabase.from('team_members').delete().eq('team_id', delTeamId);

      // Delete the team (user cascade should handle the rest)
      const { data: team } = await supabase
        .from('teams')
        .select('user_id')
        .eq('id', delTeamId)
        .single();

      const { error } = await supabase.from('teams').delete().eq('id', delTeamId);
      if (error) throw error;

      // Also delete the user if found
      if (team && team.user_id) {
        await supabase.from('users').delete().eq('id', team.user_id);
      }

      return res.json({ message: 'Team deleted' });
    }

    // ─── PATCH /api/admin/team/:id/action ───
    if (req.method === 'PATCH' && path.match(/^\/team\/[^\/]+\/action$/)) {
      var actionTeamId = path.split('/')[2];
      const { action } = req.body;

      var statusMap = { pause: 'paused', resume: 'active', disqualify: 'disqualified' };
      var newStatus = statusMap[action];
      if (!newStatus) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const { error } = await supabase
        .from('teams')
        .update({ status: newStatus })
        .eq('id', actionTeamId);
      if (error) throw error;

      return res.json({ message: 'Team ' + action + ' successful' });
    }

    // ─── POST /api/admin/teams/:id/qualify-level2 ───
    if (req.method === 'POST' && path.match(/^\/teams\/[^\/]+\/qualify-level2$/)) {
      var qualifyTeamId = path.split('/')[2];

      const { error } = await supabase
        .from('teams')
        .update({
          status: 'waiting',
          level: 2,
          progress: 0
        })
        .eq('id', qualifyTeamId);
      if (error) throw error;

      return res.json({ message: 'Team qualified for Level 2' });
    }

    // ─── POST /api/admin/teams/:id/disqualify ───
    if (req.method === 'POST' && path.match(/^\/teams\/[^\/]+\/disqualify$/)) {
      var disqualifyTeamId = path.split('/')[2];

      const { error } = await supabase
        .from('teams')
        .update({ status: 'disqualified' })
        .eq('id', disqualifyTeamId);
      if (error) throw error;

      return res.json({ message: 'Team disqualified' });
    }

    // ─── GET /api/admin/monitor/live ───
    if (req.method === 'GET' && path === '/monitor/live') {
      // Get ALL teams for stats and display
      const { data: allTeams, error: allErr } = await supabase
        .from('teams')
        .select('id, team_name, level, status, user_id, start_time, hints_used, progress')
        .order('level', { ascending: false });
      if (allErr) throw allErr;

      // Calculate stats from all teams
      var totalTeams = (allTeams || []).length;
      var activeTeams = 0;
      var completedTeams = 0;
      var totalProgress = 0;
      (allTeams || []).forEach(function (t) {
        if (t.status === 'active' || t.status === 'paused') activeTeams++;
        if (t.status === 'completed') completedTeams++;
        totalProgress += t.progress || 0;
      });
      var avgProgress = totalTeams > 0 ? (totalProgress / totalTeams) : 0;

      // Show ALL teams in the table (not just active/paused)
      var liveTeams = allTeams || [];

      var liveUserIds = [];
      liveTeams.forEach(function (t) {
        if (t.user_id && liveUserIds.indexOf(t.user_id) === -1) liveUserIds.push(t.user_id);
      });
      var liveUsersMap = {};
      if (liveUserIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', liveUserIds);
        (users || []).forEach(function (u) { liveUsersMap[u.id] = u; });
      }

      // Calculate scores and progress from submissions
      const teamIds = liveTeams.map(t => t.id);
      const { data: submissions } = teamIds.length > 0 ? await supabase
        .from('submissions')
        .select('team_id, puzzle_id, is_correct, score_awarded, submitted_at')
        .in('team_id', teamIds) : { data: [] };

      // Get puzzles for progress calculation
      const { data: puzzles } = await supabase
        .from('puzzles')
        .select('id')
        .eq('is_active', true);
      var totalPuzzles = (puzzles || []).length || 10;

      var scoreMap = {};
      var correctMap = {};
      var attemptMap = {};
      var lastActivityMap = {};
      (submissions || []).forEach(function (s) {
        if (!scoreMap[s.team_id]) scoreMap[s.team_id] = 0;
        if (!correctMap[s.team_id]) correctMap[s.team_id] = 0;
        if (!attemptMap[s.team_id]) attemptMap[s.team_id] = 0;
        scoreMap[s.team_id] += s.score_awarded || 0;
        if (s.is_correct) correctMap[s.team_id]++;
        attemptMap[s.team_id]++;
        if (s.submitted_at) {
          if (!lastActivityMap[s.team_id] || new Date(s.submitted_at) > new Date(lastActivityMap[s.team_id])) {
            lastActivityMap[s.team_id] = s.submitted_at;
          }
        }
      });

      var liveResult = liveTeams.map(function (t) {
        // Calculate elapsed time
        var elapsedSec = 0;
        if (t.start_time) {
          elapsedSec = Math.floor((Date.now() - new Date(t.start_time).getTime()) / 1000);
        }
        var hrs = Math.floor(elapsedSec / 3600);
        var mins = Math.floor((elapsedSec % 3600) / 60);
        var secs = elapsedSec % 60;
        var elapsed = hrs.toString().padStart(2, '0') + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');

        var correctCount = correctMap[t.id] || 0;
        var progressPct = totalPuzzles > 0 ? Math.round((correctCount / totalPuzzles) * 100) : 0;

        return {
          id: t.id,
          team_name: t.team_name,
          current_level: t.level,
          current_puzzle: correctCount + 1,
          progress: progressPct,
          completed_puzzles: correctCount,
          total_attempts: attemptMap[t.id] || 0,
          hints_used: t.hints_used || 0,
          total_score: scoreMap[t.id] || 0,
          status: t.status,
          time_elapsed: elapsed,
          elapsed_seconds: elapsedSec,
          last_activity: lastActivityMap[t.id] || null,
          leader_name: liveUsersMap[t.user_id] ? liveUsersMap[t.user_id].name : null
        };
      }).sort((a, b) => b.total_score - a.total_score);

      return res.json({
        teams: liveResult,
        stats: {
          total_teams: totalTeams,
          active_teams: activeTeams,
          completed_teams: completedTeams,
          average_progress: avgProgress
        }
      });
    }

    // ─── GET /api/admin/activity ───
    if (req.method === 'GET' && path === '/activity') {
      // Get activity logs with team names
      const { data: logs, error } = await supabase
        .from('activity_logs')
        .select('id, team_id, action_type, description, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Fallback: try with different column names
        const { data: logs2, error: err2 } = await supabase
          .from('activity_logs')
          .select('id, team_id, type, message, created_at')
          .order('created_at', { ascending: false })
          .limit(50);

        if (err2) {
          return res.json({ logs: [] });
        }

        // Get team names
        const teamIds = [...new Set((logs2 || []).map(l => l.team_id).filter(Boolean))];
        let teamsMap = {};
        if (teamIds.length > 0) {
          const { data: teams } = await supabase
            .from('teams')
            .select('id, team_name')
            .in('id', teamIds);
          (teams || []).forEach(t => { teamsMap[t.id] = t.team_name; });
        }

        // Map to expected format
        const mappedLogs = (logs2 || []).map(l => ({
          id: l.id,
          team_name: teamsMap[l.team_id] || 'Unknown Team',
          activity_type: l.type || 'system',
          description: l.message || '',
          timestamp: l.created_at
        }));

        return res.json({ logs: mappedLogs });
      }

      // Get team names
      const teamIds = [...new Set((logs || []).map(l => l.team_id).filter(Boolean))];
      let teamsMap = {};
      if (teamIds.length > 0) {
        const { data: teams } = await supabase
          .from('teams')
          .select('id, team_name')
          .in('id', teamIds);
        (teams || []).forEach(t => { teamsMap[t.id] = t.team_name; });
      }

      // Map to expected format
      const mappedLogs = (logs || []).map(l => ({
        id: l.id,
        team_name: teamsMap[l.team_id] || 'Unknown Team',
        activity_type: l.action_type || 'system',
        description: l.description || '',
        timestamp: l.created_at
      }));

      return res.json({ logs: mappedLogs });
    }

    // ─── GET /api/admin/suspicious ───
    if (req.method === 'GET' && path === '/suspicious') {
      // Return empty array for suspicious activity (can be enhanced later)
      return res.json({ activities: [] });
    }

    // ─── GET /api/admin/audit-logs ───
    if (req.method === 'GET' && path === '/audit-logs') {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        return res.json([]);
      }
      return res.json(logs || []);
    }

    // ─── GET /api/admin/team-timings ───
    if (req.method === 'GET' && path === '/team-timings') {
      var teamsResult = await supabase
        .from('teams')
        .select('id, team_name, status, start_time, end_time, hints_used')
        .order('created_at', { ascending: false });

      if (teamsResult.error) {
        return res.json({ success: true, teams: [] });
      }
      var teams = teamsResult.data || [];

      // Get puzzle count
      var puzzlesResult = await supabase
        .from('puzzles')
        .select('id, title, puzzle_number')
        .eq('is_active', true)
        .eq('level', 1)
        .order('puzzle_number');
      var puzzles = puzzlesResult.data || [];
      var totalQuestions = puzzles.length > 0 ? puzzles.length : 10;

      // Get all progress records
      var progressResult = await supabase
        .from('team_question_progress')
        .select('team_id, puzzle_id, status, attempts, correct, time_spent_seconds, started_at, completed_at');
      var allProgress = progressResult.data || [];

      // Build team info with actual progress data
      var teamsWithDetails = teams.map(function (team) {
        var totalTimeSeconds = 0;
        if (team.start_time && team.end_time) {
          totalTimeSeconds = Math.floor((new Date(team.end_time) - new Date(team.start_time)) / 1000);
        } else if (team.start_time && team.status === 'active') {
          totalTimeSeconds = Math.floor((new Date() - new Date(team.start_time)) / 1000);
        }

        // Filter progress for this team
        var teamProgress = allProgress.filter(function (p) { return p.team_id === team.id; });
        var completedCount = teamProgress.filter(function (p) { return p.status === 'COMPLETED'; }).length;
        var skippedCount = teamProgress.filter(function (p) { return p.status === 'SKIPPED'; }).length;
        var correctCount = teamProgress.filter(function (p) { return p.correct === true; }).length;
        var wrongCount = teamProgress.filter(function (p) { return p.attempts > 0 && p.correct !== true; }).length;
        var currentQ = completedCount + skippedCount + 1;

        // Get current status
        var currentStatus = team.status || 'waiting';
        var inProgressQ = teamProgress.find(function (p) { return p.status === 'IN_PROGRESS'; });
        if (inProgressQ) {
          currentStatus = 'playing';
        } else if (completedCount >= totalQuestions) {
          currentStatus = 'completed';
        }

        // Build question times array
        var questionTimes = puzzles.map(function (puzzle, idx) {
          var progress = teamProgress.find(function (p) { return p.puzzle_id === puzzle.id; });
          return {
            questionNumber: idx + 1,
            questionId: puzzle.id,
            title: puzzle.title,
            status: progress ? progress.status : 'NOT_STARTED',
            timeSpent: progress ? (progress.time_spent_seconds || 0) : 0,
            attempts: progress ? (progress.attempts || 0) : 0,
            correct: progress ? progress.correct : null
          };
        });

        return {
          teamId: team.id,
          teamName: team.team_name,
          currentStatus: currentStatus,
          totalTime: totalTimeSeconds,
          penaltyTime: 0,
          questionsCompleted: completedCount,
          totalQuestions: totalQuestions,
          currentQuestion: currentQ > totalQuestions ? totalQuestions : currentQ,
          skipsUsed: skippedCount,
          hintsUsed: team.hints_used || 0,
          correctAnswers: correctCount,
          wrongAnswers: wrongCount,
          questionTimes: questionTimes
        };
      });

      return res.json({ success: true, teams: teamsWithDetails });
    }

    // ─── GET /api/admin/question-analytics ───
    if (req.method === 'GET' && path === '/question-analytics') {
      var puzzlesResult = await supabase
        .from('puzzles')
        .select('id, title, level, puzzle_number')
        .order('level')
        .order('puzzle_number');

      if (puzzlesResult.error) {
        return res.json({ success: true, questions: [], overallAvgTime: 600 });
      }
      var puzzles = puzzlesResult.data || [];

      // Get all progress data
      var progressResult = await supabase
        .from('team_question_progress')
        .select('puzzle_id, status, attempts, time_spent_seconds, correct');
      var allProgress = progressResult.data || [];

      // Calculate overall average time
      var allTimes = allProgress.filter(function (p) { return p.time_spent_seconds > 0; }).map(function (p) { return p.time_spent_seconds; });
      var overallAvgTime = allTimes.length > 0 ? Math.floor(allTimes.reduce(function (a, b) { return a + b; }, 0) / allTimes.length) : 600;

      return res.json({
        success: true,
        questions: puzzles.map(function (p) {
          var puzzleProgress = allProgress.filter(function (pr) { return pr.puzzle_id === p.id; });
          var completedCount = puzzleProgress.filter(function (pr) { return pr.status === 'COMPLETED'; }).length;
          var skippedCount = puzzleProgress.filter(function (pr) { return pr.status === 'SKIPPED'; }).length;
          var totalAttempts = puzzleProgress.reduce(function (sum, pr) { return sum + (pr.attempts || 0); }, 0);
          var times = puzzleProgress.filter(function (pr) { return pr.time_spent_seconds > 0; }).map(function (pr) { return pr.time_spent_seconds; });
          var avgTime = times.length > 0 ? Math.floor(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : 0;
          var minTime = times.length > 0 ? Math.min.apply(null, times) : 0;
          var maxTime = times.length > 0 ? Math.max.apply(null, times) : 0;

          return {
            id: p.id,
            title: p.title,
            level: p.level,
            puzzleNumber: p.puzzle_number,
            totalAttempts: totalAttempts,
            completedCount: completedCount,
            skippedCount: skippedCount,
            avgTime: avgTime,
            minTime: minTime,
            maxTime: maxTime,
            totalHintsUsed: 0
          };
        }),
        overallAvgTime: overallAvgTime
      });
    }

    // ─── GET /api/admin/game-settings ───
    if (req.method === 'GET' && path === '/game-settings') {
      // Return default game settings
      return res.json({
        success: true,
        settings: {
          skipPenaltySeconds: 300,
          hintPenalties: { 1: 60, 2: 120, 3: 180 },
          maxSkipsPerTeam: 3,
          maxHintsPerQuestion: 3,
          autoStartTimer: true,
          showLeaderboard: true,
          allowReturnToSkipped: true
        }
      });
    }

    // ─── PUT /api/admin/game-settings/:key ───
    var settingMatch = path.match(/^\/game-settings\/([^\/]+)$/);
    if (req.method === 'PUT' && settingMatch) {
      // For now, just acknowledge the update (actual implementation would store in DB)
      return res.json({ success: true, message: 'Setting updated' });
    }

    // ─── GET /api/admin/team-members ───
    if (req.method === 'GET' && path === '/team-members') {
      // Get all teams with their members
      const { data: teams, error: teamsErr } = await supabase
        .from('teams')
        .select('id, team_name, status, user_id')
        .order('created_at', { ascending: false });

      if (teamsErr) throw teamsErr;

      // Get all members in one query
      const { data: allMembers, error: membersErr } = await supabase
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: true });

      if (membersErr) throw membersErr;

      // Get all team leaders
      const userIds = teams.map(t => t.user_id).filter(Boolean);
      const { data: leaders } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);

      // Create a map of leaders
      var leaderMap = {};
      (leaders || []).forEach(function (leader) {
        leaderMap[leader.id] = leader;
      });

      // Group members by team
      var membersByTeam = {};
      (allMembers || []).forEach(function (member) {
        if (!membersByTeam[member.team_id]) {
          membersByTeam[member.team_id] = [];
        }
        membersByTeam[member.team_id].push(member);
      });

      // Combine everything
      var result = teams.map(function (team) {
        var leader = leaderMap[team.user_id];
        return {
          teamId: team.id,
          teamName: team.team_name,
          status: team.status,
          leader: leader ? {
            name: leader.name,
            email: leader.email
          } : null,
          members: membersByTeam[team.id] || [],
          totalMembers: (membersByTeam[team.id] || []).length
        };
      });

      return res.json({
        success: true,
        teams: result,
        totalTeams: result.length,
        totalMembers: (allMembers || []).length
      });
    }

    // ─── POST /api/admin/publish-results — Publish/unpublish final results ───
    // This triggers the celebration modal for top 3 teams
    if (req.method === 'POST' && path === '/publish-results') {
      const { publish } = req.body;
      const shouldPublish = publish !== false; // Default to true if not specified

      // Get the game_state ID
      const { data: existing } = await supabase
        .from('game_state')
        .select('id')
        .limit(1)
        .single();

      if (!existing) {
        return res.status(404).json({ error: 'Game state not found' });
      }

      // Update results_published flag
      const { error: updateError } = await supabase
        .from('game_state')
        .update({
          results_published: shouldPublish,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        // If column doesn't exist, inform admin to run migration
        if (updateError.message && updateError.message.includes('results_published')) {
          return res.status(400).json({
            error: 'Column "results_published" not found. Please run the migration: server/migrations/add-results-published.sql',
            migrationRequired: true
          });
        }
        console.error('Failed to update results_published:', updateError);
        return res.status(500).json({ error: 'Failed to update results status' });
      }

      return res.json({
        success: true,
        resultsPublished: shouldPublish,
        message: shouldPublish ? 'Results published! Top 3 teams will see celebration.' : 'Results unpublished.'
      });
    }

    // ─── GET /api/admin/results-status — Check if results are published ───
    if (req.method === 'GET' && path === '/results-status') {
      try {
        const { data: gameState, error } = await supabase
          .from('game_state')
          .select('results_published, game_ended_at')
          .limit(1)
          .single();

        // Handle case where column doesn't exist
        if (error && error.message && error.message.includes('results_published')) {
          return res.json({
            resultsPublished: false,
            gameEnded: false
          });
        }

        if (error) {
          return res.status(500).json({ error: 'Failed to fetch results status' });
        }

        return res.json({
          resultsPublished: gameState?.results_published || false,
          gameEnded: !!gameState?.game_ended_at
        });
      } catch (err) {
        console.error('Results status error:', err.message);
        return res.json({ resultsPublished: false, gameEnded: false });
      }
    }

    // ─── GET /api/admin/evaluation/level/:levelId/status — Get evaluation status ───
    var evalStatusMatch = path.match(/^\/evaluation\/level\/(\d+)\/status$/);
    if (req.method === 'GET' && evalStatusMatch) {
      var levelId = parseInt(evalStatusMatch[1]);

      // Get game state
      const { data: gameState } = await supabase
        .from('game_state')
        .select('*')
        .limit(1)
        .single();

      // Get submissions count for this level
      const { data: puzzles } = await supabase
        .from('puzzles')
        .select('id')
        .eq('level', levelId);

      var puzzleIds = (puzzles || []).map(function (p) { return p.id; });
      var totalSubmissions = 0;
      var pendingSubmissions = 0;
      var teamsWithSubmissions = 0;

      if (puzzleIds.length > 0) {
        const { count } = await supabase
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .in('puzzle_id', puzzleIds);
        totalSubmissions = count || 0;

        const { data: teamSubs } = await supabase
          .from('submissions')
          .select('team_id')
          .in('puzzle_id', puzzleIds);
        var uniqueTeams = {};
        (teamSubs || []).forEach(function (s) { uniqueTeams[s.team_id] = true; });
        teamsWithSubmissions = Object.keys(uniqueTeams).length;
      }

      // Get teams count
      const { count: totalTeams } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('level', levelId);

      // Determine evaluation state from game_state
      var evalState = 'IN_PROGRESS';
      if (gameState) {
        if (gameState.results_published) {
          evalState = 'RESULTS_PUBLISHED';
        } else if (gameState.game_ended_at) {
          evalState = 'SUBMISSIONS_CLOSED';
        }
      }

      return res.json({
        level: levelId,
        evaluation_state: evalState,
        submissions: {
          total_submissions: totalSubmissions,
          pending: pendingSubmissions,
          teams_with_submissions: teamsWithSubmissions
        },
        teams: {
          total: totalTeams || 0,
          qualified: 0,
          disqualified: 0
        },
        actions: {
          can_close_submissions: evalState === 'IN_PROGRESS',
          can_evaluate: evalState === 'SUBMISSIONS_CLOSED',
          can_publish: evalState === 'EVALUATING' || evalState === 'SUBMISSIONS_CLOSED'
        },
        timestamps: {
          submissions_closed_at: gameState?.game_ended_at || null,
          results_published_at: gameState?.results_published ? new Date().toISOString() : null
        }
      });
    }

    // ─── POST /api/admin/evaluation/level/:levelId/close-submissions ───
    var closeSubMatch = path.match(/^\/evaluation\/level\/(\d+)\/close-submissions$/);
    if (req.method === 'POST' && closeSubMatch) {
      var levelId = parseInt(closeSubMatch[1]);

      // Update game_state to mark submissions closed
      const { data: existing } = await supabase
        .from('game_state')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('game_state')
          .update({
            game_ended_at: new Date().toISOString(),
            game_active: false
          })
          .eq('id', existing.id);
      }

      // Count affected teams
      const { count: teamsAffected } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('level', levelId);

      return res.json({
        success: true,
        message: 'Submissions closed successfully',
        teams_affected: teamsAffected || 0,
        level: levelId
      });
    }

    // ─── POST /api/admin/evaluation/level/:levelId/reset-evaluation ───
    var resetEvalMatch = path.match(/^\/evaluation\/level\/(\d+)\/reset-evaluation$/);
    if (req.method === 'POST' && resetEvalMatch) {
      var levelId = parseInt(resetEvalMatch[1]);

      // Get puzzles for this level
      let puzzleIds = [];
      try {
        const { data: puzzles } = await supabase
          .from('puzzles').select('id').eq('level', levelId);
        puzzleIds = (puzzles || []).map(p => p.id);
      } catch (e) {
        console.log('Error fetching puzzles:', e.message);
      }

      // Reset all submissions for this level to PENDING
      if (puzzleIds.length > 0) {
        try {
          await supabase.from('submissions')
            .update({
              evaluation_status: 'PENDING',
              score_awarded: null,
              evaluated_at: null
            })
            .in('puzzle_id', puzzleIds);
        } catch (e) {
          console.log('Error resetting submissions:', e.message);
        }
      }

      // Reset team_level_status qualification (delete records for fresh start)
      try {
        await supabase.from('team_level_status')
          .delete()
          .eq('level_id', levelId);
      } catch (e) {
        console.log('Error deleting team_level_status:', e.message);
      }

      // Reset evaluation state to SUBMISSIONS_CLOSED
      try {
        await supabase.from('level_evaluation_state')
          .update({
            evaluation_state: 'SUBMISSIONS_CLOSED',
            evaluation_started_at: null,
            evaluated_at: null,
            evaluated_by: null,
            results_published_at: null,
            published_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('level_id', levelId);
      } catch (e) {
        console.log('Error updating level_evaluation_state:', e.message);
      }

      // Also update game_state to reset results_published (status endpoint reads from here)
      try {
        const { data: existing } = await supabase
          .from('game_state')
          .select('id')
          .limit(1)
          .single();

        if (existing) {
          await supabase
            .from('game_state')
            .update({
              results_published: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        }
      } catch (e) {
        console.log('Error updating game_state:', e.message);
      }

      return res.json({
        success: true,
        message: `Evaluation reset for Level ${levelId}. You can now re-evaluate.`
      });
    }

    // ─── POST /api/admin/evaluation/level/:levelId/reopen-submissions ───
    var reopenSubMatch = path.match(/^\/evaluation\/level\/(\d+)\/reopen-submissions$/);
    if (req.method === 'POST' && reopenSubMatch) {
      var levelId = parseInt(reopenSubMatch[1]);

      // Update game_state to reopen submissions
      const { data: existing } = await supabase
        .from('game_state')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('game_state')
          .update({
            game_ended_at: null,
            game_active: true
          })
          .eq('id', existing.id);
      }

      return res.json({
        success: true,
        message: 'Submissions reopened successfully',
        level: levelId
      });
    }

    // ─── POST /api/admin/evaluation/level/:levelId/evaluate ───
    var evaluateMatch = path.match(/^\/evaluation\/level\/(\d+)\/evaluate$/);
    if (req.method === 'POST' && evaluateMatch) {
      var levelId = parseInt(evaluateMatch[1]);

      let puzzleIds = [];
      try {
        const { data: puzzles } = await supabase.from('puzzles').select('id').eq('level', levelId);
        puzzleIds = (puzzles || []).map(p => p.id);
      } catch (e) { }

      let evalCount = 0;
      let correctCount = 0;

      if (puzzleIds.length > 0) {
        try {
          // Count how many we are evaluating
          const { data: subs } = await supabase.from('submissions')
            .select('is_correct')
            .in('puzzle_id', puzzleIds)
            .eq('evaluation_status', 'PENDING');

          evalCount = (subs || []).length;
          correctCount = (subs || []).filter(s => s.is_correct).length;

          // Update them
          await supabase.from('submissions')
            .update({ evaluation_status: 'EVALUATED', evaluated_at: new Date().toISOString() })
            .in('puzzle_id', puzzleIds)
            .eq('evaluation_status', 'PENDING');

          // Try updating level_evaluation_state if exists
          await supabase.from('level_evaluation_state')
            .update({ evaluation_state: 'EVALUATING' })
            .eq('level_id', levelId);
        } catch (e) { }
      }

      return res.json({
        success: true,
        message: 'Evaluation completed',
        level: levelId,
        stats: {
          submissions_evaluated: evalCount,
          correct_answers: correctCount
        }
      });
    }

    // ─── POST /api/admin/evaluation/level/:levelId/publish-results ───
    var publishMatch = path.match(/^\/evaluation\/level\/(\d+)\/publish-results$/);
    if (req.method === 'POST' && publishMatch) {
      var levelId = parseInt(publishMatch[1]);

      const { data: existing } = await supabase.from('game_state').select('id').limit(1).single();
      if (existing) {
        const { error } = await supabase.from('game_state')
          .update({ results_published: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (error) {
          // fallback if column missing
          console.log('game_state results_published update error:', error);
          await supabase.from('level_evaluation_state')
            .update({ evaluation_state: 'RESULTS_PUBLISHED', results_published_at: new Date().toISOString() })
            .eq('level_id', levelId);
        }
      } else {
        await supabase.from('level_evaluation_state')
          .update({ evaluation_state: 'RESULTS_PUBLISHED', results_published_at: new Date().toISOString() })
          .eq('level_id', levelId);
      }

      return res.json({
        success: true,
        message: 'Results published successfully',
        level: levelId
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
