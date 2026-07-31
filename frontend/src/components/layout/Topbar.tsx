import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  Phone,
  PhoneCall,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/authStore";
import { useNotifications } from "@/hooks/useNotifications";
import { useCall } from "@/context/CallContext";
import { axiosInstance } from "@/services/axios";
import { getInitials } from "@/lib/utils";

interface RecentContact {
  id: number;
  name: string;
}

// Page title map
const PAGE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: "Dashboard",
  [ROUTES.CONTACTS]: "Contacts",
  [ROUTES.CALL_HISTORY]: "Call History",
  [ROUTES.DETECTION_REPORTS]: "Detection Reports",
  [ROUTES.NOTIFICATIONS]: "Notifications",
  [ROUTES.PROFILE]: "Profile",
  [ROUTES.SETTINGS]: "Settings",
};

const Topbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const callMenuRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { unreadCount } = useNotifications();
  const { startCall } = useCall();

  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentFetched, setRecentFetched] = useState(false);

  const pageTitle = PAGE_TITLES[location.pathname] ?? "RingWave";

  // Fetch recent-called contacts the first time the call menu opens.
  useEffect(() => {
    if (!callMenuOpen || recentFetched) return;

    const fetchRecent = async () => {
      setRecentLoading(true);
      try {
        const res = await axiosInstance.get("/calls/history", {
          params: { page: 1, limit: 20 },
        });

        const seen = new Map<number, string>();
        for (const call of res.data.data.calls) {
          const iAmCaller = call.caller_id === user?.id;
          const otherId = iAmCaller ? call.receiver_id : call.caller_id;
          const otherName = iAmCaller ? call.receiver_name : call.caller_name;

          if (!seen.has(otherId) && otherName) {
            seen.set(otherId, otherName);
          }
        }

        setRecentContacts(
          [...seen.entries()].slice(0, 5).map(([id, name]) => ({ id, name }))
        );
      } catch (err) {
        console.error("Failed to fetch recent contacts:", err);
      } finally {
        setRecentLoading(false);
        setRecentFetched(true);
      }
    };

    fetchRecent();
  }, [callMenuOpen, recentFetched, user]);

  const handleQuickCall = (contact: RecentContact) => {
    startCall([{ id: contact.id, name: contact.name }]);
    setCallMenuOpen(false);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (callMenuRef.current && !callMenuRef.current.contains(e.target as Node)) {
        setCallMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    // Best-effort: revoke this session's refresh token server-side before
    // clearing local state. If this fails (network down, token already
    // expired/revoked), the user should still be logged out locally --
    // the backend's /auth/logout is idempotent and never something worth
    // blocking sign-out on.
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      try {
        await axiosInstance.post("/auth/logout", { refreshToken });
      } catch (err) {
        console.warn("[Topbar] Failed to revoke refresh token on logout:", err);
      }
    }

    logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <header className="relative z-40 h-16 bg-[#0F172A]/80 backdrop-blur-xl border-b border-[#334155]/60 flex items-center px-6 gap-4 shrink-0">

      {/* Page title */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[#F8FAFC] font-semibold text-lg whitespace-nowrap">
          {pageTitle}
        </h1>
      </div>

      {/* Search bar */}
      <div className="flex-1 max-w-md mx-auto">
        <motion.div
          animate={{
            borderColor: searchFocused
              ? "rgba(6,182,212,0.6)"
              : "rgba(51,65,85,0.6)",
          }}
          className="relative flex items-center bg-[#1E293B]/60 border rounded-xl px-3 py-2 gap-2 transition-all"
        >
          <Search className="w-4 h-4 text-[#94A3B8] shrink-0" />
          <input
            type="text"
            placeholder="Search contacts, calls, reports..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="bg-transparent text-[#F8FAFC] text-sm placeholder-[#334155] outline-none w-full"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue("")}
              className="text-[#94A3B8] hover:text-[#F8FAFC] transition-colors text-xs"
            >
              ✕
            </button>
          )}
        </motion.div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">

        {/* Quick call — recent contacts */}
        <div className="relative" ref={callMenuRef}>
          <motion.button
            onClick={() => setCallMenuOpen((o) => !o)}
            className="w-9 h-9 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center text-[#22C55E] hover:bg-[#22C55E]/20 transition-colors"
            whileTap={{ scale: 0.95 }}
            title="New call"
          >
            <Phone className="w-4 h-4" />
          </motion.button>

          <AnimatePresence>
            {callMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 w-64 bg-[#1E293B] border border-[#334155]/60 rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-[#334155]/60">
                  <p className="text-[#F8FAFC] text-sm font-semibold">Call someone</p>
                  <p className="text-[#94A3B8] text-xs mt-0.5">Recently called</p>
                </div>

                <div className="py-1 max-h-64 overflow-y-auto">
                  {recentLoading ? (
                    <p className="px-4 py-3 text-[#94A3B8] text-sm">Loading...</p>
                  ) : recentContacts.length === 0 ? (
                    <p className="px-4 py-3 text-[#94A3B8] text-sm">
                      No recent calls yet.
                    </p>
                  ) : (
                    recentContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => handleQuickCall(contact)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[#F8FAFC] hover:bg-[#334155]/40 transition-colors text-sm"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center shrink-0">
                          <span className="text-[#94A3B8] text-[10px] font-bold">
                            {getInitials(contact.name)}
                          </span>
                        </div>
                        <span className="flex-1 text-left truncate">{contact.name}</span>
                        <PhoneCall className="w-3.5 h-3.5 text-[#22C55E]" />
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-[#334155]/60 py-1">
                  <button
                    onClick={() => {
                      navigate(ROUTES.CONTACTS);
                      setCallMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[#06B6D4] hover:bg-[#334155]/40 transition-colors text-sm"
                  >
                    <User className="w-4 h-4" />
                    Browse all contacts
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <motion.button
          onClick={() => navigate(ROUTES.NOTIFICATIONS)}
          className="relative w-9 h-9 rounded-xl bg-[#1E293B] border border-[#334155]/60 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#334155] transition-colors"
          whileTap={{ scale: 0.95 }}
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-[#EF4444] rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </motion.button>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((p) => !p)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-[#1E293B] border border-[#334155]/60 hover:border-[#334155] transition-colors"
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-[#06B6D4]/20 border border-[#06B6D4]/30 flex items-center justify-center">
              <span className="text-[#06B6D4] text-xs font-bold">
                {user ? getInitials(user.name) : "U"}
              </span>
            </div>
            <span className="text-[#F8FAFC] text-sm font-medium max-w-[100px] truncate hidden sm:block">
              {user?.name?.split(" ")[0] ?? "User"}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform duration-200 ${
                profileOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-56 bg-[#1E293B] border border-[#334155]/60 rounded-xl shadow-2xl overflow-hidden z-50"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-[#334155]/60">
                  <p className="text-[#F8FAFC] text-sm font-semibold truncate">
                    {user?.name ?? "User"}
                  </p>
                  <p className="text-[#94A3B8] text-xs truncate mt-0.5">
                    {user?.email ?? "user@email.com"}
                  </p>
                  {/* Status */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                    <span className="text-[#22C55E] text-xs">Online</span>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  {[
                    {
                      icon: User,
                      label: "View Profile",
                      to: ROUTES.PROFILE,
                    },
                    {
                      icon: Settings,
                      label: "Settings",
                      to: ROUTES.SETTINGS,
                    },
                    {
                      icon: Bell,
                      label: "Notifications",
                      to: ROUTES.NOTIFICATIONS,
                    },
                  ].map((item) => (
                    <button
                      key={item.to}
                      onClick={() => {
                        navigate(item.to);
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155]/40 transition-colors text-sm"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Logout */}
                <div className="border-t border-[#334155]/60 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors text-sm"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

export default Topbar;