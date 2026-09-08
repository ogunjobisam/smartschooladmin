import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SchoolBrandingProvider } from "@/contexts/SchoolBrandingContext";
import { ProtectedRoute, RequireAccess } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";

// Entry points stay in the main bundle so the first paint needs no extra round trip.
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Everything else is split per route: the app is large and most users only ever
// touch a handful of these screens.
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

const Index = lazy(() => import("./pages/Index"));
const Students = lazy(() => import("./pages/Students"));
const StudentDetail = lazy(() => import("./pages/StudentDetail"));
const Guardians = lazy(() => import("./pages/Guardians"));
const GuardianDetail = lazy(() => import("./pages/GuardianDetail"));
const Staff = lazy(() => import("./pages/Staff"));
const StaffDetail = lazy(() => import("./pages/StaffDetail"));
const Fees = lazy(() => import("./pages/Fees"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const Payments = lazy(() => import("./pages/Payments"));
const RecordPayment = lazy(() => import("./pages/RecordPayment"));
const Arrears = lazy(() => import("./pages/Arrears"));
const Payroll = lazy(() => import("./pages/Payroll"));
const StaffPay = lazy(() => import("./pages/StaffPay"));
const PayrollRunDetail = lazy(() => import("./pages/PayrollRunDetail"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Reports = lazy(() => import("./pages/Reports"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const RolesAccess = lazy(() => import("./pages/RolesAccess"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SchoolProfile = lazy(() => import("./pages/SchoolProfile"));
const ParentDashboard = lazy(() => import("./pages/ParentDashboard"));
const StudentPortal = lazy(() => import("./pages/StudentPortal"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const NotificationHistory = lazy(() => import("./pages/NotificationHistory"));
const MessageDelivery = lazy(() => import("./pages/MessageDelivery"));
const StaffPortal = lazy(() => import("./pages/StaffPortal"));
const ProprietorDashboard = lazy(() => import("./pages/ProprietorDashboard"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Exams = lazy(() => import("./pages/Exams"));
const Performance = lazy(() => import("./pages/Performance"));
const ExamDetail = lazy(() => import("./pages/ExamDetail"));
const Announcements = lazy(() => import("./pages/Announcements"));
const Events = lazy(() => import("./pages/Events"));
const Transport = lazy(() => import("./pages/Transport"));
const Achievements = lazy(() => import("./pages/Achievements"));
const AchievementWall = lazy(() => import("./pages/AchievementWall"));
const Admissions = lazy(() => import("./pages/Admissions"));
const Apply = lazy(() => import("./pages/Apply"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const NotificationTemplates = lazy(() => import("./pages/NotificationTemplates"));
const MyResults = lazy(() => import("./pages/student/MyResults"));
const MyAttendance = lazy(() => import("./pages/student/MyAttendance"));
const MyTimetable = lazy(() => import("./pages/student/MyTimetable"));
const Timetable = lazy(() => import("./pages/Timetable"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401/403 from row-level security will never succeed on retry, and
      // hammering it just delays the empty state the user needs to see.
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

const withLayout = (page: React.ReactNode) => (
  <ProtectedRoute>
    <AppLayout>
      <RequireAccess>{page}</RequireAccess>
    </AppLayout>
  </ProtectedRoute>
);

function AppRoutes() {
  const location = useLocation();

  return (
    // Keyed on the path so navigating away from a broken page clears the error.
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          {/* A prospective parent is not a user of the app — no auth, no layout. */}
          <Route path="/apply/:slug" element={<Apply />} />

          {/* Signed in, but before an organisation exists */}
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

          {/* Protected app routes */}
          <Route path="/dashboard" element={withLayout(<Index />)} />
          <Route path="/admissions" element={withLayout(<Admissions />)} />
          <Route path="/students" element={withLayout(<Students />)} />
          <Route path="/students/:id" element={withLayout(<StudentDetail />)} />
          <Route path="/guardians" element={withLayout(<Guardians />)} />
          <Route path="/guardians/:id" element={withLayout(<GuardianDetail />)} />
          <Route path="/staff" element={withLayout(<Staff />)} />
          <Route path="/staff/:id" element={withLayout(<StaffDetail />)} />
          <Route path="/fees" element={withLayout(<Fees />)} />
          <Route path="/invoices" element={withLayout(<Invoices />)} />
          <Route path="/invoices/:id" element={withLayout(<InvoiceDetail />)} />
          <Route path="/payments" element={withLayout(<Payments />)} />
          <Route path="/payments/new" element={withLayout(<RecordPayment />)} />
          <Route path="/arrears" element={withLayout(<Arrears />)} />
          <Route path="/payroll" element={withLayout(<Payroll />)} />
          <Route path="/payroll/:id" element={withLayout(<PayrollRunDetail />)} />
          <Route path="/my-pay" element={withLayout(<StaffPay />)} />
          <Route path="/approvals" element={withLayout(<Approvals />)} />
          <Route path="/reports" element={withLayout(<Reports />)} />
          <Route path="/audit-log" element={withLayout(<AuditLog />)} />
          <Route path="/school-profile" element={withLayout(<SchoolProfile />)} />
          <Route path="/settings" element={withLayout(<SettingsPage />)} />
          <Route path="/users" element={withLayout(<UserManagement />)} />
          <Route path="/roles" element={withLayout(<RolesAccess />)} />
          <Route path="/parent" element={withLayout(<ParentDashboard />)} />
          <Route path="/student" element={withLayout(<StudentPortal />)} />
          <Route path="/student/results" element={withLayout(<MyResults />)} />
          <Route path="/student/attendance" element={withLayout(<MyAttendance />)} />
          <Route path="/student/timetable" element={withLayout(<MyTimetable />)} />
          <Route path="/timetable" element={withLayout(<Timetable />)} />
          <Route path="/notifications" element={withLayout(<NotificationHistory />)} />
          <Route path="/group-overview" element={withLayout(<ProprietorDashboard />)} />
          <Route path="/attendance" element={withLayout(<Attendance />)} />
          <Route path="/exams" element={withLayout(<Exams />)} />
          <Route path="/performance" element={withLayout(<Performance />)} />
          <Route path="/exams/:id" element={withLayout(<ExamDetail />)} />
          <Route path="/announcements" element={withLayout(<Announcements />)} />
          <Route path="/events" element={withLayout(<Events />)} />
          <Route path="/transport" element={withLayout(<Transport />)} />
          <Route path="/achievements" element={withLayout(<Achievements />)} />
          <Route path="/wall" element={withLayout(<AchievementWall />)} />
          <Route path="/notification-settings" element={withLayout(<NotificationSettings />)} />
          <Route path="/notification-templates" element={withLayout(<NotificationTemplates />)} />
          <Route path="/message-delivery" element={withLayout(<MessageDelivery />)} />
          <Route path="/staff-portal" element={withLayout(<StaffPortal />)} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SchoolBrandingProvider>
            <AppRoutes />
          </SchoolBrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
