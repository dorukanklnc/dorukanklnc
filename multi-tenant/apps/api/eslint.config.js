import { nest } from '@repo/eslint-config/nest';

export default nest({ tsconfigRootDir: import.meta.dirname, ignores: ['drizzle/**'] });
