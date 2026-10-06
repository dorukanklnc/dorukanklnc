import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../platform/errors/app-error.js';
import { PAYMENT_PROVIDERS, type PaymentProvider } from './payment-provider.js';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(@Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.key, provider]));
  }

  get(key: string): PaymentProvider {
    const provider = this.providers.get(key);
    if (!provider)
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 404, `Unknown payment provider ${key}`);
    return provider;
  }

  keys(): string[] {
    return [...this.providers.keys()];
  }
}
