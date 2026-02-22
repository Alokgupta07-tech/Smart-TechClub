import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, KeyRound, Loader2, AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { BackButton } from "@/components/BackButton";
import { TerminalCard } from "@/components/TerminalCard";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { toast } from "sonner";
import * as authAPI from "@/lib/authApi";

const resetSchema = z
  .object({
    otp: z.string().min(4, "Reset code is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetForm = z.infer<typeof resetSchema>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userIdFromUrl = searchParams.get("userId") || "";

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (!userIdFromUrl) {
      toast.error("Missing User ID", {
        description: "Please use the forgot password flow to get a valid reset link.",
      });
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.resetPassword({
        userId: userIdFromUrl,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      setSuccess(true);
      toast.success("Password Reset!", {
        description: "Your password has been updated. You can now login.",
      });
    } catch (error: any) {
      const rawErr = error.response?.data?.error;
      const errorMsg = typeof rawErr === 'string' ? rawErr : rawErr?.message || error.message || "Failed to reset password. Please try again.";
      toast.error("Reset Failed", { description: errorMsg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background noise-overlay flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center pt-16 pb-8 px-4">
        <div className="w-full max-w-md">
          <BackButton label="Back to Forgot Password" to="/forgot-password" className="mb-4" />

          {/* Header */}
          <div className="text-center mb-8">
            <BiohazardIcon className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">
              <span className="text-primary text-glow-toxic">RESET</span> PASSWORD
            </h1>
            <p className="text-sm text-muted-foreground font-terminal">
              Enter the code from your email and set a new password
            </p>
          </div>

          {!success ? (
            <TerminalCard title="NEW CREDENTIALS" status="active" scanLine>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* OTP */}
                <div>
                  <label htmlFor="reset-otp" className="block text-xs font-terminal text-muted-foreground mb-2">
                    RESET CODE
                  </label>
                  <p className="text-xs text-muted-foreground/70 mb-2 font-terminal">
                    Enter the code sent to your email
                  </p>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                    <Input
                      {...register("otp")}
                      id="reset-otp"
                      name="otp"
                      type="text"
                      placeholder="Enter reset code"
                      autoComplete="one-time-code"
                      className="pl-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal tracking-widest text-center text-lg"
                    />
                  </div>
                  {errors.otp && (
                    <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {errors.otp.message}
                    </p>
                  )}
                </div>

                {/* New Password */}
                <div>
                  <label htmlFor="new-password" className="block text-xs font-terminal text-muted-foreground mb-2">
                    NEW PASSWORD
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                    <Input
                      {...register("newPassword")}
                      id="new-password"
                      name="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
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
                  {errors.newPassword && (
                    <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {errors.newPassword.message}
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="reset-confirm-password" className="block text-xs font-terminal text-muted-foreground mb-2">
                    CONFIRM PASSWORD
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                    <Input
                      {...register("confirmPassword")}
                      id="reset-confirm-password"
                      name="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pl-11 pr-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {errors.confirmPassword.message}
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
                      RESETTING...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      RESET PASSWORD
                    </>
                  )}
                </Button>
              </form>
            </TerminalCard>
          ) : (
            <TerminalCard title="PASSWORD UPDATED" status="active">
              <div className="space-y-6 text-center">
                <ShieldCheck className="w-16 h-16 text-primary mx-auto" />
                <div>
                  <p className="text-sm font-terminal text-foreground mb-2">
                    Your password has been successfully reset.
                  </p>
                  <p className="text-xs text-muted-foreground font-terminal">
                    You can now login with your new password.
                  </p>
                </div>
                <Link to="/login">
                  <Button variant="toxic" size="lg" className="w-full gap-2">
                    GO TO LOGIN
                  </Button>
                </Link>
              </div>
            </TerminalCard>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6 font-terminal">
            DIDN'T RECEIVE A CODE?{" "}
            <Link to="/forgot-password" className="text-primary hover:underline">
              TRY AGAIN
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
