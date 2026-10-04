/** Resolves a media path from src/content/portfolio.ts against the deployed base URL. */
export function assetUrl(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src
  return `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`
}
