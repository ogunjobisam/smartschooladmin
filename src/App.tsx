import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SchoolBrandingProvider } from "@/contexts/SchoolBrandingContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

// Auth pages
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Landing from "./pages/Landing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

// App pages
import Index from "./pages/Index";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Guardians from "./pages/Guardians";
import GuardianDetail from "./pages/GuardianDetail";
import Staff from "./pages/Staff";
import StaffDetail from "./pages/StaffDetail";
import Fees from "./pages/Fees";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Payments from "./pages/Payments";
import RecordPayment from "./pages/RecordPayment";
import Arrears from "./pages/Arrears";
import Payroll from "./pages/Payroll";
import PayrollRunDetail from "./pages/PayrollRunDetail";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";
import SettingsPage from "./pages/SettingsPage";
import ParentDashboard from "./pages/ParentDashboard";
import UserManagement from "./pages/UserManagement";
import NotificationHistory from "./pages/NotificationHistory";
import ProprietorDashboard from "./pages/ProprietorDashboard";
import Attendance from "./pages/Attendance";
import Exams from "./pages/Exams";
import ExamDetail from "./pages/ExamDetail";
import Announcements from "./pages/Announcements";
import NotificationSettings from "./pages/NotificationSettings";
import NotificationTemplates from "./pages/NotificationTemplates";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const withLayout = (page: React.ReactNode) => (
  <ProtectedRoute>
    <AppLayout>{page}</AppLayout>
  </ProtectedRoute>
);


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SchoolBrandingProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

            {/* Protected app routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/dashboard" element={withLayout(<Index />)} />
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
            <Route path="/approvals" element={withLayout(<Approvals />)} />
            <Route path="/reports" element={withLayout(<Reports />)} />
            <Route path="/audit-log" element={withLayout(<AuditLog />)} />
            <Route path="/settings" element={withLayout(<SettingsPage />)} />
            <Route path="/users" element={withLayout(<UserManagement />)} />
            <Route path="/parent" element={withLayout(<ParentDashboard />)} />
            <Route path="/notifications" element={withLayout(<NotificationHistory />)} />
            <Route path="/group-overview" element={withLayout(<ProprietorDashboard />)} />
            <Route path="/attendance" element={withLayout(<Attendance />)} />
            <Route path="/exams" element={withLayout(<Exams />)} />
            <Route path="/exams/:id" element={withLayout(<ExamDetail />)} />
            <Route path="/announcements" element={withLayout(<Announcements />)} />
            <Route path="/notification-settings" element={withLayout(<NotificationSettings />)} />
            <Route path="/notification-templates" element={withLayout(<NotificationTemplates />)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </SchoolBrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
