// src/components/SuspiciousActivityPanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  Eye, 
  CheckCircle, 
  Clock,
  Zap,
  ArrowRightLeft,
  Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface SuspiciousAlert {
  id: string;
  team_id: string;
  team_name: string;
  alert_type: 'rapid_submission' | 'fast_solve' | 'tab_switch' | 'copy_paste' | 'pattern_match';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: Record<string, any> | null;
  is_reviewed: boolean;
  created_at: string;
}

const API_BASE = 'http://localhost:5000/api';

const fetchAlerts = async (unreviewedOnly: boolean): Promise<SuspiciousAlert[]> => {
  const accessToken = localStorage.getItem('accessToken');
  const response = await fetch(
    `${API_BASE}/admin/suspicious?unreviewedOnly=${unreviewedOnly}&limit=100`, 
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new Error('Failed to fetch alerts');
  return response.json();
};

const reviewAlert = async (alertId: string): Promise<void> => {
  const accessToken = localStorage.getItem('accessToken');
  const response = await fetch(`${API_BASE}/admin/suspicious/${alertId}/review`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to review alert');
};

const alertTypeIcons: Record<string, React.ReactNode> = {
  rapid_submission: <Zap className="w-4 h-4" />,
  fast_solve: <Clock className="w-4 h-4" />,
  tab_switch: <ArrowRightLeft className="w-4 h-4" />,
  copy_paste: <Copy className="w-4 h-4" />,
  pattern_match: <Eye className="w-4 h-4" />,
};

const severityColors: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-warning/20 text-warning border-warning/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-destructive/20 text-destructive border-destructive/30',
};

interface SuspiciousActivityPanelProps {
  showReviewed?: boolean;
  maxHeight?: string;
}

export const SuspiciousActivityPanel = ({ 
  showReviewed = false,
  maxHeight = '400px' 
}: SuspiciousActivityPanelProps) => {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['suspicious-alerts', !showReviewed],
    queryFn: () => fetchAlerts(!showReviewed),
    refetchInterval: 10000,
  });

  const reviewMutation = useMutation({
    mutationFn: reviewAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suspicious-alerts'] });
      toast.success('Alert marked as reviewed');
    },
    onError: () => {
      toast.error('Failed to review alert');
    }
  });

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isLoading) {
    return (
      <Card className="bg-background/50 border-destructive/20">
        <CardContent className="py-8">
          <div className="animate-pulse text-center text-muted-foreground">
            Loading alerts...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-background/50 border-destructive/20">
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            Failed to load alerts
          </div>
        </CardContent>
      </Card>
    );
  }

  const unreviewedCount = alerts?.filter(a => !a.is_reviewed).length || 0;

  return (
    <Card className="bg-background/50 border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-destructive font-terminal">
            <AlertTriangle className="w-4 h-4" />
            SUSPICIOUS ACTIVITY
          </span>
          {unreviewedCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreviewedCount} unreviewed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ maxHeight }}>
          <div className="space-y-3">
            {alerts?.map((alert) => {
              const icon = alertTypeIcons[alert.alert_type] || <AlertTriangle className="w-4 h-4" />;
              const severityClass = severityColors[alert.severity] || severityColors.medium;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    alert.is_reviewed 
                      ? "border-muted/20 bg-muted/5 opacity-60"
                      : severityClass
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        "p-1.5 rounded",
                        alert.is_reviewed ? "bg-muted/20" : "bg-background/50"
                      )}>
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-terminal text-sm">
                            {alert.team_name}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px]", !alert.is_reviewed && severityClass)}
                          >
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alert.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {alert.alert_type.replace('_', ' ')} • {formatTime(alert.created_at)}
                        </p>
                      </div>
                    </div>

                    {!alert.is_reviewed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => reviewMutation.mutate(alert.id)}
                        disabled={reviewMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {(!alerts || alerts.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No suspicious activity detected</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default SuspiciousActivityPanel;
