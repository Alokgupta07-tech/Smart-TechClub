// src/components/AchievementBadge.tsx
import { useState } from 'react';
import { Trophy, Zap, Clock, Brain, Shield, Database, Star, Lightbulb, Timer, TrendingUp, Sunrise, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: 'speed' | 'accuracy' | 'milestone' | 'special';
  earned: boolean;
  awarded_at?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  trophy: <Trophy className="w-6 h-6" />,
  zap: <Zap className="w-6 h-6" />,
  clock: <Clock className="w-6 h-6" />,
  brain: <Brain className="w-6 h-6" />,
  shield: <Shield className="w-6 h-6" />,
  database: <Database className="w-6 h-6" />,
  star: <Star className="w-6 h-6" />,
  lightbulb: <Lightbulb className="w-6 h-6" />,
  timer: <Timer className="w-6 h-6" />,
  'trending-up': <TrendingUp className="w-6 h-6" />,
  sunrise: <Sunrise className="w-6 h-6" />,
};

const categoryColors: Record<string, string> = {
  speed: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  accuracy: 'text-green-400 border-green-400/30 bg-green-400/10',
  milestone: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  special: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
};

export const AchievementBadge = ({ achievement }: { achievement: Achievement }) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const icon = iconMap[achievement.icon] || <Trophy className="w-6 h-6" />;
  const colorClass = categoryColors[achievement.category] || categoryColors.milestone;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "relative p-3 rounded-lg border-2 transition-all cursor-pointer",
            achievement.earned
              ? cn(colorClass, "hover:scale-105")
              : "border-muted/30 bg-muted/5 text-muted-foreground opacity-50",
            isAnimating && "animate-pulse"
          )}
          onClick={() => {
            if (achievement.earned) {
              setIsAnimating(true);
              setTimeout(() => setIsAnimating(false), 500);
            }
          }}
        >
          {/* Lock overlay for unearned */}
          {!achievement.earned && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
              <Lock className="w-4 h-4 text-muted-foreground" />
            </div>
          )}

          {/* Icon */}
          <div className={cn(
            "flex items-center justify-center",
            achievement.earned && "drop-shadow-glow"
          )}>
            {icon}
          </div>

          {/* Points badge */}
          {achievement.earned && (
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              +{achievement.points}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="font-bold text-sm">{achievement.name}</p>
          <p className="text-xs text-muted-foreground">{achievement.description}</p>
          {achievement.earned && achievement.awarded_at && (
            <p className="text-[10px] text-primary">
              Earned: {new Date(achievement.awarded_at).toLocaleDateString()}
            </p>
          )}
          {!achievement.earned && (
            <p className="text-[10px] text-muted-foreground italic">Not yet earned</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export const AchievementGrid = ({ achievements }: { achievements: Achievement[] }) => {
  const earned = achievements.filter(a => a.earned);
  const totalPoints = earned.reduce((sum, a) => sum + a.points, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <span className="font-terminal text-sm">
            {earned.length}/{achievements.length} Achievements
          </span>
        </div>
        <div className="text-sm font-mono text-primary">
          {totalPoints} pts
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-3">
        {achievements.map(achievement => (
          <AchievementBadge key={achievement.id} achievement={achievement} />
        ))}
      </div>
    </div>
  );
};

export default AchievementBadge;
