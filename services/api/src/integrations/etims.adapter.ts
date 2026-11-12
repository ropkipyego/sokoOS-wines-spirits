export type EtimsSubmissionStatus =
  | "NOT_CONFIGURED"
  | "PENDING"
  | "RETRYING"
  | "ACCEPTED"
  | "FAILED";

export type EtimsSubmissionRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  saleId: string;
  receiptNumber: string;
  idempotencyKey: string;
  status: EtimsSubmissionStatus;
  mode: "oscu" | "vscu" | "sandbox" | "disabled";
  attempts: number;
  maxAttempts: number;
  fiscalInvoiceNumber: string | null;
  controlUnitId: string | null;
  internalData: string | null;
  receiptSignature: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EtimsAdapterRequest = {
  tenantId: string;
  branchId: string;
  saleId: string;
  receiptNumber: string;
  idempotencyKey: string;
  occurredAt: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  kraPin: string;
  controlUnitMode: "oscu" | "vscu" | "sandbox";
  vscuUrl?: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    taxMinor: number;
    lineTotalMinor: number;
  }>;
  /**
   * Optional test-harness directive for deterministic verification of
   * PENDING / FAILED / RETRYING / ACCEPTED transitions in integration tests.
   * Never used to claim live KRA certification.
   */
  harnessOutcome?: {
    outcome: "pending" | "failed" | "accepted";
    errorCode?: string;
    errorMessage?: string;
    cuInvoiceNumber?: string;
    controlUnitId?: string;
    receiptSignature?: string;
  };
};

export type EtimsAdapterResponse =
  | {
      outcome: "ACCEPTED";
      fiscalInvoiceNumber: string;
      controlUnitId: string;
      internalData?: string;
      receiptSignature?: string;
      providerMessage: string;
    }
  | {
      outcome: "PENDING";
      providerMessage: string;
    }
  | {
      outcome: "FAILED";
      errorCode: string;
      errorMessage: string;
    };

export interface EtimsAdapter {
  submitSaleInvoice(request: EtimsAdapterRequest): Promise<EtimsAdapterResponse>;
}

/**
 * Production-safe eTIMS adapter boundary.
 * - Never logs KRA credentials, tokens, or private keys.
 * - Never fabricates a fiscal invoice number unless an explicit provider/harness
 *   acknowledgement is supplied.
 * - When no live OSCU/VSCU transport is reachable or configured, keeps the
 *   submission in PENDING or FAILED state for safe retry.
 */
export class DefaultEtimsAdapter implements EtimsAdapter {
  async submitSaleInvoice(request: EtimsAdapterRequest): Promise<EtimsAdapterResponse> {
    if (!request.kraPin || request.kraPin.trim().length < 5) {
      return {
        outcome: "FAILED",
        errorCode: "INVALID_KRA_PIN",
        errorMessage: "Valid KRA PIN is required before submitting to eTIMS",
      };
    }

    if (request.harnessOutcome) {
      if (request.harnessOutcome.outcome === "failed") {
        return {
          outcome: "FAILED",
          errorCode: request.harnessOutcome.errorCode ?? "OSCU_UNAVAILABLE",
          errorMessage:
            request.harnessOutcome.errorMessage ??
            "Control unit unreachable or rejected invoice payload",
        };
      }
      if (request.harnessOutcome.outcome === "accepted") {
        if (!request.harnessOutcome.cuInvoiceNumber || !request.harnessOutcome.controlUnitId) {
          return {
            outcome: "FAILED",
            errorCode: "MISSING_CU_METADATA",
            errorMessage: "ACCEPTED outcome requires cuInvoiceNumber and controlUnitId",
          };
        }
        return {
          outcome: "ACCEPTED",
          fiscalInvoiceNumber: request.harnessOutcome.cuInvoiceNumber,
          controlUnitId: request.harnessOutcome.controlUnitId,
          receiptSignature: request.harnessOutcome.receiptSignature ?? undefined,
          providerMessage: "Verified by eTIMS control unit test harness",
        };
      }
      return {
        outcome: "PENDING",
        providerMessage: "Queued in eTIMS adapter awaiting OSCU/VSCU acknowledgement",
      };
    }

    // Default safe behavior when external KRA OSCU/VSCU credentials/appliance are not connected:
    // Queue as PENDING without inventing any fiscal identifiers.
    return {
      outcome: "PENDING",
      providerMessage:
        "Queued for KRA eTIMS OSCU/VSCU transmission. Fiscal invoice number is assigned only after KRA control unit acknowledgement.",
    };
  }
}
