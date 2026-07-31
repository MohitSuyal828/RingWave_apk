import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  History,
  ShieldAlert,
  Settings,
  Bell,
  User,
  LogOut,
  Wifi,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/authStore";
import { getInitials } from "@/lib/utils";
import { axiosInstance } from "@/services/axios";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    to: ROUTES.DASHBOARD,
  },
  {
    label: "Contacts",
    icon: Users,
    to: ROUTES.CONTACTS,
  },
  {
    label: "Call History",
    icon: History,
    to: ROUTES.CALL_HISTORY,
  },
  {
    label: "Detection Reports",
    icon: ShieldAlert,
    to: ROUTES.DETECTION_REPORTS,
  },
  {
    label: "Notifications",
    icon: Bell,
    to: ROUTES.NOTIFICATIONS,
  },
];

const BOTTOM_ITEMS = [
  {
    label: "Profile",
    icon: User,
    to: ROUTES.PROFILE,
  },
  {
    label: "Settings",
    icon: Settings,
    to: ROUTES.SETTINGS,
  },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    // Best-effort: revoke this session's refresh token server-side before
    // clearing local state — mirrors Topbar.tsx's logout handler. Failure
    // here (network down, token already revoked/expired) should never
    // block a local sign-out.
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      try {
        await axiosInstance.post("/auth/logout", { refreshToken });
      } catch (err) {
        console.warn("[Sidebar] Failed to revoke refresh token on logout:", err);
      }
    }

    logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative h-screen bg-[#0F172A] border-r border-[#334155]/60 flex flex-col shrink-0"
    >
      {/* Collapse toggle — deliberately sits half outside the sidebar's
          right edge, so it must NOT be inside an overflow-hidden ancestor. */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-[72px] w-6 h-6 bg-[#1E293B] border border-[#334155] rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#06B6D4] hover:border-[#06B6D4]/50 transition-colors z-10 shrink-0"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>

      <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#334155]/60 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center shrink-0">
          <Wifi className="w-4 h-4 text-[#06B6D4]" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="ml-3 text-lg font-bold text-[#F8FAFC] whitespace-nowrap"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              Ring<span className="text-[#06B6D4]">Wave</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>


      {/* Main nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 h-px bg-[#334155]/60" />

      {/* Bottom nav */}
      <div className="py-4 px-2 space-y-1">
        {BOTTOM_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
            collapsed={collapsed}
          />
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all duration-200 group"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                className="text-sm font-medium whitespace-nowrap"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* User profile strip */}
      <div className="mx-2 mb-3 p-2 bg-[#1E293B]/60 border border-[#334155]/40 rounded-xl">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#06B6D4]/20 border border-[#06B6D4]/30 flex items-center justify-center shrink-0">
            <span className="text-[#06B6D4] text-xs font-bold">
              {user ? getInitials(user.name) : "U"}
            </span>
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="overflow-hidden"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-[#F8FAFC] text-sm font-medium whitespace-nowrap truncate max-w-[130px]">
                  {user?.name ?? "User"}
                </p>
                <p className="text-[#94A3B8] text-xs whitespace-nowrap truncate max-w-[130px]">
                  {user?.email ?? ""}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>
    </motion.aside>
  );
};

// ─── Nav Item ──────────────────────────────────────────────────────────────────
interface SidebarNavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  collapsed: boolean;
}

const SidebarNavItem = ({
  icon: Icon,
  label,
  to,
  collapsed,
}: SidebarNavItemProps) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
        ${
          isActive
            ? "bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/20"
            : "text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active indicator bar */}
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#06B6D4] rounded-full"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <Icon className="w-5 h-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                className="text-sm font-medium whitespace-nowrap"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </NavLink>
  );
};

export default Sidebar;