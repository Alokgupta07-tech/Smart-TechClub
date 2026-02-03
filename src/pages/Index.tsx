import { Link } from "react-router-dom";
import { 
  Users, 
  Clock, 
  Trophy, 
  Zap, 
  Shield, 
  AlertTriangle,
  ChevronRight,
  Terminal,
  Lock,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GlitchText } from "@/components/GlitchText";
import { TerminalCard } from "@/components/TerminalCard";
import { CountdownTimer } from "@/components/CountdownTimer";
import { BiohazardIcon } from "@/components/BiohazardIcon";

// Event date - set to 7 days from now for demo
const EVENT_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const features = [
  {
    icon: Terminal,
    title: "FIREWALL BREACH",
    description: "Navigate through encrypted systems and bypass security protocols in Level 1.",
    status: "active" as const
  },
  {
    icon: Lock,
    title: "THE MAINFRAME",
    description: "Crack the core system, decode the final puzzles, and escape the lockdown.",
    status: "warning" as const
  },
  {
    icon: Users,
    title: "TEAM TACTICS",
    description: "Form a 4-member squad. Collaborate, strategize, and conquer together.",
    status: "active" as const
  },
  {
    icon: Clock,
    title: "RACE AGAINST TIME",
    description: "4 hours to complete both levels. Every second counts in the leaderboard.",
    status: "danger" as const
  }
];

const stats = [
  { value: "150+", label: "PARTICIPANTS" },
  { value: "4", label: "HOURS" },
  { value: "2", label: "LEVELS" },
  { value: "∞", label: "PUZZLES" }
];

const rules = [
  "Teams of exactly 4 members required",
  "No external help or resources allowed",
  "Limited hints available (with time penalty)",
  "Organizer's decision is final",
  "Fair play policy strictly enforced"
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background Effects */}
        <div className="absolute inset-0 grid-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-background" />
        
        {/* Animated Particles */}
        <div className="absolute top-20 left-10 w-2 h-2 bg-primary rounded-full animate-float opacity-50" />
        <div className="absolute top-40 right-20 w-1 h-1 bg-accent rounded-full animate-float opacity-30" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-40 left-1/4 w-1.5 h-1.5 bg-destructive rounded-full animate-float opacity-40" style={{ animationDelay: "0.5s" }} />
        
        <div className="container mx-auto px-4 py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            {/* Biohazard Icon */}
            <div className="flex justify-center mb-8">
              <BiohazardIcon 
                className="w-24 h-24 md:w-32 md:h-32 text-primary animate-pulse-glow" 
                animated 
              />
            </div>

            {/* Event Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-destructive/30 bg-destructive/10 mb-6">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-xs font-terminal uppercase tracking-widest text-destructive">
                BIOHAZARD ALERT: LOCKDOWN INITIATED
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-4">
              <GlitchText className="text-foreground">RESIDENT EVIL</GlitchText>
            </h1>
            <h2 className="text-xl md:text-3xl font-display tracking-[0.3em] text-primary text-glow-toxic mb-8">
              WELCOME TO THE LOCKDOWN
            </h2>

            {/* Description */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 font-terminal">
              A cyber escape room competition where logic meets chaos. 
              <span className="text-primary"> Breach the firewall</span>, 
              <span className="text-accent"> crack the mainframe</span>, and 
              <span className="text-destructive"> escape the lockdown</span>.
            </p>

            {/* Countdown */}
            <div className="mb-12 flex flex-col items-center">
              <p className="text-sm font-terminal text-muted-foreground mb-4 tracking-widest">
                EVENT STARTS IN
              </p>
              <CountdownTimer targetDate={EVENT_DATE} />
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button variant="toxic" size="xl" className="gap-2 w-full sm:w-auto">
                  <Users className="w-5 h-5" />
                  REGISTER YOUR TEAM
                </Button>
              </Link>
              <Link to="/rules">
                <Button variant="outline" size="xl" className="gap-2 w-full sm:w-auto">
                  <Eye className="w-5 h-5" />
                  VIEW RULES
                </Button>
              </Link>
            </div>

            {/* Organizer */}
            <p className="mt-12 text-sm text-muted-foreground font-terminal">
              ORGANIZED BY <span className="text-primary">SMART TECH CLUB</span>
            </p>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-primary/30 flex items-start justify-center p-2">
            <div className="w-1 h-3 bg-primary rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-y border-primary/10 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-display font-bold text-primary text-glow-toxic mb-2">
                  {stat.value}
                </div>
                <div className="text-xs font-terminal text-muted-foreground tracking-widest">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 hex-pattern opacity-50" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              <span className="gradient-text-toxic">MISSION BRIEFING</span>
            </h2>
            <p className="text-muted-foreground font-terminal max-w-xl mx-auto">
              Understand the challenge ahead. Two levels. One goal. Zero room for error.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {features.map((feature, index) => (
              <TerminalCard 
                key={index} 
                title={`MODULE ${String(index + 1).padStart(2, "0")}`}
                status={feature.status}
                className="hover:border-primary/50 transition-all duration-300 group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </TerminalCard>
            ))}
          </div>
        </div>
      </section>

      {/* Rules Preview */}
      <section className="py-24 bg-card/30 border-y border-primary/10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 mb-6">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-terminal uppercase tracking-widest text-primary">
                    PROTOCOL
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
                  RULES OF <span className="text-primary text-glow-toxic">ENGAGEMENT</span>
                </h2>
                <p className="text-muted-foreground mb-8">
                  Fair play is mandatory. Breaking protocols will result in immediate disqualification. 
                  Read the full rules before registering your team.
                </p>
                <Link to="/rules">
                  <Button variant="terminal" className="gap-2">
                    READ FULL RULES
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>

              <TerminalCard title="QUICK RULES" status="warning" scanLine>
                <ul className="space-y-3">
                  {rules.map((rule, index) => (
                    <li key={index} className="flex items-start gap-3 text-sm">
                      <span className="text-primary font-terminal">{String(index + 1).padStart(2, "0")}.</span>
                      <span className="text-muted-foreground">{rule}</span>
                    </li>
                  ))}
                </ul>
              </TerminalCard>
            </div>
          </div>
        </div>
      </section>

      {/* Prize Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <Trophy className="w-16 h-16 text-warning mx-auto mb-6 animate-float" />
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              GLORY AWAITS THE <span className="text-warning">VICTORS</span>
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              The team with the fastest combined time and fewest hints wins the ultimate glory.
              Prizes, certificates, and eternal bragging rights await.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
              {["1ST", "2ND", "3RD"].map((place, index) => (
                <div 
                  key={place}
                  className={`p-6 rounded-lg border ${
                    index === 0 
                      ? "border-warning/50 bg-warning/10" 
                      : index === 1 
                        ? "border-muted-foreground/30 bg-muted/10" 
                        : "border-orange-500/30 bg-orange-500/10"
                  }`}
                >
                  <div className={`text-2xl font-display font-bold ${
                    index === 0 ? "text-warning" : index === 1 ? "text-muted-foreground" : "text-orange-500"
                  }`}>
                    {place}
                  </div>
                  <div className="text-xs font-terminal text-muted-foreground mt-1">PLACE</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 border-t border-primary/10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <BiohazardIcon className="w-16 h-16 text-destructive mx-auto mb-6 animate-pulse" />
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              READY TO <span className="text-destructive text-glow-blood">BREACH</span>?
            </h2>
            <p className="text-muted-foreground mb-8">
              Gather your team. Sharpen your skills. The lockdown awaits.
            </p>
            <Link to="/register">
              <Button variant="blood" size="xl" className="gap-2">
                <Zap className="w-5 h-5" />
                REGISTER NOW
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Admin Access - Hidden Link */}
      <div className="py-4 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 text-center">
          <Link 
            to="/admin-login" 
            className="text-xs text-muted-foreground/50 hover:text-destructive font-terminal transition-colors inline-flex items-center gap-1"
          >
            <Shield className="w-3 h-3" />
            ADMIN ACCESS
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Index;

