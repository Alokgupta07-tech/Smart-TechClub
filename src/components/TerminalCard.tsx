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
    active: "border-green-500/30 bg-green-500/5",
    warning: "border-yellow-500/30 bg-yellow-500/5",
    danger: "border-red-500/30 bg-red-500/5",
    offline: "border-gray-500/20 bg-gray-500/5"
  };

  const statusIndicator = {
    active: "bg-green-500",
    warning: "bg-yellow-500",
    danger: "bg-red-500",
    offline: "bg-gray-500"
  };

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg border backdrop-blur-sm text-gray-100",
        statusColors[status],
        scanLine && "scan-line",
        className
      )}
      style={style}
    >
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
      
      {/* Header */}
      {title && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-green-500/10">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", statusIndicator[status])} />
          <span className="text-xs font-terminal uppercase tracking-widest text-gray-400">
            {title}
          </span>
        </div>
      )}
      
      {/* Content */}
      <div className="p-4">
        {children}
      </div>

      {/* Corner brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-green-500/30" />
      <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-green-500/30" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-green-500/30" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-green-500/30" />
    </div>
  );
};

