// src/contexts/NotificationContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Trophy, AlertTriangle, Radio, TrendingUp, Lightbulb } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Notification {
  id: string;
  team_id: string;
  notification_type: 'broadcast' | 'hint_penalty' | 'rank_change' | 'achievement' | 'warning' | 'system';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_read: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const fetchUnreadNotifications = async (): Promise<{ count: number; notifications: Notification[] }> => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return { count: 0, notifications: [] };
  
  const response = await fetchWithAuth(`${API_BASE}/notifications/unread`);
  
  if (!response.ok) {
    if (response.status === 401) return { count: 0, notifications: [] };
    throw new Error('Failed to fetch notifications');
  }
  
  return response.json();
};

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'broadcast': return <Radio className="w-4 h-4" />;
    case 'achievement': return <Trophy className="w-4 h-4 text-yellow-400" />;
    case 'rank_change': return <TrendingUp className="w-4 h-4 text-success" />;
    case 'hint_penalty': return <Lightbulb className="w-4 h-4 text-warning" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-destructive" />;
    default: return <Bell className="w-4 h-4" />;
  }
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [shownNotifications, setShownNotifications] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: fetchUnreadNotifications,
    refetchInterval: 15000, // Check every 15 seconds (reduced from 5 for scalability)
    staleTime: 10000,
    enabled: !!localStorage.getItem('accessToken'), // Don't poll when not logged in
  });

  // Show toast for new notifications
  useEffect(() => {
    if (data?.notifications) {
      data.notifications.forEach((notification) => {
        if (!shownNotifications.has(notification.id)) {
          // Show toast based on priority
          const toastFn = notification.priority === 'urgent' || notification.priority === 'high'
            ? toast.warning
            : toast.info;

          toastFn(notification.title, {
            description: notification.message,
            icon: getNotificationIcon(notification.notification_type),
            duration: notification.priority === 'urgent' ? 10000 : 5000,
          });

          setShownNotifications(prev => new Set([...prev, notification.id]));
        }
      });
    }
  }, [data?.notifications, shownNotifications]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await fetchWithAuth(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await fetchWithAuth(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success('All notifications marked as read');
    }
  });

  const markAsRead = useCallback((notificationId: string) => {
    markAsReadMutation.mutate(notificationId);
  }, [markAsReadMutation]);

  const markAllAsRead = useCallback(() => {
    markAllAsReadMutation.mutate();
  }, [markAllAsReadMutation]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: data?.notifications || [],
        unreadCount: data?.count || 0,
        isLoading,
        markAsRead,
        markAllAsRead,
        refetch,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
