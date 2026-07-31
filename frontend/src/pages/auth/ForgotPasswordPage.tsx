import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Shield, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { forgotPassword } from "@/services/auth";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

type Step = "form" | "sent";

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("form");
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      await forgotPassword(data.email);
      setSubmittedEmail(data.email);
      setStep("sent");
    } catch {
      // The backend always returns 200 for a well-formed email (by design,
      // to avoid leaking which addresses have accounts — see
      // authController.forgotPassword). A caught error here means
      // something more fundamental broke (network down, 5xx, etc.), not
      // "this email doesn't exist."
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#06B6D4]/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[250px] h-[250px] rounded-full bg-[#0F172A]/80 blur-[80px] pointer-events-none" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#06B6D4 1px, transparent 1px), linear-gradient(90deg, #06B6D4 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Back button */}
        <motion.button
          onClick={() => navigate(ROUTES.LOGIN)}
          className="flex items-center gap-2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors mb-8 group"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm">Back to login</span>
        </motion.button>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Email form ─────────────────────────────── */}
          {step === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              {/* Header */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center">
                    <Mail className="w-8 h-8 text-[#06B6D4]" />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-2xl border border-[#06B6D4]/30"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </div>
                <h1 className="text-2xl font-bold text-[#F8FAFC]">
                  Forgot password?
                </h1>
                <p className="text-[#94A3B8] text-sm mt-2 text-center max-w-xs leading-relaxed">
                  No worries. Enter your email and we'll send you a reset link.
                </p>
              </div>

              {/* Card */}
              <div className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8">

                {/* Server error */}
                {serverError && (
                  <motion.div
                    className="mb-5 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl flex items-start gap-3"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Shield className="w-4 h-4 text-[#EF4444] mt-0.5 shrink-0" />
                    <p className="text-[#EF4444] text-sm">{serverError}</p>
                  </motion.div>
                )}

                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-5"
                  noValidate
                >
                  {/* Email field */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#94A3B8]">
                      Email address
                    </label>
                    <input
                      {...register("email")}
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-[#F8FAFC] text-sm
                        placeholder-[#334155] outline-none transition-all duration-200
                        focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30
                        ${errors.email ? "border-[#EF4444]/60" : "border-[#334155]"}`}
                    />
                    {errors.email && (
                      <motion.p
                        className="text-[#EF4444] text-xs"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.email.message}
                      </motion.p>
                    )}
                  </div>

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#06B6D4] hover:bg-[#06B6D4]/90 disabled:bg-[#06B6D4]/40
                      disabled:cursor-not-allowed text-[#020617] font-semibold py-3 rounded-xl
                      text-sm transition-all duration-200 flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending reset link...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </motion.button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-[#334155]" />
                  <span className="text-[#94A3B8] text-xs">or</span>
                  <div className="flex-1 h-px bg-[#334155]" />
                </div>

                <p className="text-center text-sm text-[#94A3B8]">
                  Remember your password?{" "}
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.LOGIN)}
                    className="text-[#06B6D4] font-medium hover:text-[#06B6D4]/80 transition-colors"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Email sent confirmation ───────────────── */}
          {step === "sent" && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35 }}
            >
              {/* Header */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                  {/* Success ring animation */}
                  <motion.div
                    className="w-16 h-16 rounded-full border-2 border-[#22C55E]/40 flex items-center justify-center"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 260 }}
                    >
                      <CheckCircle2 className="w-8 h-8 text-[#22C55E]" />
                    </motion.div>
                  </motion.div>

                  {/* Ripple rings */}
                  {[1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full border border-[#22C55E]/20"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.4,
                      }}
                    />
                  ))}
                </div>

                <motion.h1
                  className="text-2xl font-bold text-[#F8FAFC]"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Check your inbox
                </motion.h1>
                <motion.p
                  className="text-[#94A3B8] text-sm mt-2 text-center max-w-xs leading-relaxed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  We sent a password reset link to{" "}
                  <span className="text-[#06B6D4] font-medium">
                    {submittedEmail}
                  </span>
                </motion.p>
              </div>

              {/* Card */}
              <motion.div
                className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8 space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                {/* Info steps */}
                {[
                  { step: "1", text: "Open the email we sent you" },
                  { step: "2", text: "Click the reset password link" },
                  { step: "3", text: "Create your new password" },
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.1 }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center shrink-0">
                      <span className="text-[#06B6D4] text-xs font-bold">
                        {item.step}
                      </span>
                    </div>
                    <p className="text-[#94A3B8] text-sm">{item.text}</p>
                  </motion.div>
                ))}

                <div className="h-px bg-[#334155] my-2" />

                {/* Resend option */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#94A3B8]">
                    Didn't receive it?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("form");
                      setServerError(null);
                    }}
                    className="text-sm text-[#06B6D4] font-medium hover:text-[#06B6D4]/80 transition-colors"
                  >
                    Try again
                  </button>
                </div>

                {/* Back to login */}
                <motion.button
                  onClick={() => navigate(ROUTES.LOGIN)}
                  className="w-full bg-[#0F172A] hover:bg-[#1E293B] border border-[#334155] text-[#F8FAFC] font-medium py-3 rounded-xl text-sm transition-all duration-200 mt-2"
                  whileTap={{ scale: 0.98 }}
                >
                  Back to login
                </motion.button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Security note */}
        <motion.div
          className="flex items-center justify-center gap-2 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Shield className="w-3.5 h-3.5 text-[#94A3B8]" />
          <p className="text-[#94A3B8] text-xs">
            Reset link expires in 15 minutes
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
