import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Shield,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { resetPassword } from "@/services/auth";
import { AxiosError } from "axios";

// Matches the backend's resetPasswordSchema exactly (8-72 chars) — see
// backend/src/middleware/schemas.js.
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

type Step = "form" | "success";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [step, setStep] = useState<Step>("form");
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    if (!token) return;

    setIsLoading(true);
    setServerError(null);
    try {
      await resetPassword(token, data.password);
      setStep("success");
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setServerError(
        axiosError.response?.data?.message ??
          "Something went wrong. Please try again."
      );
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
          {/* ── No token in the URL at all ─────────────────────── */}
          {!token && (
            <motion.div
              key="no-token"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-[#F59E0B]" />
                </div>
                <h1 className="text-2xl font-bold text-[#F8FAFC]">
                  Invalid reset link
                </h1>
                <p className="text-[#94A3B8] text-sm mt-2 text-center max-w-xs leading-relaxed">
                  This link is missing its reset token. Request a new one to
                  continue.
                </p>
              </div>

              <div className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8">
                <Link
                  to={ROUTES.FORGOT_PASSWORD}
                  className="w-full block text-center bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold py-3 rounded-xl text-sm transition-all duration-200"
                >
                  Request a new link
                </Link>
              </div>
            </motion.div>
          )}

          {/* ── Step 1: New password form ─────────────────────── */}
          {token && step === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center">
                    <Lock className="w-8 h-8 text-[#06B6D4]" />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-2xl border border-[#06B6D4]/30"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </div>
                <h1 className="text-2xl font-bold text-[#F8FAFC]">
                  Set a new password
                </h1>
                <p className="text-[#94A3B8] text-sm mt-2 text-center max-w-xs leading-relaxed">
                  Choose a new password for your RingWave account.
                </p>
              </div>

              <div className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8">
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
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#94A3B8]">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        {...register("password")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoFocus
                        placeholder="Enter your new password"
                        className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 pr-11 text-[#F8FAFC] text-sm
                          placeholder-[#334155] outline-none transition-all duration-200
                          focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30
                          ${errors.password ? "border-[#EF4444]/60" : "border-[#334155]"}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors p-0.5"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-[#EF4444] text-xs mt-1">
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#94A3B8]">
                      Confirm new password
                    </label>
                    <input
                      {...register("confirmPassword")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your new password"
                      className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-[#F8FAFC] text-sm
                        placeholder-[#334155] outline-none transition-all duration-200
                        focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30
                        ${errors.confirmPassword ? "border-[#EF4444]/60" : "border-[#334155]"}`}
                    />
                    {errors.confirmPassword && (
                      <p className="text-[#EF4444] text-xs mt-1">
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#06B6D4] hover:bg-[#06B6D4]/90 disabled:bg-[#06B6D4]/40
                      disabled:cursor-not-allowed text-[#020617] font-semibold py-3 rounded-xl
                      text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Resetting password...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Success ───────────────────────────────── */}
          {token && step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex flex-col items-center mb-8">
                <motion.div
                  className="w-16 h-16 rounded-full border-2 border-[#22C55E]/40 flex items-center justify-center mb-4"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <CheckCircle2 className="w-8 h-8 text-[#22C55E]" />
                </motion.div>
                <h1 className="text-2xl font-bold text-[#F8FAFC]">
                  Password reset
                </h1>
                <p className="text-[#94A3B8] text-sm mt-2 text-center max-w-xs leading-relaxed">
                  Your password has been changed. All existing sessions have
                  been signed out for security — sign in with your new
                  password.
                </p>
              </div>

              <div className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8">
                <button
                  onClick={() => navigate(ROUTES.LOGIN)}
                  className="w-full bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold py-3 rounded-xl text-sm transition-all duration-200"
                >
                  Back to login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="flex items-center justify-center gap-2 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Shield className="w-3.5 h-3.5 text-[#94A3B8]" />
          <p className="text-[#94A3B8] text-xs">
            Protected by end-to-end encryption
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;
