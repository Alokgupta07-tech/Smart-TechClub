// src/components/GameStartModal.tsx
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Skull, Timer, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface GameStartModalProps {
  isOpen: boolean;
  onStart: () => void;
  countdownSeconds?: number;
}

export const GameStartModal = ({ 
  isOpen, 
  onStart, 
  countdownSeconds = 10 
}: GameStartModalProps) => {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [phase, setPhase] = useState<'intro' | 'countdown' | 'starting'>('intro');
  const [glitchText, setGlitchText] = useState('LOCKDOWN HQ');

  // Glitch effect
  useEffect(() => {
    if (phase !== 'countdown') return;

    const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const originalText = 'LOCKDOWN HQ';
    
    const interval = setInterval(() => {
      const glitched = originalText
        .split('')
        .map((char, i) => {
          if (Math.random() > 0.7) {
            return glitchChars[Math.floor(Math.random() * glitchChars.length)];
          }
          return char;
        })
        .join('');
      setGlitchText(glitched);
    }, 100);

    return () => {
      clearInterval(interval);
      setGlitchText('LOCKDOWN HQ');
    };
  }, [phase]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (countdown <= 0) {
      setPhase('starting');
      const startTimer = setTimeout(() => {
        onStart();
      }, 1000);
      return () => clearTimeout(startTimer);
    }

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, phase, onStart]);

  const handleReady = useCallback(() => {
    setPhase('countdown');
    setCountdown(countdownSeconds);
  }, [countdownSeconds]);

  return (
    <Dialog open={isOpen}>
      <DialogContent 
        className="max-w-2xl bg-black/95 border-destructive/50 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Scan lines effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] opacity-20" />
        
        {/* Warning stripes */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#ff0000,#ff0000_10px,#000_10px,#000_20px)]" />
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#ff0000,#ff0000_10px,#000_10px,#000_20px)]" />

        <div className="relative py-8 px-4 text-center space-y-6">
          {/* Logo / Title */}
          <div className={cn(
            "transition-all duration-300",
            phase === 'countdown' && "animate-pulse"
          )}>
            <Skull className={cn(
              "w-20 h-20 mx-auto mb-4",
              phase === 'intro' && "text-destructive",
              phase === 'countdown' && "text-warning animate-bounce",
              phase === 'starting' && "text-success"
            )} />
            <h1 className={cn(
              "text-4xl font-display tracking-widest",
              phase === 'countdown' && "text-warning glitch",
              phase !== 'countdown' && "text-destructive"
            )}>
              {phase === 'countdown' ? glitchText : 'LOCKDOWN HQ'}
            </h1>
            <p className="text-muted-foreground font-terminal text-sm mt-2">
              BREACH PROTOCOL INITIATED
            </p>
          </div>

          {/* Intro Phase */}
          {phase === 'intro' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-terminal text-sm">SECURITY ALERT</span>
                <AlertTriangle className="w-5 h-5" />
              </div>
              
              <div className="text-left space-y-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <p className="text-sm text-muted-foreground">
                  You are about to infiltrate a high-security facility. 
                  Your mission: breach the firewall and access the mainframe.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">▸</span> Solve puzzles to progress
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">▸</span> Use hints wisely (time penalties apply)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">▸</span> Watch the clock - time is critical
                  </li>
                </ul>
              </div>

              <Button 
                variant="destructive" 
                size="lg" 
                onClick={handleReady}
                className="gap-2 font-terminal"
              >
                <Play className="w-5 h-5" />
                INITIATE BREACH
              </Button>
            </div>
          )}

          {/* Countdown Phase */}
          {phase === 'countdown' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-warning font-terminal text-sm animate-pulse">
                SYSTEM OVERRIDE IN PROGRESS
              </div>
              
              <div className={cn(
                "text-8xl font-mono font-bold",
                countdown <= 3 ? "text-destructive animate-bounce" : "text-warning"
              )}>
                {countdown}
              </div>

              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Timer className="w-4 h-4 animate-spin" />
                <span className="font-terminal text-xs">INITIALIZING BREACH PROTOCOL...</span>
              </div>

              {/* Progress bars */}
              <div className="space-y-2 max-w-xs mx-auto">
                <div className="h-1 bg-primary/20 rounded overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-1000"
                    style={{ width: `${((countdownSeconds - countdown) / countdownSeconds) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Starting Phase */}
          {phase === 'starting' && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-success font-terminal animate-pulse">
                ACCESS GRANTED
              </div>
              <p className="text-2xl font-display text-success">
                BREACH SUCCESSFUL
              </p>
              <p className="text-xs text-muted-foreground">
                Entering secure facility...
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GameStartModal;
