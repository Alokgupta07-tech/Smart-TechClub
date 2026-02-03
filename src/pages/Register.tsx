import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Users, 
  UserPlus, 
  Mail, 
  Phone, 
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { TerminalCard } from "@/components/TerminalCard";
import { BackButton } from "@/components/BackButton";
import { BiohazardIcon } from "@/components/BiohazardIcon";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const memberSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits").max(15),
  role: z.enum(["leader", "member"])
});

const registrationSchema = z.object({
  teamName: z.string().min(3, "Team name must be at least 3 characters").max(30),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
  members: z.array(memberSchema).length(4, "Team must have exactly 4 members")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const Register = () => {
  const navigate = useNavigate();
  const { register: registerUser, verifyEmail: verifyUserEmail, resendOTP, login } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [userId, setUserId] = useState("");
  const [otp, setOtp] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");

  const { 
    register, 
    control, 
    handleSubmit, 
    formState: { errors },
    watch,
    trigger
  } = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      teamName: "",
      password: "",
      confirmPassword: "",
      members: [
        { name: "", email: "", phone: "", role: "leader" },
        { name: "", email: "", phone: "", role: "member" },
        { name: "", email: "", phone: "", role: "member" },
        { name: "", email: "", phone: "", role: "member" }
      ]
    }
  });

  const { fields } = useFieldArray({
    control,
    name: "members"
  });

  const watchTeamName = watch("teamName");

  const handleNext = async () => {
    const isValid = await trigger(["teamName", "password", "confirmPassword"]);
    if (isValid) {
      setStep(2);
    }
  };

  const handleVerifyEmail = async () => {
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify email
      await verifyUserEmail(userId, otp);
      
      toast.success("Email verified!", {
        description: "Logging you in..."
      });

      // Automatically login the user
      await login(userEmail, userPassword);
      
      toast.success("Welcome to LOCKDOWN!", {
        description: "Your team is ready."
      });
      
      // Redirect to team dashboard
      navigate("/dashboard");
    } catch (error: any) {
      console.error('Verification error:', error);
      const errorMsg = error.response?.data?.error || error.message || "Invalid or expired OTP";
      const errorCode = error.response?.data?.code;
      
      if (errorCode === 'RATE_LIMIT_EXCEEDED') {
        toast.error("Too many attempts", {
          description: "Please wait 15 minutes before trying again"
        });
      } else {
        toast.error("Verification failed", {
          description: errorMsg
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    if (!userId) {
      toast.error("User ID not found");
      return;
    }

    setIsResending(true);
    try {
      await resendOTP(userId, 'verify');
      toast.success("Code resent!", {
        description: `A new verification code has been sent to ${userEmail}`
      });
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      toast.error("Failed to resend code", {
        description: error.response?.data?.error || "Please try again"
      });
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = async (data: RegistrationForm) => {
    setIsSubmitting(true);
    
    try {
      // Use team leader's email for registration
      const leaderEmail = data.members[0].email;
      const leaderName = data.members[0].name;

      const response = await registerUser({
        name: leaderName,
        email: leaderEmail,
        password: data.password,
        teamName: data.teamName,
        members: data.members
      });

      setUserId(response.userId);
      setUserEmail(leaderEmail);
      setUserPassword(data.password); // Save password for auto-login
      setShowVerification(true);

      toast.success("Registration successful!", {
        description: `Check ${leaderEmail} for verification code.`
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error("Registration failed", {
        description: error.response?.data?.error || "Please try again"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Back Button */}
            <BackButton label="Back to Home" to="/" className="mb-6" />
            
            {/* Show verification if registration successful */}
            {showVerification ? (
              <>
                <div className="text-center mb-12">
                  <BiohazardIcon className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
                  <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                    VERIFY <span className="text-primary text-glow-toxic">EMAIL</span>
                  </h1>
                  <p className="text-muted-foreground font-terminal">
                    Enter the 6-digit code sent to {userEmail}
                  </p>
                </div>

                <TerminalCard title="EMAIL VERIFICATION" status="warning">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-terminal text-muted-foreground mb-2">
                        VERIFICATION CODE
                      </label>
                      <Input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        className="h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal text-center text-2xl tracking-widest"
                      />
                    </div>

                    <Button 
                      onClick={handleVerifyEmail}
                      variant="toxic" 
                      size="lg"
                      disabled={isSubmitting || otp.length !== 6}
                      className="w-full gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          VERIFYING...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          VERIFY EMAIL
                        </>
                      )}
                    </Button>

                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-2">Didn't receive the code?</p>
                      <Button
                        onClick={handleResendOTP}
                        variant="ghost"
                        size="sm"
                        disabled={isResending || isSubmitting}
                        className="text-primary hover:text-primary/80 gap-2"
                      >
                        {isResending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Resending...
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            Resend Code
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </TerminalCard>
              </>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-12">
                  <BiohazardIcon className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
                  <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
                    <span className="text-primary text-glow-toxic">REGISTER YOUR TEAM</span>
                  </h1>
                  <p className="text-muted-foreground font-terminal mb-3">
                    Create your squad of 4 agents. Set password and enter the lockdown.
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-muted-foreground">Already registered?</span>
                    <a href="/login" className="text-primary hover:text-primary/80 font-terminal underline">
                      Login here →
                    </a>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mb-12">
                  {[1, 2].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-display text-sm ${
                        step >= s 
                          ? "border-primary bg-primary/20 text-primary" 
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}>
                        {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                      </div>
                      <span className={`text-sm font-terminal hidden sm:block ${
                        step >= s ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {s === 1 ? "TEAM INFO" : "MEMBERS"}
                      </span>
                      {s < 2 && (
                        <div className={`w-12 h-0.5 ${step > s ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      )}
                    </div>
                  ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Step 1: Team Info */}
              {step === 1 && (
                <TerminalCard title="TEAM IDENTIFICATION" status="active" className="animate-fade-in">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-terminal text-muted-foreground mb-2">
                        TEAM NAME
                      </label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                        <Input
                          {...register("teamName")}
                          placeholder="Enter your team name..."
                          className="pl-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
                        />
                      </div>
                      {errors.teamName && (
                        <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {errors.teamName.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-terminal text-muted-foreground mb-2">
                        CREATE PASSWORD
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                        <Input
                          {...register("password")}
                          type="password"
                          placeholder="Enter password (min 8 characters)"
                          className="pl-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
                        />
                      </div>
                      {errors.password && (
                        <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {errors.password.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-terminal text-muted-foreground mb-2">
                        CONFIRM PASSWORD
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
                        <Input
                          {...register("confirmPassword")}
                          type="password"
                          placeholder="Re-enter password"
                          className="pl-11 h-12 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal"
                        />
                      </div>
                      {errors.confirmPassword && (
                        <p className="mt-2 text-sm text-destructive flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    {watchTeamName && (
                      <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 animate-fade-in">
                        <p className="text-xs font-terminal text-muted-foreground mb-1">PREVIEW</p>
                        <p className="text-xl font-display text-primary text-glow-toxic">
                          {watchTeamName.toUpperCase()}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button 
                        type="button" 
                        variant="toxic" 
                        onClick={handleNext}
                        className="gap-2"
                      >
                        CONTINUE
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </TerminalCard>
              )}

              {/* Step 2: Team Members */}
              {step === 2 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between mb-6">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep(1)}
                      className="gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      BACK
                    </Button>
                    <div className="text-right">
                      <p className="text-xs font-terminal text-muted-foreground">REGISTERING AS</p>
                      <p className="font-display text-primary">{watchTeamName?.toUpperCase()}</p>
                    </div>
                  </div>

                  {fields.map((field, index) => (
                    <TerminalCard 
                      key={field.id}
                      title={index === 0 ? "TEAM LEADER" : `MEMBER ${index + 1}`}
                      status={index === 0 ? "warning" : "active"}
                      className="animate-slide-up"
                      style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-terminal text-muted-foreground mb-2">
                            FULL NAME
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                            <Input
                              {...register(`members.${index}.name`)}
                              placeholder="Name..."
                              className="pl-10 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal text-sm"
                            />
                          </div>
                          {errors.members?.[index]?.name && (
                            <p className="mt-1 text-xs text-destructive">
                              {errors.members[index]?.name?.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-terminal text-muted-foreground mb-2">
                            EMAIL
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                            <Input
                              {...register(`members.${index}.email`)}
                              type="email"
                              placeholder="email@example.com"
                              className="pl-10 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal text-sm"
                            />
                          </div>
                          {errors.members?.[index]?.email && (
                            <p className="mt-1 text-xs text-destructive">
                              {errors.members[index]?.email?.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-terminal text-muted-foreground mb-2">
                            PHONE
                          </label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                            <Input
                              {...register(`members.${index}.phone`)}
                              type="tel"
                              placeholder="+91 9876543210"
                              className="pl-10 bg-background/50 border-primary/20 focus:border-primary/50 font-terminal text-sm"
                            />
                          </div>
                          {errors.members?.[index]?.phone && (
                            <p className="mt-1 text-xs text-destructive">
                              {errors.members[index]?.phone?.message}
                            </p>
                          )}
                        </div>
                      </div>

                      {index === 0 && (
                        <p className="mt-4 text-xs text-warning font-terminal flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Team leader will receive all communications and has admin access.
                        </p>
                      )}
                    </TerminalCard>
                  ))}

                  {/* Submit */}
                  <div className="flex justify-end pt-6">
                    <Button 
                      type="submit" 
                      variant="toxic" 
                      size="lg"
                      disabled={isSubmitting}
                      className="gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          INITIALIZING...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-5 h-5" />
                          REGISTER TEAM
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </form>

            {/* Info Box */}
            <TerminalCard 
              title="REGISTRATION INFO" 
              status="active" 
              className="mt-8"
            >
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Teams are locked after registration. Choose wisely.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  All members must be present during the event.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  A confirmation email will be sent to team leader.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Registration closes 24 hours before the event.
                </li>
              </ul>
            </TerminalCard>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Register;

