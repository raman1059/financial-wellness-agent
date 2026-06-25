import { PrismaClient, TaxRegime } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const passwordHash = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Arpit Tiwari",
      passwordHash,
      role: "USER",
      emailVerified: new Date(),
    },
  });

  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      employeeCode: "EMP-001",
      designation: "Senior Software Engineer",
      department: "Engineering",
      employmentType: "SALARIED",
      employerName: "TechCorp India Pvt Ltd",
      dateOfJoining: new Date("2022-04-01"),
      residentialState: "IN-MH",
    },
  });

  const payrollData = [
    { month: 1, year: 2025, basic: 85000, hra: 34000, special: 21000, pf: 10200, tax: 12500 },
    { month: 2, year: 2025, basic: 85000, hra: 34000, special: 21000, pf: 10200, tax: 12500 },
    { month: 3, year: 2025, basic: 85000, hra: 34000, special: 21000, pf: 10200, tax: 12500 },
    { month: 4, year: 2025, basic: 85000, hra: 34000, special: 25000, pf: 10200, tax: 13000 },
    { month: 5, year: 2025, basic: 85000, hra: 34000, special: 25000, pf: 10200, tax: 13000 },
    { month: 6, year: 2025, basic: 90000, hra: 36000, special: 25000, pf: 10800, tax: 14500 },
  ];

  for (const p of payrollData) {
    const gross = p.basic + p.hra + p.special;
    const totalDed = p.pf + p.tax + 200;
    await prisma.payrollRecord.upsert({
      where: {
        employeeId_payPeriodMonth_payPeriodYear: {
          employeeId: employee.id,
          payPeriodMonth: p.month,
          payPeriodYear: p.year,
        },
      },
      update: {},
      create: {
        employeeId: employee.id,
        userId: user.id,
        payPeriodMonth: p.month,
        payPeriodYear: p.year,
        basicSalary: p.basic,
        hra: p.hra,
        specialAllowance: p.special,
        grossSalary: gross,
        providentFund: p.pf,
        professionalTax: 200,
        tdsDeducted: p.tax,
        totalDeductions: totalDed,
        netSalary: gross - totalDed,
        isVerified: true,
      },
    });
  }

  await prisma.taxDeclaration.upsert({
    where: {
      employeeId_financialYear: {
        employeeId: employee.id,
        financialYear: "2024-25",
      },
    },
    update: {},
    create: {
      employeeId: employee.id,
      userId: user.id,
      financialYear: "2024-25",
      taxRegime: TaxRegime.NEW,
      ppfAmount: 50000,
      elssAmount: 50000,
      lifeInsurance: 25000,
      total80C: 125000,
      selfHealthInsurance: 25000,
      hraReceived: 34000,
      hraExempt: 25000,
      grossIncome: 1710000,
      standardDeduction: 50000,
      totalDeductions: 200000,
      taxableIncome: 1460000,
      estimatedTaxLiability: 196500,
      totalTdsPaid: 150000,
      taxPayable: 46500,
    },
  });

  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      title: "Tax planning for FY 2024-25",
      contextPayload: {
        financialYear: "2024-25",
        activeTaxDeclarationId: null,
      },
    },
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: session.id,
        userId: user.id,
        role: "USER",
        content: "What is my estimated tax liability for FY 2024-25?",
        isGrounded: true,
      },
      {
        sessionId: session.id,
        userId: user.id,
        role: "ASSISTANT",
        content:
          "Based on your payroll records, your gross income for FY 2024-25 is ₹17,10,000. After applying the standard deduction of ₹50,000 and your Section 80C investments of ₹1,25,000, your taxable income under the New Regime is ₹14,60,000. Your estimated tax liability is ₹1,96,500 and your TDS paid is ₹1,50,000, leaving ₹46,500 still payable.",
        isGrounded: true,
        citations: [
          { recordId: "tax-declaration-id", table: "tax_declarations", field: "taxableIncome", value: "14,60,000" },
          { recordId: "tax-declaration-id", table: "tax_declarations", field: "estimatedTaxLiability", value: "1,96,500" },
        ],
      },
    ],
  });

  console.log("✅ Seed complete. Login with demo@example.com / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
