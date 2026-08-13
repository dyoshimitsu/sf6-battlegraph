export function shouldAutoSyncCollectorBundle(
  pending: boolean,
  canSync: boolean,
  authStatus: string,
): boolean {
  return pending && canSync && authStatus === "admin";
}
