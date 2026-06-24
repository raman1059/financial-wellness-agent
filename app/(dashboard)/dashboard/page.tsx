import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/infrastructure/db/prisma/client";
import { StatsCard } from "@/components/features/dashboard/stats-card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, TrendingUp, FileText, Calculator } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default async function DashboardPage() {
  const session = await requireSession();
  const currentYear = new Date().getFullYear();

  const [payrollRecords, declaration, docCount, chatCount] = await Promise.all([
    prisma.payrollRecord.findMany({
      where: { userId: session.user.id, payPeriodYear: currentYear },
      orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
      take: 6,
    }),
    prisma.taxDeclaration.findFirst({
      where: { userId: session.user.id, financialYear: "2024-25" },
    }),
    prisma.payslip.count({ where: { userId: session.user.id } }),
    prisma.chatSession.count({ where: { userId: session.user.id } }),
  ]);

  const ytdGross = payrollRecords.reduce((s, r) => s + Number(r.grossSalary), 0);
  const ytdNet = payrollRecords.reduce((s, r) => s + Number(r.netSalary), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Good {new Date().getHours() < 12 ? "morning" : "afternoon"},{" "}
          {session.user.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your financial snapshot for {currentYear}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard title="YTD Gross Income" value={fmt(ytdGross)} subtitle={`${payrollRecords.length} months recorded`} icon={IndianRupee} iconColor="bg-brand-50 text-brand-600" />
        <StatsCard title="YTD Net Pay" value={fmt(ytdNet)} subtitle="After all deductions" icon={TrendingUp} iconColor="bg-green-50 text-green-600" />
        <StatsCard title="Documents" value={String(docCount)} subtitle="Payslips uploaded" icon={FileText} iconColor="bg-purple-50 text-purple-600" />
        <StatsCard title="Tax Payable" value={declaration ? fmt(Number(declaration.taxPayable)) : "—"} subtitle="FY 2024-25 estimate" icon={Calculator} iconColor="bg-orange-50 text-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Recent Payroll</h2>
          </CardHeader>
          <CardBody className="p-0">
            {payrollRecords.length === 0 ? (
              <p className="px-6 py-8 text-sm text-center text-gray-400">No payroll records yet</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {payrollRecords.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {MONTHS[r.payPeriodMonth - 1]} {r.payPeriodYear}
                      </p>
                      <p className="text-xs text-gray-400">Net: {fmt(Number(r.netSalary))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{fmt(Number(r.grossSalary))}</p>
                      <Badge variant={r.isVerified ? "green" : "yellow"}>
                        {r.isVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Tax Summary — FY 2024-25</h2>
          </CardHeader>
          <CardBody>
            {declaration ? (
              <dl className="space-y-3">
                {[
                  { label: "Gross Income", value: fmt(Number(declaration.grossIncome)) },
                  { label: "Total Deductions", value: fmt(Number(declaration.totalDeductions)) },
                  { label: "Taxable Income", value: fmt(Number(declaration.taxableIncome)) },
                  { label: "TDS Already Paid", value: fmt(Number(declaration.totalTdsPaid)) },
                  { label: "Tax Payable", value: fmt(Number(declaration.taxPayable)), bold: true },
                ].map(({ label, value, bold }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No tax declaration found. Go to Tax Estimate to generate one.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
