import { cn } from "@/lib/utils";
import { ReactNode, CSSProperties } from "react";

interface TerminalCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  status?: "active" | "warning" | "danger" | "offline";
  scanLine?: boolean;
  style?: CSSProperties;
}

export const TerminalCard = ({ 
  children, 
  className,
  title,
  status = "active",
  scanLine = false,
  style
}: TerminalCardProps) => {
  const statusColors = {
    active: "border-primary/30 bg-primary/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
    offline: "border-muted-foreground/20 bg-muted/5"
  };

  const statusIndicator = {
    active: "bg-primary",
    warning: "bg-warning",
    danger: "bg-destructive",
    offline: "bg-muted-foreground"
  };

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg border backdrop-blur-sm",
        statusColors[status],
        scanLine && "scan-line",
        className
      )}
      style={style}
    >
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      {/* Header */}
      {title && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/10">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", statusIndicator[status])} />
          <span className="text-xs font-terminal uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
        </div>
      )}
      
      {/* Content */}
      <div className="p-4">
        {children}
      </div>

      {/* Corner brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-primary/30" />
      <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-primary/30" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-primary/30" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-primary/30" />
    </div>
  );
};

