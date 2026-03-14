import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Guardians from "./pages/Guardians";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const withLayout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={withLayout(<Index />)} />
          <Route path="/students" element={withLayout(<Students />)} />
          <Route path="/students/:id" element={withLayout(<StudentDetail />)} />
          <Route path="/guardians" element={withLayout(<Guardians />)} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
