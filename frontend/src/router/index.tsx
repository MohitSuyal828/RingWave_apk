import { createBrowserRouter } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

import ProtectedRoute from "@/components/routing/ProtectedRoute";
import GuestRoute from "@/components/routing/GuestRoute";
import AppLayout from "@/components/layout/AppLayout";
import AuthLayout from "@/components/layout/AuthLayout";

import SplashPage from "@/pages/SplashPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import ContactsPage from "@/pages/ContactsPage";
import IncomingCallPage from "@/pages/calls/IncomingCallPage";
import OutgoingCallPage from "@/pages/calls/OutgoingCallPage";
import ActiveCallPage from "@/pages/calls/ActiveCallPage";
import GroupCallPage from "@/pages/calls/GroupCallPage";
import DetectionReportsPage from "@/pages/DetectionReportsPage";
import CallHistoryPage from "@/pages/CallHistoryPage";
import ProfilePage from "@/pages/ProfilePage";
import SettingsPage from "@/pages/SettingsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFoundPage from "@/pages/NotFoundPage";

export const router = createBrowserRouter([
  // ─── Public ────────────────────────────────────────────────────────────────
  { path: ROUTES.SPLASH, element: <SplashPage /> },

  // ─── Guest only (redirect to dashboard if logged in) ───────────────────────
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: ROUTES.LOGIN, element: <LoginPage /> },
          { path: ROUTES.REGISTER, element: <RegisterPage /> },
          { path: ROUTES.FORGOT_PASSWORD, element: <ForgotPasswordPage /> },
          { path: ROUTES.RESET_PASSWORD, element: <ResetPasswordPage /> },
        ],
      },
    ],
  },

  // ─── Protected (must be authenticated) ─────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: ROUTES.DASHBOARD, element: <DashboardPage /> },
          { path: ROUTES.CONTACTS, element: <ContactsPage /> },
          { path: ROUTES.DETECTION_REPORTS, element: <DetectionReportsPage /> },
          { path: ROUTES.CALL_HISTORY, element: <CallHistoryPage /> },
          { path: ROUTES.PROFILE, element: <ProfilePage /> },
          { path: ROUTES.SETTINGS, element: <SettingsPage /> },
          { path: ROUTES.NOTIFICATIONS, element: <NotificationsPage /> },
        ],
      },
      // Full-screen call pages (no sidebar/topbar)
      { path: ROUTES.INCOMING_CALL, element: <IncomingCallPage /> },
      { path: ROUTES.OUTGOING_CALL, element: <OutgoingCallPage /> },
      { path: ROUTES.ACTIVE_CALL, element: <ActiveCallPage /> },
      { path: ROUTES.GROUP_CALL, element: <GroupCallPage /> },
    ],
  },

  // ─── 404 ───────────────────────────────────────────────────────────────────
  { path: ROUTES.NOT_FOUND, element: <NotFoundPage /> },
]);