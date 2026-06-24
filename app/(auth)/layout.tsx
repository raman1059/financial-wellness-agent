import { TrendingUp } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 bg-brand-700 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold">FinWell AI</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-relaxed text-white/90">
            "Your personal CA — available 24/7, grounded in your real financial data."
          </blockquote>
          <div className="mt-8 grid grid-cols-3 gap-6">
            {[
              { label: "Tax Estimation", desc: "Real-time liability" },
              { label: "Payroll Insights", desc: "Month-on-month" },
              { label: "AI Advisor", desc: "Grounded answers" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-white/10 p-4">
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-xs text-white/60 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">
          Not financial advice. Consult a CA for regulated decisions.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
