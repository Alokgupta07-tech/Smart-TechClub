import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  targetDate: Date;
  className?: string;
  onComplete?: () => void;
}

interface TimeUnit {
  value: number;
  label: string;
}

export const CountdownTimer = ({ 
  targetDate, 
  className,
  onComplete 
}: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState<TimeUnit[]>([]);
  const completedFiredRef = useRef(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();
      
      if (difference <= 0) {
        if (!completedFiredRef.current) {
          completedFiredRef.current = true;
          onComplete?.();
        }
        return [
          { value: 0, label: "DAYS" },
          { value: 0, label: "HRS" },
          { value: 0, label: "MIN" },
          { value: 0, label: "SEC" }
        ];
      }

      return [
        { value: Math.floor(difference / (1000 * 60 * 60 * 24)), label: "DAYS" },
        { value: Math.floor((difference / (1000 * 60 * 60)) % 24), label: "HRS" },
        { value: Math.floor((difference / 1000 / 60) % 60), label: "MIN" },
        { value: Math.floor((difference / 1000) % 60), label: "SEC" }
      ];
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  return (
    <div className={cn("flex gap-3 md:gap-6", className)}>
      {timeLeft.map((unit, index) => (
        <div key={unit.label} className="flex flex-col items-center relative">
          <div className="relative">
            <div className="w-16 h-20 md:w-24 md:h-28 flex items-center justify-center rounded-lg border border-primary/30 bg-background/50 backdrop-blur-sm">
              <span className="text-2xl md:text-4xl font-display font-bold text-primary text-glow-toxic">
                {String(unit.value).padStart(2, "0")}
              </span>
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-lg bg-primary/5 blur-xl -z-10" />
          </div>
          <span className="mt-2 text-xs font-terminal text-muted-foreground tracking-widest">
            {unit.label}
          </span>
          {index < timeLeft.length - 1 && (
            <span className="absolute -right-2 md:-right-4 top-1/3 text-2xl text-primary/50 hidden md:block">:</span>
          )}
        </div>
      ))}
    </div>
  );
};

