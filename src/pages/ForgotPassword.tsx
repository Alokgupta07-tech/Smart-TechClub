import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { toast } from "sonner";
import * as authAPI from "@/lib/authApi";

const forgotSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

const ForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setIsLoading(true);
    try {
      const response = await authAPI.forgotPassword({ email: data.email });
      setUserId(response.userId);
      setEmail(data.email);
      setSent(true);
      toast.success("Reset Code Sent", {
        description: "Check your email for the password reset code.",
      });
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to send reset code. Please try again.";
      toast.error("Request Failed", { description: errorMsg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      await authAPI.resendOTP(userId, "reset");
      toast.success("Code Resent", {
        description: "A new reset code has been sent to your email.",
      });
    } catch {
      toast.error("Failed to resend code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background noise-overlay flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center pt-16 pb-8 px-4">
        <div className="w-full max-w-md">
          <BackButton label="Back to Login" to="/login" className="mb-4" />

          {/* Header */}
          <div className="text-center mb-8">
            <BiohazardIcon className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">
              <span className="text-primary text-glow-toxic">FORGOT</span> PASSWORD
            </h1>
            <p className="text-sm text-muted-foreground font-terminal">
              Enter your registered email to receive a reset code
            </p>
          </div>

          {!sent ? (
            <TerminalCard title="PASSWORD RECOVERY" status="active" scanLine>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label className="block text-xs font-terminal text-muted-foreground mb-2">
                    REGISTERED EMAIL
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                    <Input
                      {...register("email")}
                      type="email"
                      placeholder="your@email.com"
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
                      SENDING...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      SEND RESET CODE
                    </>
                  )}
                </Button>
              </form>
            </TerminalCard>
          ) : (
            <TerminalCard title="CODE SENT" status="active">
              <div className="space-y-6 text-center">
                <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
                <div>
                  <p className="text-sm font-terminal text-foreground mb-2">
                    A reset code has been sent to
                  </p>
                  <p className="text-primary font-terminal font-bold">{email}</p>
                </div>
                <p className="text-xs text-muted-foreground font-terminal">
                  Check your inbox (and spam folder) for the 6-digit code.
                </p>

                <div className="flex flex-col gap-3">
                  <Link to={`/reset-password?userId=${userId}`}>
                    <Button variant="toxic" size="lg" className="w-full gap-2">
                      ENTER RESET CODE
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="gap-2 border-primary/20 text-primary hover:bg-primary/10"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    RESEND CODE
                  </Button>
                </div>
              </div>
            </TerminalCard>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6 font-terminal">
            REMEMBER YOUR PASSWORD?{" "}
            <Link to="/login" className="text-primary hover:underline">
              LOGIN HERE
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default ForgotPassword;
