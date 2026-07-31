import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { ROUTES } from "@/constants/routes";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#334155]/30"
            style={{ width: i * 200, height: i * 200 }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
          />
        ))}
      </div>

      <motion.div
        className="relative z-10 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="text-[120px] font-black text-[#1E293B] leading-none select-none"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          404
        </motion.div>

        <h1 className="text-2xl font-bold text-[#F8FAFC] -mt-4">
          Page not found
        </h1>
        <p className="text-[#94A3B8] text-sm mt-2 max-w-xs mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <motion.button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1E293B] border border-[#334155]/60 text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl text-sm font-medium transition-colors"
            whileTap={{ scale: 0.97 }}
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </motion.button>
          <motion.button
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] rounded-xl text-sm font-semibold transition-colors"
            whileTap={{ scale: 0.97 }}
          >
            <Home className="w-4 h-4" />
            Dashboard
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;