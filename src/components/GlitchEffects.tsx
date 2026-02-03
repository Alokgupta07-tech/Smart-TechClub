import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface GlitchEffectProps {
  trigger: boolean;
  onComplete?: () => void;
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
  className?: string;
}

export const GlitchEffect = ({
  trigger,
  onComplete,
  children,
  intensity = 'medium',
  className
}: GlitchEffectProps) => {
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsGlitching(true);
      const duration = intensity === 'low' ? 300 : intensity === 'medium' ? 600 : 1000;
      
      const timer = setTimeout(() => {
        setIsGlitching(false);
        if (onComplete) {
          onComplete();
        }
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [trigger, intensity, onComplete]);

  const intensityClasses = {
    low: 'glitch-subtle',
    medium: 'glitch-moderate',
    high: 'glitch-intense'
  };

  return (
    <div className={cn(
      'relative',
      isGlitching && intensityClasses[intensity],
      isGlitching && 'animate-glitch-shake',
      className
    )}>
      {children}
      {isGlitching && (
        <>
          {/* Red glitch layer */}
          <div className="absolute inset-0 pointer-events-none opacity-70 mix-blend-screen animate-glitch-1"
               style={{ clipPath: 'inset(0 0 75% 0)' }}>
            <div className="filter-glitch-red">
              {children}
            </div>
          </div>
          {/* Blue glitch layer */}
          <div className="absolute inset-0 pointer-events-none opacity-70 mix-blend-screen animate-glitch-2"
               style={{ clipPath: 'inset(75% 0 0 0)' }}>
            <div className="filter-glitch-blue">
              {children}
            </div>
          </div>
          {/* Scanlines */}
          <div className="absolute inset-0 pointer-events-none opacity-30 animate-scanline"
               style={{
                 background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.1) 2px, rgba(255, 0, 0, 0.1) 4px)',
               }}
          />
        </>
      )}
    </div>
  );
};

interface WrongAnswerEffectProps {
  show: boolean;
}

export const WrongAnswerEffect = ({ show }: WrongAnswerEffectProps) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 animate-fade-out">
      {/* Red flash overlay */}
      <div className="absolute inset-0 bg-red-500/20 animate-flash" />
      
      {/* Glitch bars */}
      <div className="absolute inset-0">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-full h-1 bg-red-500/50 animate-glitch-bar"
            style={{
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 200}ms`,
            }}
          />
        ))}
      </div>

      {/* Screen shake border */}
      <div className="absolute inset-0 border-4 border-red-500/50 animate-shake" />

      {/* Error text overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-red-500 font-terminal text-4xl md:text-6xl font-bold animate-glitch-text">
          ACCESS DENIED
        </div>
      </div>
    </div>
  );
};

interface SuccessEffectProps {
  show: boolean;
}

export const SuccessEffect = ({ show }: SuccessEffectProps) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 animate-fade-out-slow">
      {/* Green pulse overlay */}
      <div className="absolute inset-0 bg-toxic-green/10 animate-pulse-once" />
      
      {/* Success particles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-toxic-green rounded-full animate-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 500}ms`,
            }}
          />
        ))}
      </div>

      {/* Success text overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-toxic-green font-terminal text-4xl md:text-6xl font-bold animate-scale-in">
          ✓ ACCESS GRANTED
        </div>
      </div>
    </div>
  );
};

