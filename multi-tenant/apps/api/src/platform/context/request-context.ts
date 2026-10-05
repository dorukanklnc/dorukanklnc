import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request ambient data. Never put large objects or secrets here. */
export interface RequestContextStore {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  userId?: string;
  organizationId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
  /** Enriches the current context once the caller is authenticated (for logs). */
  setIdentity(userId: string, organizationId: string | undefined): void {
    const store = storage.getStore();
    if (!store) return;
    store.userId = userId;
    if (organizationId) store.organizationId = organizationId;
  },
};
