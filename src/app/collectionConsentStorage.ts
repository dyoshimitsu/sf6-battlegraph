export interface ConsentScope {
  adminUid: string;
  playerUserCode: number;
  projectId: string;
  visibility: "private" | "public";
}

const CONSENT_VERSION = 1;

function consentKey(scope: ConsentScope): string {
  return `sf6-battlegraph.collection-consent:${JSON.stringify([CONSENT_VERSION, scope.adminUid, scope.playerUserCode, scope.projectId, scope.visibility])}`;
}

export function hasCollectionConsent(
  storage: Pick<Storage, "getItem">,
  scope: ConsentScope,
): boolean {
  try {
    return storage.getItem(consentKey(scope)) === "agreed";
  } catch {
    return false;
  }
}

export function rememberCollectionConsent(
  storage: Pick<Storage, "setItem">,
  scope: ConsentScope,
): void {
  try {
    storage.setItem(consentKey(scope), "agreed");
  } catch {
    /* Ask again when storage is unavailable. */
  }
}
