import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, LogIn, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type LoginForm = z.infer<typeof loginSchema>;

const Login = () => {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [userId, setUserId] = useState("");
  const [otp2FA, setOtp2FA] = useState("");

  // Clear stale tokens when landing on login page
  useEffect(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    
    try {
      const response = await login(data.email, data.password);
      
      // Check if user is admin - they shouldn't use team login
      if (response.role === 'admin') {
        toast.error("Wrong Portal", {
          description: "Administrators must use the admin login portal."
        });
        await logout();
        setIsLoading(false);
        return;
      }
      
      // Check if 2FA is required
      if (response.requireTwoFa && response.userId) {
        setUserId(response.userId);
        setShow2FA(true);
        toast.info("2FA Required", {
          description: "Enter the code sent to your email"
        });
      } else if (response.role) {
        // Login successful - redirect to dashboard
        toast.success("Access granted!", {
          description: "Welcome back, agent."
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const rawErr = error.response?.data?.error;
      const errorMsg = typeof rawErr === 'string' ? rawErr : rawErr?.message || error.message || "Failed to connect to backend API. Please ensure the server is running.";
      toast.error("Authentication Failed", {
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
            <BiohazardIcon className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">
              <span className="text-primary text-glow-toxic">TEAM</span> LOGIN
            </h1>
            <p className="text-sm text-muted-foreground font-terminal mb-3">
              Registered teams only - Use your team leader's email
            </p>
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-muted-foreground">New team?</span>
              <Link to="/register" className="text-primary hover:text-primary/80 font-terminal underline">
                Register here →
              </Link>
            </div>
          </div>

          <TerminalCard title="AUTHENTICATION" status="active" scanLine>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-xs font-terminal text-muted-foreground mb-2">
                  TEAM LEADER EMAIL
                </label>
                <p className="text-xs text-muted-foreground/70 mb-2 font-terminal">
                  Use the email address of your team leader (first member)
                </p>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                  <Input
                    {...register("email")}
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="leader@smarttech.com"
                    autoComplete="email"
                    className="pl-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
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
                  PASSWORD
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                  <Input
                    {...register("password")}
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-11 pr-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
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
                variant="toxic" 
                size="lg"
                disabled={isLoading}
                className="w-full gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AUTHENTICATING...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    ACCESS SYSTEM
                  </>
                )}
              </Button>

              <div className="text-center">
                <Link to="/forgot-password" className="text-xs font-terminal text-muted-foreground hover:text-primary transition-colors underline">
                  FORGOT PASSWORD?
                </Link>
              </div>
            </form>
          </TerminalCard>

          <p className="text-center text-sm text-muted-foreground mt-6 font-terminal">
            NEW TEAM?{" "}
            <Link to="/register" className="text-primary hover:underline">
              REGISTER HERE
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;

