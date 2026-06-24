import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/infrastructure/db/prisma/client";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, FileText } from "lucide-react";

export const metadata: Metadata = { title: "Documents" };

const statusVariant: Record<string, "green" | "yellow" | "blue" | "red" | "gray"> = {
  VERIFIED: "green",
  PARSED: "blue",
  PROCESSING: "yellow",
  PENDING: "gray",
  FAILED: "red",
};

export default async function DocumentsPage() {
  const session = await requireSession();
  const payslips = await prisma.payslip.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Document Vault</h1>
          <p className="text-sm text-gray-500">{payslips.length} document{payslips.length !== 1 ? "s" : ""} uploaded</p>
        </div>
        <Link href="/documents/upload">
          <Button size="sm">
            <Upload className="h-4 w-4" />
            Upload Payslip
          </Button>
        </Link>
      </div>

      {payslips.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No documents uploaded yet</p>
              <Link href="/documents/upload" className="mt-4 inline-block">
                <Button size="sm">Upload your first payslip</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {payslips.map((doc) => (
            <Card key={doc.id}>
              <CardBody>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {(doc.fileSizeBytes / 1024).toFixed(0)} KB · {new Date(doc.createdAt).toLocaleDateString("en-IN")}
                    </p>
                    <div className="mt-2">
                      <Badge variant={statusVariant[doc.status] ?? "gray"}>{doc.status}</Badge>
                    </div>
                    {doc.ocrConfidence && (
                      <p className="mt-1 text-xs text-gray-400">
                        OCR confidence: {(doc.ocrConfidence * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
