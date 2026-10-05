import { Module } from '@nestjs/common';
import { AgreementsController } from './agreements/agreements.controller.js';
import { AgreementsService } from './agreements/agreements.service.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PaymentsService } from './payments/payments.service.js';
import { MockPaymentProvider } from './providers/mock-payment.provider.js';
import { PaymentLinksController } from './providers/payment-links.controller.js';
import { PaymentLinksService } from './providers/payment-links.service.js';
import { PAYMENT_PROVIDERS } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/payment-provider.registry.js';
import { PaymentWebhookService } from './providers/payment-webhook.service.js';
import { ReceivablesController } from './receivables/receivables.controller.js';
import { ReceivablesService } from './receivables/receivables.service.js';
import { FinanceSummaryController } from './summary/finance-summary.controller.js';
import { FinanceSummaryService } from './summary/finance-summary.service.js';

@Module({
  controllers: [
    AgreementsController,
    ReceivablesController,
    PaymentsController,
    FinanceSummaryController,
    PaymentLinksController,
  ],
  providers: [
    AgreementsService,
    ReceivablesService,
    PaymentsService,
    FinanceSummaryService,
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDERS, inject: [MockPaymentProvider], useFactory: (mock: MockPaymentProvider) => [mock] },
    PaymentProviderRegistry,
    PaymentWebhookService,
    PaymentLinksService,
  ],
  exports: [FinanceSummaryService, MockPaymentProvider, PaymentWebhookService],
})
export class FinanceModule {}
