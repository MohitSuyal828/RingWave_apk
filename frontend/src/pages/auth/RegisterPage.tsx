import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Shield, Wifi, Check, X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { register as registerUser } from "@/services/auth";
import { AxiosError } from "axios";

const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "Full name is required")
      .min(2, "Name must be at least 2 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

const InputField = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-[#94A3B8]">{label}</label>
    {children}
    {error && (
      <motion.p
        className="text-[#EF4444] text-xs"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {error}
      </motion.p>
    )}
  </div>
);

const RegisterPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [watchedPassword, setWatchedPassword] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

const onSubmit = async (data: RegisterFormData) => {
  setIsLoading(true);
  setServerError(null);

  try {
    await registerUser({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    navigate(ROUTES.LOGIN);
  } catch (error) {
    console.log(error);

    const axiosError = error as AxiosError<{
      message?: string;
    }>;
    console.log("Response:", axiosError.response?.data);
    console.log("Status:", axiosError.response?.status);

    setServerError(
      axiosError.response?.data?.message ??
        "Registration failed. This email may already be in use."
    );
  } finally {
    setIsLoading(false);
  }
};

  const inputClass = (hasError: boolean) =>
    `w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-[#F8FAFC] text-sm placeholder-[#334155] outline-none transition-all duration-200
    focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30
    ${hasError ? "border-[#EF4444]/60" : "border-[#334155]"}`;

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#06B6D4]/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-[#0F172A]/80 blur-[80px] pointer-events-none" />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#06B6D4 1px, transparent 1px), linear-gradient(90deg, #06B6D4 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <motion.div
        className="w-full max-w-md relative z-10 py-8"
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
            Create your account
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1">
            Join RingWave — secure calls, verified voices
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

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            noValidate
          >
            {/* Full name */}
            <InputField label="Full name" error={errors.name?.message}>
              <input
                {...register("name")}
                type="text"
                autoComplete="name"
                placeholder="Mansi Sharma"
                className={inputClass(!!errors.name)}
              />
            </InputField>

            {/* Email */}
            <InputField label="Email address" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass(!!errors.email)}
              />
            </InputField>

            {/* Password */}
            <InputField label="Password" error={errors.password?.message}>
              <div className="relative">
                <input
                  
                  {...register("password", {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setWatchedPassword(e.target.value),
                  })}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  className={`${inputClass(!!errors.password)} pr-11`}
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

              {/* Password strength indicators */}
              {watchedPassword.length > 0 && (
                <motion.div
                  className="mt-2 space-y-1"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  {passwordRules.map((rule) => {
                    const passed = rule.test(watchedPassword);
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                            passed ? "bg-[#22C55E]/20" : "bg-[#334155]"
                          }`}
                        >
                          {passed ? (
                            <Check className="w-2 h-2 text-[#22C55E]" />
                          ) : (
                            <X className="w-2 h-2 text-[#94A3B8]" />
                          )}
                        </div>
                        <span
                          className={`text-xs transition-colors ${
                            passed ? "text-[#22C55E]" : "text-[#94A3B8]"
                          }`}
                        >
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </InputField>

            {/* Confirm password */}
            <InputField
              label="Confirm password"
              error={errors.confirmPassword?.message}
            >
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className={`${inputClass(!!errors.confirmPassword)} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors p-0.5"
                >
                  {showConfirm ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </InputField>

            {/* Terms */}
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              By creating an account, you agree to our{" "}
              <span className="text-[#06B6D4] cursor-pointer hover:underline">
                Terms of Service
              </span>{" "}
              and{" "}
              <span className="text-[#06B6D4] cursor-pointer hover:underline">
                Privacy Policy
              </span>
              .
            </p>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#06B6D4] hover:bg-[#06B6D4]/90 disabled:bg-[#06B6D4]/40 disabled:cursor-not-allowed text-[#020617] font-semibold py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2"
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#334155]" />
            <span className="text-[#94A3B8] text-xs">or</span>
            <div className="flex-1 h-px bg-[#334155]" />
          </div>

          {/* Login link */}
          <p className="text-center text-sm text-[#94A3B8]">
            Already have an account?{" "}
            <Link
              to={ROUTES.LOGIN}
              className="text-[#06B6D4] font-medium hover:text-[#06B6D4]/80 transition-colors"
            >
              Sign in
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

export default RegisterPage;