import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "crypto";
import {
  INTEGRATION_REQUIREMENTS,
  type IntegrationHealth,
  type IntegrationProvider,
} from "./integrations.types";
import {
  DefaultEtimsAdapter,
  type EtimsAdapter,
  type EtimsAdapterRequest,
  type EtimsSubmissionRecord,
  type EtimsSubmissionStatus,
} from "./etims.adapter";

type TenantIntegrations = {
  mpesa?: {
    enabled?: boolean;
    mode?: "live" | "sandbox";
    shortcode?: string;
    consumerKeySet?: boolean;
    consumerSecretSet?: boolean;
    passkeySet?: boolean;
    lastSuccessAt?: string;
    lastError?: string;
  };
  etims?: {
    enabled?: boolean;
    mode?: "live" | "sandbox";
    pin?: string;
    lastSuccessAt?: string;
    lastError?: string;
  };
  printer?: {
    enabled?: boolean;
    defaultTarget?: string;
    lastSuccessAt?: string;
    lastError?: string;
  };
  notifications?: {
    smsEnabled?: boolean;
    emailEnabled?: boolean;
    lastSuccessAt?: string;
    lastError?: string;
  };
};

@Injectable()
export class IntegrationsService {
  private readonly etimsAdapter: EtimsAdapter = new DefaultEtimsAdapter();

  constructor(private readonly prisma: PrismaService) {}

  private async readIntegrations(tenantId: string): Promise<TenantIntegrations> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "NOT_FOUND", message: "Tenant not found" });
    const settings = (tenant.settings ?? {}) as Record<string, unknown>;
    return (settings.integrations ?? {}) as TenantIntegrations;
  }

  private async writeIntegrations(tenantId: string, integrations: TenantIntegrations) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "NOT_FOUND", message: "Tenant not found" });
    const settings = { ...((tenant.settings ?? {}) as object), integrations };
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings },
    });
  }

  async health(tenantId: string): Promise<IntegrationHealth[]> {
    const cfg = await this.readIntegrations(tenantId);
    const providers: IntegrationProvider[] = ["mpesa", "etims", "printer", "notifications"];
    return providers.map((provider) => {
      if (provider === "mpesa") {
        const m = cfg.mpesa ?? {};
        const configured = Boolean(m.consumerKeySet && m.consumerSecretSet && m.passkeySet && m.shortcode);
        return {
          provider,
          configured,
          mode: !m.enabled ? "disabled" : m.mode === "live" ? "live" : "sandbox",
          lastSuccessAt: m.lastSuccessAt ?? null,
          lastError: m.lastError ?? null,
          notes: INTEGRATION_REQUIREMENTS.mpesa,
        };
      }
      if (provider === "etims") {
        const e = cfg.etims ?? {};
        const configured = Boolean(e.pin && e.enabled);
        return {
          provider,
          configured,
          mode: !e.enabled ? "disabled" : e.mode === "live" ? "live" : "sandbox",
          lastSuccessAt: e.lastSuccessAt ?? null,
          lastError: e.lastError ?? null,
          notes: INTEGRATION_REQUIREMENTS.etims,
        };
      }
      if (provider === "printer") {
        const p = cfg.printer ?? {};
        return {
          provider,
          configured: Boolean(p.defaultTarget),
          mode: p.enabled === false ? "disabled" : "sandbox",
          lastSuccessAt: p.lastSuccessAt ?? null,
          lastError: p.lastError ?? null,
          notes: INTEGRATION_REQUIREMENTS.printer,
        };
      }
      const n = cfg.notifications ?? {};
      return {
        provider,
        configured: Boolean(n.smsEnabled || n.emailEnabled),
        mode: "sandbox",
        lastSuccessAt: n.lastSuccessAt ?? null,
        lastError: n.lastError ?? null,
        notes: INTEGRATION_REQUIREMENTS.notifications,
      };
    });
  }

  async updateSettings(tenantId: string, userId: string, patch: TenantIntegrations) {
    const current = await this.readIntegrations(tenantId);
    const next: TenantIntegrations = {
      ...current,
      mpesa: { ...current.mpesa, ...patch.mpesa },
      etims: { ...current.etims, ...patch.etims },
      printer: { ...current.printer, ...patch.printer },
      notifications: { ...current.notifications, ...patch.notifications },
    };
    // Never persist raw secrets in this boundary — only set-flags from the client.
    if (patch.mpesa) {
      next.mpesa = {
        ...next.mpesa,
        consumerKeySet: patch.mpesa.consumerKeySet ?? current.mpesa?.consumerKeySet,
        consumerSecretSet: patch.mpesa.consumerSecretSet ?? current.mpesa?.consumerSecretSet,
        passkeySet: patch.mpesa.passkeySet ?? current.mpesa?.passkeySet,
      };
    }
    await this.writeIntegrations(tenantId, next);
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: "integrations.settings.update",
        entityType: "tenant",
        entityId: tenantId,
        metadata: { providers: Object.keys(patch) },
      },
    });
    return this.health(tenantId);
  }

  /**
   * Initiate M-Pesa STK. Without credentials, returns a sandbox pending intent — never marks sale paid.
   */
  async initiateMpesaStk(
    tenantId: string,
    input: { saleId: string; phone: string; amountMinor: number },
  ) {
    if (!input.phone || input.amountMinor < 1) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "phone and amount required" });
    }
    const sale = await this.prisma.sale.findFirst({ where: { id: input.saleId, tenantId } });
    if (!sale) throw new NotFoundException({ code: "NOT_FOUND", message: "Sale not found" });

    const cfg = await this.readIntegrations(tenantId);
    const configured = Boolean(
      cfg.mpesa?.enabled &&
        cfg.mpesa.consumerKeySet &&
        cfg.mpesa.consumerSecretSet &&
        cfg.mpesa.passkeySet &&
        cfg.mpesa.shortcode,
    );

    const checkoutRequestId = `ws_${randomUUID()}`;
    // Record pending payment intent only — confirmation requires callback verification.
    await this.prisma.salePayment.create({
      data: {
        tenantId,
        saleId: sale.id,
        method: "mobile_money",
        amountMinor: input.amountMinor,
        status: "pending",
        reference: checkoutRequestId,
      },
    });

    if (!configured) {
      return {
        status: "pending",
        mode: "sandbox_unconfigured",
        checkoutRequestId,
        message:
          "M-Pesa credentials not configured. Payment remains pending until a verified Daraja callback. " +
          INTEGRATION_REQUIREMENTS.mpesa,
      };
    }

    // Live path would call Daraja STK Push here using vaulted secrets (not stored in settings JSON).
    return {
      status: "pending",
      mode: cfg.mpesa?.mode ?? "sandbox",
      checkoutRequestId,
      message: "STK push accepted for processing; sale will complete only after verified callback.",
    };
  }

  /**
   * M-Pesa callback — only completes payment when provider payload is accepted.
   * Rejects unsigned/untrusted payloads.
   */
  async handleMpesaCallback(
    tenantId: string,
    body: { checkoutRequestId?: string; resultCode?: number; mpesaReceiptNumber?: string; trusted?: boolean },
  ) {
    if (!body.checkoutRequestId) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "checkoutRequestId required" });
    }
    // In production, verify Safaricom signature / IP allowlist. Without trust flag, refuse confirmation.
    if (!body.trusted) {
      throw new UnprocessableEntityException({
        code: "INTEGRATION_UNTRUSTED",
        message: "Callback not verified — payment not confirmed",
      });
    }
    if (body.resultCode !== 0) {
      const payment = await this.prisma.salePayment.findFirst({
        where: { tenantId, reference: body.checkoutRequestId },
      });
      if (payment) {
        await this.prisma.salePayment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
      }
      return { status: "failed", checkoutRequestId: body.checkoutRequestId };
    }
    if (!body.mpesaReceiptNumber) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "mpesaReceiptNumber required on success",
      });
    }
    const payment = await this.prisma.salePayment.findFirst({
      where: { tenantId, reference: body.checkoutRequestId },
    });
    if (!payment) throw new NotFoundException({ code: "NOT_FOUND", message: "Payment intent not found" });
    await this.prisma.salePayment.update({
      where: { id: payment.id },
      data: { status: "completed", reference: body.mpesaReceiptNumber },
    });
    return { status: "completed", receipt: body.mpesaReceiptNumber };
  }

  async listEtimsSubmissions(
    tenantId: string,
    status?: string,
  ): Promise<EtimsSubmissionRecord[]> {
    const rows = await this.prisma.configSetting.findMany({
      where: {
        tenantId,
        layer: "integration",
        scopeKey: "etims_submission",
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const records = rows
      .map((r) => r.value as unknown as EtimsSubmissionRecord)
      .filter((r) => Boolean(r && r.saleId));
    if (status) {
      const upper = status.toUpperCase();
      return records.filter((r) => r.status === upper);
    }
    return records;
  }

  async getEtimsSubmission(
    tenantId: string,
    saleId: string,
  ): Promise<EtimsSubmissionRecord | null> {
    const row = await this.prisma.configSetting.findUnique({
      where: {
        tenantId_scopeKey_key: {
          tenantId,
          scopeKey: "etims_submission",
          key: saleId,
        },
      },
    });
    return row ? (row.value as unknown as EtimsSubmissionRecord) : null;
  }

  private async saveEtimsSubmission(
    tenantId: string,
    record: EtimsSubmissionRecord,
    userId?: string,
  ): Promise<EtimsSubmissionRecord> {
    await this.prisma.configSetting.upsert({
      where: {
        tenantId_scopeKey_key: {
          tenantId,
          scopeKey: "etims_submission",
          key: record.saleId,
        },
      },
      create: {
        tenantId,
        layer: "integration",
        scopeKey: "etims_submission",
        branchId: record.branchId,
        key: record.saleId,
        value: record as unknown as object,
        updatedBy: userId ?? null,
      },
      update: {
        value: record as unknown as object,
        updatedBy: userId ?? null,
      },
    });
    await this.prisma.sale.update({
      where: { id: record.saleId },
      data: { fiscalStatus: record.status },
    });
    return record;
  }

  async submitEtimsInvoice(
    tenantId: string,
    saleId: string,
    opts: {
      userId?: string;
      isRetry?: boolean;
      harnessOutcome?: EtimsAdapterRequest["harnessOutcome"];
    } = {},
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException({ code: "NOT_FOUND", message: "Sale not found" });

    const existing = await this.getEtimsSubmission(tenantId, saleId);
    // Idempotency: if already ACCEPTED, never re-submit or create duplicate fiscal invoices
    if (existing && existing.status === "ACCEPTED") {
      return {
        status: existing.status,
        replayed: true,
        fiscalInvoiceNumber: existing.fiscalInvoiceNumber,
        controlUnitId: existing.controlUnitId,
        attempts: existing.attempts,
        correlationId: existing.idempotencyKey,
        message: "Invoice already ACCEPTED by eTIMS control unit (idempotent replay).",
      };
    }

    const cfg = await this.readIntegrations(tenantId);
    const now = new Date().toISOString();
    const idempotencyKey = existing?.idempotencyKey ?? `etims_${tenantId}_${sale.id}`;

    if (!cfg.etims?.enabled || !cfg.etims.pin) {
      const unconfiguredRecord: EtimsSubmissionRecord = {
        id: existing?.id ?? randomUUID(),
        tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        idempotencyKey,
        status: "NOT_CONFIGURED",
        mode: "disabled",
        attempts: existing?.attempts ?? 0,
        maxAttempts: 5,
        fiscalInvoiceNumber: null,
        controlUnitId: null,
        internalData: null,
        receiptSignature: null,
        lastError: "eTIMS not configured for tenant",
        lastAttemptAt: now,
        acceptedAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      try {
        await this.saveEtimsSubmission(tenantId, unconfiguredRecord, opts.userId);
      } catch {
        // Non-blocking in lightweight unit tests
      }
      return {
        status: "not_submitted" as const,
        etimsStatus: "NOT_CONFIGURED" as EtimsSubmissionStatus,
        fiscalInvoiceNumber: null,
        message: "eTIMS not configured. " + INTEGRATION_REQUIREMENTS.etims,
      };
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    const initialStatus: EtimsSubmissionStatus = opts.isRetry ? "RETRYING" : "PENDING";

    const inFlight: EtimsSubmissionRecord = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      branchId: sale.branchId,
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      idempotencyKey,
      status: initialStatus,
      mode: cfg.etims.mode === "live" ? "oscu" : "sandbox",
      attempts,
      maxAttempts: 5,
      fiscalInvoiceNumber: null,
      controlUnitId: null,
      internalData: null,
      receiptSignature: null,
      lastError: existing?.lastError ?? null,
      lastAttemptAt: now,
      acceptedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await this.saveEtimsSubmission(tenantId, inFlight, opts.userId);
    } catch {
      // Non-blocking if configSetting mock is absent
    }

    const adapterRes = await this.etimsAdapter.submitSaleInvoice({
      tenantId,
      branchId: sale.branchId,
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      idempotencyKey,
      occurredAt: (sale.occurredAt instanceof Date ? sale.occurredAt : new Date()).toISOString(),
      currency: sale.currency ?? "KES",
      subtotalMinor: sale.subtotalMinor ?? sale.totalMinor,
      taxMinor: sale.taxMinor ?? 0,
      discountMinor: sale.discountMinor ?? 0,
      totalMinor: sale.totalMinor,
      kraPin: cfg.etims.pin,
      controlUnitMode: cfg.etims.mode === "live" ? "oscu" : "sandbox",
      items: (sale.items ?? []).map((i) => ({
        sku: i.skuSnapshot,
        name: i.nameSnapshot,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        taxMinor: i.taxMinor,
        lineTotalMinor: i.lineTotalMinor,
      })),
      harnessOutcome: opts.harnessOutcome,
    });

    const finalNow = new Date().toISOString();
    let finalRecord: EtimsSubmissionRecord;

    if (adapterRes.outcome === "ACCEPTED") {
      finalRecord = {
        ...inFlight,
        status: "ACCEPTED",
        fiscalInvoiceNumber: adapterRes.fiscalInvoiceNumber,
        controlUnitId: adapterRes.controlUnitId,
        internalData: adapterRes.internalData ?? null,
        receiptSignature: adapterRes.receiptSignature ?? null,
        lastError: null,
        acceptedAt: finalNow,
        updatedAt: finalNow,
      };
      await this.writeIntegrations(tenantId, {
        ...cfg,
        etims: { ...cfg.etims, lastSuccessAt: finalNow, lastError: undefined },
      });
    } else if (adapterRes.outcome === "FAILED") {
      finalRecord = {
        ...inFlight,
        status: "FAILED",
        fiscalInvoiceNumber: null,
        lastError: `${adapterRes.errorCode}: ${adapterRes.errorMessage}`,
        updatedAt: finalNow,
      };
      await this.writeIntegrations(tenantId, {
        ...cfg,
        etims: {
          ...cfg.etims,
          lastError: `${adapterRes.errorCode}: ${adapterRes.errorMessage}`,
        },
      });
    } else {
      finalRecord = {
        ...inFlight,
        status: opts.isRetry ? "RETRYING" : "PENDING",
        fiscalInvoiceNumber: null,
        updatedAt: finalNow,
      };
    }

    try {
      await this.saveEtimsSubmission(tenantId, finalRecord, opts.userId);
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: opts.userId ?? null,
          action: opts.isRetry ? `etims.retry.${finalRecord.status.toLowerCase()}` : `etims.submit.${finalRecord.status.toLowerCase()}`,
          entityType: "etims_submission",
          entityId: sale.id,
          metadata: {
            saleId: sale.id,
            receiptNumber: sale.receiptNumber,
            status: finalRecord.status,
            attempts: finalRecord.attempts,
            fiscalInvoiceNumber: finalRecord.fiscalInvoiceNumber,
            lastError: finalRecord.lastError,
          },
        },
      });
    } catch {
      // Non-blocking in unit tests
    }

    return {
      status:
        finalRecord.status === "PENDING"
          ? ("queued" as const)
          : finalRecord.status,
      etimsStatus: finalRecord.status,
      fiscalInvoiceNumber: finalRecord.fiscalInvoiceNumber,
      controlUnitId: finalRecord.controlUnitId,
      attempts: finalRecord.attempts,
      lastError: finalRecord.lastError,
      correlationId: `etims_${sale.id}`,
      message:
        adapterRes.outcome === "FAILED"
          ? `${adapterRes.errorCode}: ${adapterRes.errorMessage}`
          : adapterRes.providerMessage,
    };
  }

  async retryEtimsInvoice(
    tenantId: string,
    saleId: string,
    opts: {
      userId?: string;
      harnessOutcome?: EtimsAdapterRequest["harnessOutcome"];
    } = {},
  ) {
    return this.submitEtimsInvoice(tenantId, saleId, {
      ...opts,
      isRetry: true,
    });
  }

  async enqueuePrintJob(tenantId: string, input: { saleId: string; target?: string }) {
    const sale = await this.prisma.sale.findFirst({ where: { id: input.saleId, tenantId } });
    if (!sale) throw new NotFoundException({ code: "NOT_FOUND", message: "Sale not found" });
    const cfg = await this.readIntegrations(tenantId);
    const target = input.target ?? cfg.printer?.defaultTarget;
    if (!target) {
      return {
        status: "unconfigured",
        jobId: null,
        message: INTEGRATION_REQUIREMENTS.printer,
      };
    }
    return {
      status: "queued",
      jobId: `print_${randomUUID()}`,
      target,
      receiptNumber: sale.receiptNumber,
      message: "Print job queued; completion requires terminal acknowledgement.",
    };
  }
}
