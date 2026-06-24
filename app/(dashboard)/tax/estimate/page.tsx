import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { RunTaxSimulationUseCase } from "@/application/use-cases/tax/run-tax-simulation.usecase";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Tax Estimate" };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const useCase = new RunTaxSimulationUseCase();

export default async function TaxEstimatePage() {
  const session = await requireSession();

  let result = null;
  let error = null;
  try {
    result = await useCase.execute(session.user.id, "2024-25");
  } catch (e) {
    error = "Could not compute tax estimate. Ensure payroll records are present.";
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tax Estimate</h1>
          <p className="text-sm text-gray-500">Financial Year 2024-25</p>
        </div>
        {result && (
          <Badge variant={result.taxRegime === "NEW" ? "blue" : "gray"}>
            {result.taxRegime} Regime
          </Badge>
        )}
      </div>

      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-600">{error}</p>
          </CardBody>
        </Card>
      )}

      {result && (
        <>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Income Breakdown</h2>
            </CardHeader>
            <CardBody className="p-0">
              <dl className="divide-y divide-gray-50">
                {[
                  { label: "Gross Income", value: fmt(result.grossIncome) },
                  { label: "Standard Deduction", value: `− ${fmt(result.standardDeduction)}` },
                  { label: "Section 80C", value: `− ${fmt(result.section80C)}` },
                  { label: "Section 80D", value: `− ${fmt(result.section80D)}` },
                  { label: "HRA Exemption", value: `− ${fmt(result.hraExemption)}` },
                  { label: "NPS (80CCD)", value: `− ${fmt(result.npsDeduction)}` },
                  { label: "Taxable Income", value: fmt(result.taxableIncome), bold: true },
                ].map(({ label, value, bold }) => (
                  <div key={label} className="flex justify-between px-6 py-3 text-sm">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Tax Liability</h2>
            </CardHeader>
            <CardBody className="p-0">
              <dl className="divide-y divide-gray-50">
                {[
                  { label: "Estimated Tax Liability", value: fmt(result.estimatedTaxLiability) },
                  { label: "TDS Already Paid", value: `− ${fmt(result.totalTdsPaid)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-6 py-3 text-sm">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-gray-700">{value}</dd>
                  </div>
                ))}
                <div className="flex justify-between px-6 py-4">
                  <dt className="text-base font-semibold text-gray-900">Tax Payable</dt>
                  <dd className={`text-2xl font-bold ${result.taxPayable > 0 ? "text-red-600" : "text-green-600"}`}>
                    {result.taxPayable > 0 ? fmt(result.taxPayable) : `Refund: ${fmt(Math.abs(result.taxPayable))}`}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <p className="text-xs text-gray-400">
            Effective tax rate: {result.effectiveRate.toFixed(2)}% · Computed using {result.taxRegime} regime slabs for FY 2024-25. This is an estimate — consult a CA for filing.
          </p>
        </>
      )}
    </div>
  );
}
