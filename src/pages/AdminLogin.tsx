import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, Shield, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Clear stale tokens when landing on login page
  useEffect(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema)
  });

  const onSubmit = async (data: AdminLoginForm) => {
    setIsLoading(true);
    
    try {
      const response = await login(data.email, data.password);
      
      if (response.role === 'admin') {
        toast.success("Access Granted", {
          description: "Welcome to Admin Control Panel"
        });
        navigate("/admin");
      } else {
        // Not an admin - reject login
        toast.error("Access Denied", {
          description: "This portal is for administrators only. Use team login instead."
        });
        await logout();
      }
    } catch (error: any) {
      console.error('Admin login error:', error);
      const rawErr = error.response?.data?.error;
      const errorMsg = typeof rawErr === 'string' ? rawErr : rawErr?.message || error.message || "Authentication failed";
      toast.error("Access Denied", {
        description: errorMsg
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background noise-overlay flex flex-col">
      <Navbar />
      
      <main className="flex-1 flex items-center justify-center pt-16 pb-8 px-4">
        <div className="w-full max-w-md">
          {/* Back Button */}
          <BackButton label="Back to Home" to="/" className="mb-4" />
          
          {/* Header */}
          <div className="text-center mb-8">
            <Shield className="w-16 h-16 text-destructive mx-auto mb-6 animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">
              <span className="text-destructive text-glow">ADMIN</span> CONTROL
            </h1>
            <p className="text-sm text-muted-foreground font-terminal mb-3">
              Authorized personnel only - High clearance required
            </p>
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-muted-foreground">Team member?</span>
              <Link to="/login" className="text-primary hover:text-primary/80 font-terminal underline">
                Team login →
              </Link>
            </div>
          </div>

          <TerminalCard 
            title="ADMINISTRATOR ACCESS" 
            status="active" 
            scanLine
            className="border-destructive/30"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-xs font-terminal text-muted-foreground mb-2">
                  ADMIN EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive/50" />
                  <Input
                    {...register("email")}
                    type="email"
                    placeholder="admin@lockdown-hq.com"
                    className="pl-11 h-12 bg-background/50 border-destructive/20 focus:border-destructive/50 font-terminal"
                  />
                </div>
                {errors.email && (
                  <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-terminal text-muted-foreground mb-2">
                  ADMIN PASSWORD
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive/50" />
                  <Input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-11 pr-11 h-12 bg-background/50 border-destructive/20 focus:border-destructive/50 font-terminal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button 
                type="submit" 
                variant="blood" 
                size="lg"
                className="w-full h-12 font-terminal uppercase tracking-wider"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying Access...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Enter Admin Panel
                  </>
                )}
              </Button>
            </form>

            <div className="text-center mt-4">
              <Link to="/forgot-password" className="text-xs font-terminal text-muted-foreground hover:text-destructive transition-colors underline">
                FORGOT PASSWORD?
              </Link>
            </div>

            <div className="mt-6 pt-6 border-t border-destructive/20">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-terminal">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span>Unauthorized access attempts will be logged</span>
              </div>
            </div>
          </TerminalCard>
        </div>
      </main>

      <div className="fixed bottom-4 right-4 text-xs text-muted-foreground font-terminal opacity-50">
        SECURITY LEVEL: <span className="text-destructive">MAXIMUM</span>
      </div>
    </div>
  );
};

export default AdminLogin;

