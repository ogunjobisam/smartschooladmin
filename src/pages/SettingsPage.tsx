import { Settings } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your school and platform settings." />
      <EmptyState
        icon={Settings}
        title="Settings coming soon"
        description="School profile, branding, academic configuration, fee rules, and payroll settings will be configured here."
      />
    </div>
  );
}
