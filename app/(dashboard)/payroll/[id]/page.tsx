import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/infrastructure/db/prisma/client";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Payroll Detail" };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const record = await prisma.payrollRecord.findFirst({ where: { id, userId: session.user.id } });
  if (!record) notFound();

  const rows = [
    { section: "Earnings", items: [
      { label: "Basic Salary", value: Number(record.basicSalary) },
      { label: "HRA", value: Number(record.hra) },
      { label: "Special Allowance", value: Number(record.specialAllowance) },
      { label: "LTA", value: Number(record.lta) },
      { label: "Medical Allowance", value: Number(record.medicalAllowance) },
      { label: "Other Earnings", value: Number(record.otherEarnings) },
      { label: "Gross Salary", value: Number(record.grossSalary), bold: true },
    ]},
    { section: "Deductions", items: [
      { label: "Provident Fund (PF)", value: Number(record.providentFund) },
      { label: "Professional Tax", value: Number(record.professionalTax) },
      { label: "TDS Deducted", value: Number(record.tdsDeducted) },
      { label: "ESIC", value: Number(record.esic) },
      { label: "Other Deductions", value: Number(record.otherDeductions) },
      { label: "Total Deductions", value: Number(record.totalDeductions), bold: true },
    ]},
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/payroll" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {MONTHS[record.payPeriodMonth - 1]} {record.payPeriodYear} — Payslip
          </h1>
          <Badge variant={record.isVerified ? "green" : "yellow"}>
            {record.isVerified ? "Verified" : "Pending Verification"}
          </Badge>
        </div>
      </div>

      {rows.map(({ section, items }) => (
        <Card key={section}>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">{section}</h2>
          </CardHeader>
          <CardBody className="p-0">
            <dl className="divide-y divide-gray-50">
              {items.map(({ label, value, bold }) => (
                <div key={label} className="flex justify-between px-6 py-3 text-sm">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{fmt(value)}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardBody>
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-gray-900">Net Pay</span>
            <span className="text-2xl font-bold text-green-700">{fmt(Number(record.netSalary))}</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
