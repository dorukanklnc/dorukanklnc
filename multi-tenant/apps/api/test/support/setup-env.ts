import { resetConfigCache } from '../../src/platform/config/env.js';
import { applyTestEnvironment } from './environment.js';

applyTestEnvironment();
resetConfigCache();
