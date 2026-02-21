import { BiohazardIcon } from "./BiohazardIcon";
import { Github, Twitter, Instagram, Mail } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-primary/10 bg-background/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <BiohazardIcon className="w-8 h-8 text-primary" />
              <div>
                <span className="font-display text-lg tracking-widest">RESIDENT EVIL</span>
                <span className="block text-xs font-terminal text-primary tracking-[0.3em]">
                  WELCOME TO THE LOCKDOWN
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              A cyber escape room competition organized by Smart Tech Club. 
              Test your hacking skills, solve puzzles, and breach the firewall.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display text-sm tracking-wider mb-4 text-primary">QUICK LINKS</h4>
            <ul className="space-y-2">
              {["Rules", "Register", "Leaderboard", "Contact"].map((link) => (
                <li key={link}>
                  <a 
                    href={`/${link.toLowerCase()}`}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors font-terminal"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-sm tracking-wider mb-4 text-primary">CONNECT</h4>
            <div className="flex gap-4">
              {[
                { icon: Github, href: "https://github.com/Alokgupta07-tech" },
                { icon: Twitter, href: "#" },
                { icon: Instagram, href: "https://instagram.com/alok_gupta__23" },
                { icon: Mail, href: "mailto:agupta88094@gmail.com" },
              ].map(({ icon: Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  className="w-10 h-10 rounded-lg border border-primary/20 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-primary/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground font-terminal">
            © 2024 SMART TECH CLUB. ALL RIGHTS RESERVED.
          </p>
          <p className="text-xs text-muted-foreground font-terminal">
            <span className="text-destructive">⚠</span> AUTHORIZED PERSONNEL ONLY
          </p>
        </div>
      </div>
    </footer>
  );
};

