import { getConfig } from '../../config/env.js';
import { seedDemoData } from '../seed/seed.js';

const config = getConfig();
if (config.isProduction) {
  console.error('Refusing to load demo data in production.');
  process.exit(1);
}
await seedDemoData(config);
