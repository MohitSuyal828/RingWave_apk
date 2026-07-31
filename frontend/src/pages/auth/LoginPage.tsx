import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Shield, Wifi } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { login } from "@/services/auth";
import { AxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const LoginPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
  setIsLoading(true);
  setServerError(null);

  try {
    const response = await login(data);

    useAuthStore.getState().setTokens(
      response.accessToken,
      response.refreshToken
    );

    useAuthStore.getState().setUser(response.user);

    navigate(ROUTES.DASHBOARD);
  } catch (error) {
    const axiosError = error as AxiosError<{
      message?: string;
    }>;

    setServerError(
      axiosError.response?.data?.message ??
        "Invalid email or password. Please try again."
    );
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#06B6D4]/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-[#0F172A]/80 blur-[80px] pointer-events-none" />

      {/* Subtle grid pattern */}
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
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="w-12 h-12 rounded-2xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center mb-4">
            <Wifi className="w-6 h-6 text-[#06B6D4]" />
          </div>
          <h1 className="text-2xl font-bold text-[#F8FAFC]">
            Welcome back
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1">
            Sign in to your RingWave account
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          className="bg-[#1E293B]/60 backdrop-blur-xl border border-[#334155]/60 rounded-2xl p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#94A3B8]">
                Email address
              </label>
              <div className="relative">
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-[#F8FAFC] text-sm placeholder-[#334155] outline-none transition-all duration-200
                    focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30
                    ${errors.email ? "border-[#EF4444]/60" : "border-[#334155]"}`}
                />
              </div>
              {errors.email && (
                <motion.p
                  className="text-[#EF4444] text-xs mt-1"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.email.message}
                </motion.p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#94A3B8]">
                  Password
                </label>
                <Link
                  to={ROUTES.FORGOT_PASSWORD}
                  className="text-xs text-[#06B6D4] hover:text-[#06B6D4]/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className={`w-full bg-[#0F172A] border rounded-xl px-4 py-3 pr-11 text-[#F8FAFC] text-sm placeholder-[#334155] outline-none transition-all duration-200
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
                <motion.p
                  className="text-[#EF4444] text-xs mt-1"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.password.message}
                </motion.p>
              )}
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#06B6D4] hover:bg-[#06B6D4]/90 disabled:bg-[#06B6D4]/40 disabled:cursor-not-allowed text-[#020617] font-semibold py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#334155]" />
            <span className="text-[#94A3B8] text-xs">or</span>
            <div className="flex-1 h-px bg-[#334155]" />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-[#94A3B8]">
            Don't have an account?{" "}
            <Link
              to={ROUTES.REGISTER}
              className="text-[#06B6D4] font-medium hover:text-[#06B6D4]/80 transition-colors"
            >
              Create one
            </Link>
          </p>
        </motion.div>

        {/* Security note */}
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

export default LoginPage;