import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/infrastructure/db/prisma/client";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Payroll" };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default async function PayrollPage() {
  const session = await requireSession();
  const records = await prisma.payrollRecord.findMany({
    where: { userId: session.user.id },
    orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
  });

  const ytdGross = records.filter((r) => r.payPeriodYear === new Date().getFullYear())
    .reduce((s, r) => s + Number(r.grossSalary), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll Records</h1>
          <p className="text-sm text-gray-500">YTD Gross: {fmt(ytdGross)}</p>
        </div>
        <Link href="/payroll/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Add Record
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="grid grid-cols-6 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>Period</span>
            <span className="text-right">Basic</span>
            <span className="text-right">Gross</span>
            <span className="text-right">TDS</span>
            <span className="text-right">Net Pay</span>
            <span className="text-right">Status</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {records.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No payroll records yet.</p>
              <p className="text-xs text-gray-300 mt-1">Upload a payslip or add a record manually.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {records.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/payroll/${r.id}`}
                    className="grid grid-cols-6 px-6 py-4 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">
                      {MONTHS[r.payPeriodMonth - 1]} {r.payPeriodYear}
                    </span>
                    <span className="text-right text-gray-600">{fmt(Number(r.basicSalary))}</span>
                    <span className="text-right text-gray-900 font-medium">{fmt(Number(r.grossSalary))}</span>
                    <span className="text-right text-red-600">{fmt(Number(r.tdsDeducted))}</span>
                    <span className="text-right text-green-700 font-semibold">{fmt(Number(r.netSalary))}</span>
                    <span className="text-right">
                      <Badge variant={r.isVerified ? "green" : "yellow"}>
                        {r.isVerified ? "Verified" : "Pending"}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
