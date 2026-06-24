import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/infrastructure/db/prisma/client";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Deductions" };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default async function DeductionsPage() {
  const session = await requireSession();

  const declaration = await prisma.taxDeclaration.findFirst({
    where: { userId: session.user.id, financialYear: "2024-25" },
    include: { investmentProofs: true },
  });

  const deductions = declaration
    ? [
        { label: "PPF", section: "80C", amount: Number(declaration.ppfAmount), max: 150000 },
        { label: "ELSS", section: "80C", amount: Number(declaration.elssAmount), max: 150000 },
        { label: "Life Insurance Premium", section: "80C", amount: Number(declaration.lifeInsurance), max: 150000 },
        { label: "Home Loan Principal", section: "80C", amount: Number(declaration.homeLoanPrincipal), max: 150000 },
        { label: "NSC", section: "80C", amount: Number(declaration.nscAmount), max: 150000 },
        { label: "Self Health Insurance", section: "80D", amount: Number(declaration.selfHealthInsurance), max: 25000 },
        { label: "Parent Health Insurance", section: "80D", amount: Number(declaration.parentHealthInsurance), max: 50000 },
        { label: "NPS Contribution", section: "80CCD(1B)", amount: Number(declaration.npsContribution), max: 50000 },
        { label: "Home Loan Interest", section: "24(b)", amount: Number(declaration.homeLoanInterest), max: 200000 },
      ].filter((d) => d.amount > 0)
    : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Deduction Finder</h1>
        <p className="text-sm text-gray-500">FY 2024-25 declared deductions</p>
      </div>

      {deductions.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-center text-gray-400 py-6">
              No deductions found. Complete your tax declaration to see deductions.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Declared Deductions</h2>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-50">
              {deductions.map((d) => {
                const utilization = Math.min((d.amount / d.max) * 100, 100);
                return (
                  <li key={d.label} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{d.label}</p>
                        <Badge variant="blue" className="mt-0.5">Section {d.section}</Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{fmt(d.amount)}</p>
                        <p className="text-xs text-gray-400">of {fmt(d.max)} limit</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
