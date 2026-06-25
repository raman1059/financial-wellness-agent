import type { PayrollResponseDto } from "./payroll-response.dto";
import type { YtdSummaryDto } from "./ytd-summary.dto";

// ─── Paginated list response ──────────────────────────────────────────────────

export interface PayrollListResponseDto {
  records: PayrollResponseDto[];
  ytd: YtdSummaryDto;
  total: number;
  /** Available financial years across all records, descending */
  financialYears: string[];
}
