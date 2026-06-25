"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

function Field({
  label, name, value, onChange, required = false, hint,
}: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        name={name}
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function NewPayrollPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));

  const [basic, setBasic] = useState("");
  const [hra, setHra] = useState("");
  const [lta, setLta] = useState("");
  const [special, setSpecial] = useState("");
  const [medical, setMedical] = useState("");
  const [otherEarnings, setOtherEarnings] = useState("");

  const [pf, setPf] = useState("");
  const [pt, setPt] = useState("");
  const [tds, setTds] = useState("");
  const [esic, setEsic] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");

  // Auto-fill PF as 12% of basic when basic changes
  function handleBasicChange(v: string) {
    setBasic(v);
    const b = parseFloat(v);
    if (!isNaN(b) && b > 0 && pf === "") {
      setPf(String(Math.round(b * 0.12)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const num = (s: string) => (s === "" ? 0 : parseFloat(s));

    const payload = {
      payPeriodMonth: parseInt(month),
      payPeriodYear:  parseInt(year),
      basicSalary:      num(basic),
      hra:              num(hra),
      lta:              num(lta),
      specialAllowance: num(special),
      medicalAllowance: num(medical),
      otherEarnings:    num(otherEarnings),
      providentFund:    num(pf),
      professionalTax:  num(pt),
      tdsDeducted:      num(tds),
      esic:             num(esic),
      otherDeductions:  num(otherDeductions),
      reimbursements:   [],
    };

    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create record.");
        setSubmitting(false);
        return;
      }

      router.push("/payroll");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const gross =
    [basic, hra, lta, special, medical, otherEarnings]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);

  const deductions =
    [pf, pt, tds, esic, otherDeductions]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);

  const net = gross - deductions;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/payroll">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Add Payroll Record</h1>
          <p className="text-sm text-gray-500">Enter salary details for a pay period</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Pay Period */}
        <Card>
          <CardHeader><span className="text-sm font-medium text-gray-700">Pay Period</span></CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Month<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Year<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {YEARS.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </CardBody>
        </Card>

        {/* Earnings */}
        <Card>
          <CardHeader><span className="text-sm font-medium text-gray-700">Earnings</span></CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Basic Salary" name="basic" value={basic} onChange={handleBasicChange} required />
            <Field label="HRA" name="hra" value={hra} onChange={setHra} />
            <Field label="LTA" name="lta" value={lta} onChange={setLta} />
            <Field label="Special Allowance" name="special" value={special} onChange={setSpecial} />
            <Field label="Medical Allowance" name="medical" value={medical} onChange={setMedical} />
            <Field label="Other Earnings" name="otherEarnings" value={otherEarnings} onChange={setOtherEarnings} />
          </CardBody>
        </Card>

        {/* Deductions */}
        <Card>
          <CardHeader><span className="text-sm font-medium text-gray-700">Deductions</span></CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Provident Fund" name="pf" value={pf} onChange={setPf} hint="Auto-filled as 12% of basic" />
            <Field label="Professional Tax" name="pt" value={pt} onChange={setPt} />
            <Field label="TDS Deducted" name="tds" value={tds} onChange={setTds} />
            <Field label="ESIC" name="esic" value={esic} onChange={setEsic} />
            <Field label="Other Deductions" name="otherDeductions" value={otherDeductions} onChange={setOtherDeductions} />
          </CardBody>
        </Card>

        {/* Live Preview */}
        {gross > 0 && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-5 py-4 flex justify-between text-sm">
            <div className="text-gray-500">
              Gross <span className="font-medium text-gray-900 ml-1">{fmt(gross)}</span>
            </div>
            <div className="text-gray-500">
              Deductions <span className="font-medium text-red-600 ml-1">{fmt(deductions)}</span>
            </div>
            <div className="text-gray-500">
              Net Pay <span className="font-semibold text-green-700 ml-1">{fmt(net)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-4 py-2">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <Link href="/payroll">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" disabled={submitting || !basic}>
            {submitting ? "Saving…" : "Save Record"}
          </Button>
        </div>
      </form>
    </div>
  );
}
