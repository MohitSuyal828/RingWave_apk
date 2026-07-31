import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, User, Edit3, Calendar, Check, X, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { axiosInstance } from "@/services/axios";
import { listContacts } from "@/services/contacts";
import { getInitials } from "@/lib/utils";

const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [totalCalls, setTotalCalls] = useState<number | null>(null);
  const [missedCalls, setMissedCalls] = useState<number | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsRetryKey, setStatsRetryKey] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsError(false);
      try {
        const [historyRes, contactsData] = await Promise.all([
          axiosInstance.get("/calls/history", { params: { page: 1, limit: 100 } }),
          listContacts(),
        ]);

        setTotalCalls(historyRes.data.data.pagination.total);
        setMissedCalls(
          historyRes.data.data.calls.filter((c: any) => c.status === "missed").length
        );
        setContactCount(contactsData.length);
      } catch (err) {
        console.error("Failed to fetch profile stats:", err);
        setStatsError(true);
      }
    };

    fetchStats();
  }, [statsRetryKey]);

  const startEditing = () => {
    setName(user?.name ?? "");
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const saveProfile = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setSaveError("Name must be at least 2 characters.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await axiosInstance.patch("/auth/profile", {
        name: name.trim(),
      });

      setUser(res.data.data.user);
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.message ?? "Couldn't update your profile. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "—";

  const STATS = [
    { label: "Total Calls", value: totalCalls === null ? "—" : String(totalCalls) },
    { label: "Missed", value: missedCalls === null ? "—" : String(missedCalls) },
    { label: "Contacts", value: contactCount === null ? "—" : String(contactCount) },
    { label: "Member Since", value: memberSince },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-8"
      >
        <div className="flex items-start justify-between mb-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-[#06B6D4]/10 border-2 border-[#06B6D4]/30 flex items-center justify-center">
              <span className="text-[#06B6D4] text-2xl font-bold">
                {user ? getInitials(user.name) : "U"}
              </span>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] border border-[#334155]/60 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] text-sm transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-[#94A3B8] text-xs">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 bg-[#0F172A] border border-[#334155]/60 rounded-xl px-4 py-2.5 text-[#F8FAFC] text-sm outline-none focus:border-[#06B6D4]/60 transition-colors"
              />
            </div>

            {saveError && (
              <p className="text-[#EF4444] text-xs">{saveError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#06B6D4] text-[#020617] rounded-xl text-sm font-medium disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] border border-[#334155]/60 rounded-xl text-[#94A3B8] text-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#F8FAFC]">
              {user?.name ?? "User Name"}
            </h2>
            <p className="text-[#94A3B8] text-sm">{user?.email}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#334155]/60">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-lg sm:text-2xl font-bold text-[#F8FAFC]">{s.value}</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        {statsError && (
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-[#F59E0B]">
            <span>Couldn't load stats.</span>
            <button
              onClick={() => setStatsRetryKey((k) => k + 1)}
              className="underline hover:text-[#F8FAFC] transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </motion.div>

      {/* Info card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-6 space-y-4"
      >
        <h3 className="text-[#F8FAFC] font-semibold">Account Information</h3>
        {[
          { icon: User, label: "Full Name", value: user?.name ?? "—" },
          { icon: Mail, label: "Email", value: user?.email ?? "—" },
          { icon: Calendar, label: "Member Since", value: memberSince },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-4 py-3 border-b border-[#334155]/40 last:border-0">
            <div className="w-9 h-9 rounded-xl bg-[#0F172A] border border-[#334155]/60 flex items-center justify-center shrink-0">
              <item.icon className="w-4 h-4 text-[#94A3B8]" />
            </div>
            <div>
              <p className="text-[#94A3B8] text-xs">{item.label}</p>
              <p className="text-[#F8FAFC] text-sm font-medium mt-0.5">{item.value}</p>
            </div>
          </div>
        ))}
        <p className="text-[#475569] text-xs pt-1">
          To change your password, head to Settings.
        </p>
      </motion.div>
    </div>
  );
};

export default ProfilePage;
