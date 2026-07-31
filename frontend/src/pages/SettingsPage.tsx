import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bell, Shield, Volume2, Lock, Check, Loader2,
} from "lucide-react";
import { axiosInstance } from "@/services/axios";
import { getSettings, setSetting, type AppSettings } from "@/lib/settings";

const Toggle = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0 ${
      disabled ? "opacity-40 cursor-not-allowed" : ""
    } ${on ? "bg-[#06B6D4]" : "bg-[#334155]"}`}
  >
    <motion.div
      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow"
      animate={{ x: on ? 20 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    />
  </button>
);

const SettingsPage = () => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  const flip = (key: keyof AppSettings) => {
    setSettings(setSetting(key, !settings[key]));
  };

  // ------------------------------------------------------
  // Password change
  // ------------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePassword = async () => {
    setPwError(null);
    setPwSuccess(false);

    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }

    setPwSaving(true);

    try {
      await axiosInstance.patch("/auth/profile", {
        current_password: currentPassword,
        password: newPassword,
      });

      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPwError(
        err?.response?.data?.message ?? "Couldn't change your password."
      );
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#F8FAFC]">Settings</h2>
        <p className="text-[#94A3B8] text-sm mt-1">
          Manage your preferences and security
        </p>
      </div>

      {/* Notifications — real, persisted */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#334155]/60">
          <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/20 flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#06B6D4]" />
          </div>
          <h3 className="text-[#F8FAFC] font-semibold">Notifications</h3>
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[#F8FAFC] text-sm font-medium">Incoming call sound</p>
            <p className="text-[#94A3B8] text-xs mt-0.5">Play a tone when someone calls you</p>
          </div>
          <Toggle on={settings.callAlertSound} onClick={() => flip("callAlertSound")} />
        </div>
      </motion.div>

      {/* Audio — real, applied to getUserMedia */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#334155]/60">
          <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/20 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-[#06B6D4]" />
          </div>
          <h3 className="text-[#F8FAFC] font-semibold">Audio</h3>
        </div>
        <div className="divide-y divide-[#334155]/30">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[#F8FAFC] text-sm font-medium">Noise cancellation</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">Filter background noise from your mic</p>
            </div>
            <Toggle on={settings.noiseCancellation} onClick={() => flip("noiseCancellation")} />
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[#F8FAFC] text-sm font-medium">Echo reduction</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">Reduce echo during calls</p>
            </div>
            <Toggle on={settings.echoReduction} onClick={() => flip("echoReduction")} />
          </div>
          <p className="px-5 py-3 text-[#475569] text-xs">
            Applies the next time you join a call.
          </p>
        </div>
      </motion.div>

      {/* Security */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#334155]/60">
          <div className="w-8 h-8 rounded-lg bg-[#334155]/20 border border-[#334155]/60 flex items-center justify-center">
            <Shield className="w-4 h-4 text-[#94A3B8]" />
          </div>
          <h3 className="text-[#F8FAFC] font-semibold">Security</h3>
        </div>
        <div className="divide-y divide-[#334155]/30">
          {/* Real, working toggle -- the dummy AI detection pipeline
              already runs live during every call (AudioChunker ->
              DetectionTransport -> ai-service). Turning this off skips
              starting that pipeline for the next call. */}
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[#F8FAFC] text-sm font-medium">AI deepfake detection</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">Analyze calls in real time</p>
            </div>
            <Toggle
              on={settings.aiDetectionEnabled}
              onClick={() => flip("aiDetectionEnabled")}
            />
          </div>

          {[
            { label: "Auto-block synthetic callers", desc: "Block flagged numbers automatically" },
            { label: "Two-factor authentication", desc: "Extra login security" },
          ].map((item) => (
            <div key={item.label} className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[#94A3B8] text-sm font-medium">{item.label}</p>
                <p className="text-[#475569] text-xs mt-0.5">{item.desc} — coming soon</p>
              </div>
              <Toggle on={false} onClick={() => {}} disabled />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Password change — real */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#334155]/60">
          <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-[#06B6D4]" />
          </div>
          <h3 className="text-[#F8FAFC] font-semibold">Change Password</h3>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[#94A3B8] text-xs">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full mt-1 bg-[#0F172A] border border-[#334155]/60 rounded-xl px-4 py-2.5 text-[#F8FAFC] text-sm outline-none focus:border-[#06B6D4]/60 transition-colors"
            />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full mt-1 bg-[#0F172A] border border-[#334155]/60 rounded-xl px-4 py-2.5 text-[#F8FAFC] text-sm outline-none focus:border-[#06B6D4]/60 transition-colors"
            />
          </div>

          {pwError && <p className="text-[#EF4444] text-xs">{pwError}</p>}
          {pwSuccess && (
            <p className="text-[#22C55E] text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Password updated. You'll need to log in again on other devices.
            </p>
          )}

          <button
            onClick={changePassword}
            disabled={pwSaving || !currentPassword || !newPassword}
            className="flex items-center gap-2 px-4 py-2 bg-[#06B6D4] text-[#020617] rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Update Password
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
