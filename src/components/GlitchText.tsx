import { cn } from "@/lib/utils";

interface GlitchTextProps {
  children: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
}

export const GlitchText = ({ 
  children, 
  className, 
  as: Component = "span" 
}: GlitchTextProps) => {
  return (
    <Component 
      className={cn("glitch font-display", className)} 
      data-text={children}
    >
      {children}
    </Component>
  );
};

