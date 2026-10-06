/**
 * Full document navigation, used deliberately at session and organization boundaries (sign-in,
 * sign-out, organization switch, expired session). Unlike client-side routing it discards every
 * piece of in-memory state, so no cached data of the previous session or tenant can survive.
 */
export function hardNavigate(path: string): void {
  hardNavigate(new URL(path, window.location.origin).toString());
}
