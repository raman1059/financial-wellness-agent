import { serve } from "inngest/next";
import { inngest } from "@/infrastructure/jobs/inngest-client";
import { processDocumentJob } from "@/infrastructure/jobs/process-document.job";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processDocumentJob],
});
