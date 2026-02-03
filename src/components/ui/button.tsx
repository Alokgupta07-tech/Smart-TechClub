import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_25px_hsl(var(--primary)/0.5)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_15px_hsl(var(--destructive)/0.3)] hover:shadow-[0_0_25px_hsl(var(--destructive)/0.5)]",
        outline: "border border-primary/30 bg-background/50 hover:bg-primary/10 hover:border-primary/50 text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-primary/10 hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        // Custom Resident Evil themed variants
        toxic: "bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground font-display uppercase tracking-wider shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5",
        blood: "bg-gradient-to-r from-destructive to-rose-600 text-destructive-foreground font-display uppercase tracking-wider shadow-[0_0_20px_hsl(var(--destructive)/0.4)] hover:shadow-[0_0_30px_hsl(var(--destructive)/0.6)] hover:-translate-y-0.5",
        cyber: "bg-gradient-to-r from-accent to-blue-500 text-accent-foreground font-display uppercase tracking-wider shadow-[0_0_20px_hsl(var(--accent)/0.4)] hover:shadow-[0_0_30px_hsl(var(--accent)/0.6)] hover:-translate-y-0.5",
        terminal: "bg-background border border-primary/40 text-primary font-terminal hover:bg-primary/10 hover:border-primary/60",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-8 text-base",
        xl: "h-14 rounded-lg px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

