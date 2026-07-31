import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ROUTES } from "@/constants/routes";

const SplashPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(ROUTES.LOGIN);
    }, 3500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden">

      {/* Ambient background rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#06B6D4]/10"
            style={{
              width: i * 180,
              height: i * 180,
            }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Glow blob */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-[#06B6D4]/5 blur-[80px] pointer-events-none" />

      {/* Logo container */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {/* Icon */}
        <motion.div
          className="relative"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "backOut" }}
        >
          {/* Outer ring */}
          <motion.div
            className="w-24 h-24 rounded-full border-2 border-[#06B6D4]/30 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute w-2 h-2 bg-[#06B6D4] rounded-full top-1 left-1/2 -translate-x-1/2" />
          </motion.div>

          {/* Inner icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Sound wave / ring icon */}
                <path
                  d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z"
                  stroke="#06B6D4"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M14 8c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z"
                  stroke="#06B6D4"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.6"
                />
                <circle cx="14" cy="14" r="2.5" fill="#06B6D4" />
                {/* Shield tick */}
                <path
                  d="M11 14l2 2 4-4"
                  stroke="#06B6D4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <h1 className="text-4xl font-bold tracking-tight text-[#F8FAFC]">
            Ring<span className="text-[#06B6D4]">Wave</span>
          </h1>
          <p className="text-sm text-[#94A3B8] tracking-widest uppercase font-medium">
            Secure · Verified · Trusted
          </p>
        </motion.div>

        {/* Animated waveform bars */}
        <motion.div
          className="flex items-end gap-[3px] h-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {[3, 6, 9, 12, 9, 14, 9, 12, 9, 6, 3].map((h, i) => (
            <motion.div
              key={i}
              className="w-[3px] bg-[#06B6D4] rounded-full"
              style={{ height: h }}
              animate={{ scaleY: [1, 1.8, 0.6, 1.4, 1] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.08,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Bottom tagline */}
      <motion.div
        className="absolute bottom-12 flex flex-col items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        <p className="text-[#94A3B8] text-sm">
          AI-powered deepfake detection for every call
        </p>

        {/* Loading bar */}
        <div className="w-32 h-[2px] bg-[#1E293B] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#06B6D4] rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3, ease: "easeInOut" }}
          />
        </div>
      </motion.div>

      {/* Corner security badges */}
      <motion.div
        className="absolute top-8 right-8 flex items-center gap-2 bg-[#0F172A] border border-[#334155] rounded-full px-3 py-1.5"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.4 }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
        <span className="text-[#94A3B8] text-xs font-medium">
          End-to-end encrypted
        </span>
      </motion.div>

      <motion.div
        className="absolute top-8 left-8 flex items-center gap-2 bg-[#0F172A] border border-[#334155] rounded-full px-3 py-1.5"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.6 }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
        <span className="text-[#94A3B8] text-xs font-medium">
          AI Shield Active
        </span>
      </motion.div>
    </div>
  );
};

export default SplashPage;