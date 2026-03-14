import { Link } from "react-router-dom";
import { GraduationCap, ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">SmartSchool</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using SmartSchoolAdmin ("the Platform"), a trading name of Smartever Ltd (Company No: 15038603, registered in England & Wales), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Description of Service</h2>
            <p>SmartSchoolAdmin provides a cloud-based school management platform that enables educational institutions to manage students, staff, fees, invoices, payroll, and related administrative operations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. User Accounts</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You must notify us immediately of any unauthorised use of your account.</li>
              <li>Organisation administrators are responsible for managing user access and permissions within their organisation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Acceptable Use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Platform for any unlawful purpose.</li>
              <li>Upload false, misleading, or fraudulent data.</li>
              <li>Attempt to gain unauthorised access to other users' accounts or data.</li>
              <li>Interfere with or disrupt the Platform's infrastructure.</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Ownership</h2>
            <p>You retain ownership of all data you input into the Platform. We do not claim ownership of your school data, student records, or financial information. You grant us a limited licence to process this data solely to provide the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Service Availability</h2>
            <p>We strive to maintain high availability but do not guarantee uninterrupted access. We may perform maintenance that temporarily affects service. We will endeavour to provide advance notice of planned downtime.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Fees & Payment</h2>
            <p>Certain features of the Platform may require a paid subscription. Pricing, billing cycles, and payment terms will be communicated to you before any charges apply. We reserve the right to modify pricing with reasonable notice.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, Smartever Ltd shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Termination</h2>
            <p>We may suspend or terminate your access to the Platform if you breach these Terms. You may terminate your account at any time by contacting us. Upon termination, your right to use the Platform ceases immediately.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to Terms</h2>
            <p>We may update these Terms from time to time. We will notify registered users of material changes. Continued use of the Platform after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Governing Law</h2>
            <p>These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">12. Contact Us</h2>
            <p>If you have questions about these Terms, please contact us at <strong className="text-foreground">legal@smartschooladmin.com</strong>.</p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto max-w-4xl px-6 text-xs text-muted-foreground">
          <p>SmartSchoolAdmin is a trading name of Smartever Ltd. Registered in England &amp; Wales. Company No: 15038603</p>
        </div>
      </footer>
    </div>
  );
}
