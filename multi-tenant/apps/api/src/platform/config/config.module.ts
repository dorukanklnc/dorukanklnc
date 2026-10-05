import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, getConfig } from './env.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: getConfig }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
