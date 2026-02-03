import { Shield, AlertTriangle, Clock, Users, Eye, Ban, CheckCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";

const generalRules = [
  {
    icon: Users,
    title: "Team Composition",
    rules: [
      "Each team must consist of exactly 4 members",
      "Team composition is locked after registration",
      "No substitutions allowed once the event starts",
      "At least one member must be designated as Team Leader"
    ]
  },
  {
    icon: Clock,
    title: "Time Limits",
    rules: [
      "Total event duration is 4 hours",
      "Level 1 must be completed before Level 2 unlocks",
      "Time starts when the event begins, not when you start",
      "Late submissions will not be accepted"
    ]
  },
  {
    icon: Eye,
    title: "Fair Play",
    rules: [
      "No external help from non-team members",
      "No searching for solutions online",
      "No communication with other teams during the event",
      "Screenshots and screen recording are prohibited"
    ]
  }
];

const violations = [
  "Using external resources or search engines",
  "Communicating with other teams",
  "Sharing puzzles or solutions",
  "Attempting to hack or exploit the system",
  "Impersonating team members",
  "Any form of cheating or unfair advantage"
];

const hints = [
  "Each team gets 3 hints per level",
  "Each hint adds 5 minutes to your total time",
  "Hints are irreversible once requested",
  "Strategic hint usage is key to winning"
];

const Rules = () => {
  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <BackButton label="Back to Home" to="/" className="mb-6" />
            
            {/* Header */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-destructive/30 bg-destructive/10 mb-6">
                <Shield className="w-4 h-4 text-destructive" />
                <span className="text-xs font-terminal uppercase tracking-widest text-destructive">
                  MANDATORY READING
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                RULES OF <span className="text-primary text-glow-toxic">ENGAGEMENT</span>
              </h1>
              <p className="text-muted-foreground font-terminal max-w-xl mx-auto">
                Read carefully. Violations result in immediate disqualification.
                The organizer's decision is final.
              </p>
            </div>

            {/* General Rules */}
            <div className="grid gap-6 mb-12">
              {generalRules.map((section, index) => (
                <TerminalCard 
                  key={index}
                  title={section.title.toUpperCase()}
                  status="active"
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <section.icon className="w-6 h-6 text-primary" />
                    </div>
                    <ul className="space-y-3 flex-1">
                      {section.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TerminalCard>
              ))}
            </div>

            {/* Hints System */}
            <TerminalCard 
              title="HINT SYSTEM" 
              status="warning"
              className="mb-12"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-4">
                    Hints are a double-edged sword. Use them wisely.
                  </p>
                  <ul className="space-y-3">
                    {hints.map((hint, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-warning font-terminal">{String(i + 1).padStart(2, "0")}.</span>
                        <span className="text-muted-foreground">{hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </TerminalCard>

            {/* Violations */}
            <TerminalCard 
              title="VIOLATIONS & DISQUALIFICATION" 
              status="danger"
              className="mb-12"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <Ban className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-destructive mb-4 font-semibold">
                    The following actions will result in immediate disqualification:
                  </p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {violations.map((violation, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-destructive">✕</span>
                        <span className="text-muted-foreground">{violation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </TerminalCard>

            {/* Final Note */}
            <div className="text-center p-8 rounded-lg border border-primary/20 bg-primary/5">
              <BiohazardIcon className="w-12 h-12 text-primary mx-auto mb-4" />
              <p className="text-lg font-display text-foreground mb-2">
                ORGANIZER'S DECISION IS FINAL
              </p>
              <p className="text-sm text-muted-foreground font-terminal">
                Smart Tech Club reserves the right to disqualify any team for any reason. 
                All decisions are final and binding.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Rules;

