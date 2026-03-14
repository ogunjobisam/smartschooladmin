import { Link } from "react-router-dom";
import { GraduationCap, ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Introduction</h2>
            <p>SmartSchoolAdmin ("we", "our", "us"), a trading name of Smartever Ltd (Company No: 15038603), is committed to protecting the privacy of our users. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-2">We may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-foreground">Account Information:</strong> Name, email address, phone number, and role within your organisation.</li>
              <li><strong className="text-foreground">School Data:</strong> Student records, guardian details, staff information, fee schedules, invoices, and payment records.</li>
              <li><strong className="text-foreground">Usage Data:</strong> Log data, device information, browser type, and pages visited.</li>
              <li><strong className="text-foreground">Communications:</strong> Messages you send to us for support or feedback.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide, operate, and maintain the platform.</li>
              <li>To manage user accounts and authentication.</li>
              <li>To process school management operations including fees, invoices, and payroll.</li>
              <li>To communicate with you about updates, support, and service-related notices.</li>
              <li>To improve our platform and develop new features.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Data Sharing & Disclosure</h2>
            <p>We do not sell your personal data. We may share information with:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Service providers who assist in operating our platform (e.g. hosting, analytics).</li>
              <li>Law enforcement or regulatory bodies when required by law.</li>
              <li>Other users within your organisation as permitted by your role and access level.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Security</h2>
            <p>We implement appropriate technical and organisational measures to protect your data, including encryption in transit and at rest, role-based access controls, and regular security reviews.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your data by contacting us.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights</h2>
            <p>Under applicable data protection laws (including UK GDPR), you have the right to access, correct, delete, or port your personal data, and to object to or restrict certain processing. Contact us to exercise these rights.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at <strong className="text-foreground">privacy@smartschooladmin.com</strong>.</p>
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
