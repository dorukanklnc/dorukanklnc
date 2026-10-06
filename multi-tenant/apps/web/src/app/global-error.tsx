'use client';

/**
 * Last-resort boundary for failures in the root layout itself. It renders its own document, so
 * it cannot rely on the message catalogs; it stays bilingual and minimal on purpose.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#f4f5f7',
          color: '#171a21',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <title>CampusOS</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Beklenmeyen bir hata oluştu</h1>
          <p style={{ fontSize: 14, color: '#5a6172', margin: '0 0 4px' }}>
            Something went wrong. Please try again.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: '#878e9d', fontFamily: 'monospace' }}>
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              height: 32,
              padding: '0 14px',
              borderRadius: 6,
              border: 'none',
              background: '#0f6284',
              color: '#fff',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Tekrar dene · Retry
          </button>
        </main>
      </body>
    </html>
  );
}
