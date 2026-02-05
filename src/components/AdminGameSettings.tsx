/**
 * Admin Game Settings Panel
 * =========================
 * Controls for skip/leave question functionality
 * 
 * Features:
 * - Enable/Disable skipping
 * - Max skips per team
 * - Time penalty per skip
 * - Real-time settings update
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  SkipForward,
  Clock,
  AlertTriangle,
  Save,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Info,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const API_BASE = 'http://localhost:5000/api';

interface GameSetting {
  key: string;
  value: string | number | boolean;
  type: 'boolean' | 'number' | 'string';
  description: string;
}

interface SettingsResponse {
  success: boolean;
  settings: Record<string, GameSetting>;
}

const defaultSettings: Record<string, GameSetting> = {
  skip_enabled: {
    key: 'skip_enabled',
    value: true,
    type: 'boolean',
    description: 'Allow teams to skip questions',
  },
  max_skips_per_team: {
    key: 'max_skips_per_team',
    value: 3,
    type: 'number',
    description: 'Maximum number of questions a team can skip',
  },
  skip_penalty_seconds: {
    key: 'skip_penalty_seconds',
    value: 120,
    type: 'number',
    description: 'Time penalty (in seconds) for each skip',
  },
  hint_penalty_seconds: {
    key: 'hint_penalty_seconds',
    value: 60,
    type: 'number',
    description: 'Time penalty (in seconds) for using a hint',
  },
  time_per_question_seconds: {
    key: 'time_per_question_seconds',
    value: 600,
    type: 'number',
    description: 'Default time limit per question (in seconds)',
  },
  pause_enabled: {
    key: 'pause_enabled',
    value: false,
    type: 'boolean',
    description: 'Allow teams to pause their timer (admin-controlled)',
  },
  auto_skip_on_timeout: {
    key: 'auto_skip_on_timeout',
    value: false,
    type: 'boolean',
    description: 'Automatically skip question when time runs out',
  },
};

export function AdminGameSettings() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Record<string, GameSetting>>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Fetch current settings
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gameSettings'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/admin/game-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data: SettingsResponse = await response.json();
      return data.settings;
    },
  });
  
  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | number | boolean }) => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/admin/game-settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });
      
      if (!response.ok) throw new Error('Failed to update setting');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameSettings'] });
    },
  });
  
  // Sync local settings with server data
  useEffect(() => {
    if (data) {
      const merged = { ...defaultSettings };
      Object.keys(data).forEach(key => {
        if (merged[key]) {
          merged[key] = { ...merged[key], value: data[key].value };
        }
      });
      setLocalSettings(merged);
      setHasChanges(false);
    }
  }, [data]);
  
  // Handle setting change
  const handleChange = (key: string, value: string | number | boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
    setHasChanges(true);
  };
  
  // Save all changes
  const saveAllChanges = async () => {
    const promises = Object.keys(localSettings).map(key => {
      const serverValue = data?.[key]?.value;
      const localValue = localSettings[key].value;
      
      if (serverValue !== localValue) {
        return updateSettingMutation.mutateAsync({ key, value: localValue });
      }
      return Promise.resolve();
    });
    
    await Promise.all(promises);
    setHasChanges(false);
  };
  
  // Format time helper
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };
  
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-800 rounded-lg"></div>
        <div className="h-40 bg-gray-800 rounded-lg"></div>
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5 text-toxic-green" />
              Game Settings
            </h3>
            <p className="text-sm text-gray-400">
              Configure skip functionality and time penalties
            </p>
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
              onClick={saveAllChanges}
              disabled={!hasChanges || updateSettingMutation.isPending}
              className={cn(
                'bg-toxic-green text-black hover:bg-toxic-green/80',
                !hasChanges && 'opacity-50'
              )}
            >
              <Save className="w-4 h-4 mr-2" />
              {updateSettingMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
        
        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            You have unsaved changes
          </div>
        )}
        
        {/* Skip Settings */}
        <Card className="bg-gray-900/50 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SkipForward className="w-5 h-5 text-orange-400" />
              Skip Question Settings
            </CardTitle>
            <CardDescription>
              Control how teams can skip questions during gameplay
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Skip Enabled Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  Enable Skip Feature
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      When disabled, teams cannot skip any questions
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <p className="text-xs text-gray-400">
                  {localSettings.skip_enabled.description}
                </p>
              </div>
              <button
                onClick={() => handleChange('skip_enabled', !localSettings.skip_enabled.value)}
                className="flex items-center"
              >
                {localSettings.skip_enabled.value ? (
                  <ToggleRight className="w-12 h-6 text-toxic-green" />
                ) : (
                  <ToggleLeft className="w-12 h-6 text-gray-500" />
                )}
              </button>
            </div>
            
            {/* Max Skips */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Max Skips Per Team
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Total number of skips allowed per team for entire game
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={localSettings.max_skips_per_team.value as number}
                  onChange={(e) => handleChange('max_skips_per_team', parseInt(e.target.value) || 0)}
                  className="bg-gray-800 border-gray-600"
                  disabled={!localSettings.skip_enabled.value}
                />
                <p className="text-xs text-gray-400">
                  {localSettings.max_skips_per_team.description}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Skip Penalty (seconds)
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Time added to team's total for each skip
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="30"
                  value={localSettings.skip_penalty_seconds.value as number}
                  onChange={(e) => handleChange('skip_penalty_seconds', parseInt(e.target.value) || 0)}
                  className="bg-gray-800 border-gray-600"
                  disabled={!localSettings.skip_enabled.value}
                />
                <p className="text-xs text-gray-400">
                  Current: {formatTime(localSettings.skip_penalty_seconds.value as number)} per skip
                </p>
              </div>
            </div>
            
            {/* Auto-skip on timeout */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  Auto-Skip on Timeout
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Automatically skip question when time limit is reached
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <p className="text-xs text-gray-400">
                  {localSettings.auto_skip_on_timeout.description}
                </p>
              </div>
              <button
                onClick={() => handleChange('auto_skip_on_timeout', !localSettings.auto_skip_on_timeout.value)}
                className="flex items-center"
                disabled={!localSettings.skip_enabled.value}
              >
                {localSettings.auto_skip_on_timeout.value ? (
                  <ToggleRight className="w-12 h-6 text-toxic-green" />
                ) : (
                  <ToggleLeft className="w-12 h-6 text-gray-500" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>
        
        {/* Time Settings */}
        <Card className="bg-gray-900/50 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              Time Settings
            </CardTitle>
            <CardDescription>
              Configure time limits and penalties
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Time Per Question (seconds)
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Default time limit for each question
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  min="60"
                  step="60"
                  value={localSettings.time_per_question_seconds.value as number}
                  onChange={(e) => handleChange('time_per_question_seconds', parseInt(e.target.value) || 600)}
                  className="bg-gray-800 border-gray-600"
                />
                <p className="text-xs text-gray-400">
                  Current: {formatTime(localSettings.time_per_question_seconds.value as number)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Hint Penalty (seconds)
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Time added to team's total for using a hint
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="15"
                  value={localSettings.hint_penalty_seconds.value as number}
                  onChange={(e) => handleChange('hint_penalty_seconds', parseInt(e.target.value) || 0)}
                  className="bg-gray-800 border-gray-600"
                />
                <p className="text-xs text-gray-400">
                  Current: {formatTime(localSettings.hint_penalty_seconds.value as number)} per hint
                </p>
              </div>
            </div>
            
            {/* Pause Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-yellow-400" />
                  Admin Pause Control
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Allow admin to pause timers for all teams
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <p className="text-xs text-gray-400">
                  {localSettings.pause_enabled.description}
                </p>
              </div>
              <button
                onClick={() => handleChange('pause_enabled', !localSettings.pause_enabled.value)}
                className="flex items-center"
              >
                {localSettings.pause_enabled.value ? (
                  <ToggleRight className="w-12 h-6 text-toxic-green" />
                ) : (
                  <ToggleLeft className="w-12 h-6 text-gray-500" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>
        
        {/* Settings Summary */}
        <div className="p-4 bg-gray-900/30 border border-gray-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Current Configuration Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Skip Feature:</span>
              <span className={cn(
                'ml-2 font-medium',
                localSettings.skip_enabled.value ? 'text-green-400' : 'text-red-400'
              )}>
                {localSettings.skip_enabled.value ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Max Skips:</span>
              <span className="ml-2 font-medium text-white">
                {localSettings.max_skips_per_team.value as number}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Skip Penalty:</span>
              <span className="ml-2 font-medium text-orange-400">
                {formatTime(localSettings.skip_penalty_seconds.value as number)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Time/Question:</span>
              <span className="ml-2 font-medium text-toxic-green">
                {formatTime(localSettings.time_per_question_seconds.value as number)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default AdminGameSettings;
