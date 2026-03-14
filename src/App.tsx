import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Students from "./pages/Students";
import Guardians from "./pages/Guardians";
import Staff from "./pages/Staff";
import Fees from "./pages/Fees";
import Invoices from "./pages/Invoices";
import Payments from "./pages/Payments";
import Arrears from "./pages/Arrears";
import Payroll from "./pages/Payroll";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout><Index /></AppLayout>} path="/" />
          <Route element={<AppLayout><Students /></AppLayout>} path="/students" />
          <Route element={<AppLayout><Guardians /></AppLayout>} path="/guardians" />
          <Route element={<AppLayout><Staff /></AppLayout>} path="/staff" />
          <Route element={<AppLayout><Fees /></AppLayout>} path="/fees" />
          <Route element={<AppLayout><Invoices /></AppLayout>} path="/invoices" />
          <Route element={<AppLayout><Payments /></AppLayout>} path="/payments" />
          <Route element={<AppLayout><Arrears /></AppLayout>} path="/arrears" />
          <Route element={<AppLayout><Payroll /></AppLayout>} path="/payroll" />
          <Route element={<AppLayout><Approvals /></AppLayout>} path="/approvals" />
          <Route element={<AppLayout><Reports /></AppLayout>} path="/reports" />
          <Route element={<AppLayout><AuditLog /></AppLayout>} path="/audit-log" />
          <Route element={<AppLayout><SettingsPage /></AppLayout>} path="/settings" />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
