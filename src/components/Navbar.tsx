import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Shield, Users, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BiohazardIcon } from "./BiohazardIcon";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/rules", label: "Rules" },
  { href: "/register", label: "Register" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-primary/10 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <BiohazardIcon className="w-8 h-8 text-primary group-hover:text-destructive transition-colors duration-300" />
            <div className="hidden sm:block">
              <span className="font-display text-sm tracking-widest text-foreground">
                RESIDENT EVIL
              </span>
              <span className="block text-[10px] font-terminal text-primary tracking-[0.3em]">
                LOCKDOWN
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-4 py-2 text-sm font-terminal uppercase tracking-wider transition-all duration-300",
                  location.pathname === link.href
                    ? "text-primary text-glow-toxic"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="gap-2">
                <LogIn className="w-4 h-4" />
                Login
              </Button>
            </Link>
            <Link to="/admin-login">
              <Button variant="terminal" size="sm" className="gap-2">
                <Shield className="w-4 h-4" />
                Admin
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-foreground"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-primary/10 animate-slide-up">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "px-4 py-3 text-sm font-terminal uppercase tracking-wider rounded-lg transition-all",
                    location.pathname === link.href
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex gap-2 mt-4 px-4">
                <Link to="/login" className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full gap-2">
                    <LogIn className="w-4 h-4" />
                    Login
                  </Button>
                </Link>
                <Link to="/admin-login" className="flex-1">
                  <Button variant="terminal" size="sm" className="w-full gap-2">
                    <Shield className="w-4 h-4" />
                    Admin
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

