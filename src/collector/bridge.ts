import type { BucklerCollectorBundle } from "../domain/buckler/types";

export const COLLECTOR_MESSAGE_TYPE = "sf6-battlegraph.collector-result";
export const COLLECTOR_MESSAGE_VERSION = 1;
export const COLLECTOR_START_MESSAGE_TYPE = "sf6-battlegraph.collector-start";
export const COLLECTOR_STATUS_MESSAGE_TYPE = "sf6-battlegraph.collector-status";
export const CONNECTOR_PING_MESSAGE_TYPE = "sf6-battlegraph.connector-ping";
export const CONNECTOR_READY_MESSAGE_TYPE = "sf6-battlegraph.connector-ready";
export const BUCKLER_ORIGIN = "https://www.streetfighter.com";
export const BATTLEGRAPH_ORIGIN_PARAMETER = "sf6-battlegraph-origin";
export const KNOWN_REPLAYS_PARAMETER = "sf6-battlegraph-known-replays";

export interface CollectorResultMessage {
  type: typeof COLLECTOR_MESSAGE_TYPE;
  version: typeof COLLECTOR_MESSAGE_VERSION;
  bundle: BucklerCollectorBundle;
}

export interface CollectorStartMessage {
  type: typeof COLLECTOR_START_MESSAGE_TYPE;
  version: typeof COLLECTOR_MESSAGE_VERSION;
  url: string;
}

export interface CollectorStatusMessage {
  type: typeof COLLECTOR_STATUS_MESSAGE_TYPE;
  version: typeof COLLECTOR_MESSAGE_VERSION;
  status: "authentication-required" | "started" | "error";
  message?: string;
}

export interface ConnectorReadyMessage {
  type: typeof CONNECTOR_READY_MESSAGE_TYPE;
  version: string;
}

export function createCollectorStartMessage(url: string): CollectorStartMessage {
  return { type: COLLECTOR_START_MESSAGE_TYPE, version: COLLECTOR_MESSAGE_VERSION, url };
}

export function createCollectorAuthenticationRequiredMessage(): CollectorStatusMessage {
  return { type: COLLECTOR_STATUS_MESSAGE_TYPE, version: COLLECTOR_MESSAGE_VERSION, status: "authentication-required" };
}

export function createCollectorStartedMessage(): CollectorStatusMessage {
  return { type: COLLECTOR_STATUS_MESSAGE_TYPE, version: COLLECTOR_MESSAGE_VERSION, status: "started" };
}

export function createCollectorErrorMessage(message: string): CollectorStatusMessage {
  return { type: COLLECTOR_STATUS_MESSAGE_TYPE, version: COLLECTOR_MESSAGE_VERSION, status: "error", message: message.slice(0, 500) };
}

export function readCollectorStatusMessage(origin: string, value: unknown, receiverOrigin: string): CollectorStatusMessage | null {
  if (origin !== receiverOrigin || typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<CollectorStatusMessage>;
  return candidate.type === COLLECTOR_STATUS_MESSAGE_TYPE
    && candidate.version === COLLECTOR_MESSAGE_VERSION
    && (["authentication-required", "started"].includes(candidate.status ?? "") || (candidate.status === "error" && typeof candidate.message === "string"))
    ? candidate as CollectorStatusMessage
    : null;
}

export function readConnectorReadyMessage(origin: string, value: unknown, receiverOrigin: string): ConnectorReadyMessage | null {
  if (origin !== receiverOrigin || typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ConnectorReadyMessage>;
  return candidate.type === CONNECTOR_READY_MESSAGE_TYPE && typeof candidate.version === "string" && /^\d+\.\d+\.\d+$/.test(candidate.version)
    ? candidate as ConnectorReadyMessage
    : null;
}

export function createCollectorResultMessage(bundle: BucklerCollectorBundle): CollectorResultMessage {
  return { type: COLLECTOR_MESSAGE_TYPE, version: COLLECTOR_MESSAGE_VERSION, bundle };
}

export function readCollectorResultMessage(origin: string, value: unknown, receiverOrigin?: string): CollectorResultMessage | null {
  if (![BUCKLER_ORIGIN, receiverOrigin].includes(origin) || typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<CollectorResultMessage>;
  if (candidate.type !== COLLECTOR_MESSAGE_TYPE || candidate.version !== COLLECTOR_MESSAGE_VERSION || !candidate.bundle) return null;
  return candidate as CollectorResultMessage;
}

export function buildBucklerLaunchUrl(userCode: number, battlegraphOrigin: string, knownReplayIds: string[] = []): string {
  const url = new URL(`/6/buckler/ja-jp/profile/${userCode}/battlelog`, BUCKLER_ORIGIN);
  const hash = new URLSearchParams({ [BATTLEGRAPH_ORIGIN_PARAMETER]: battlegraphOrigin });
  const known = [...new Set(knownReplayIds.filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, 20);
  if (known.length) hash.set(KNOWN_REPLAYS_PARAMETER, known.join(","));
  url.hash = hash.toString();
  return url.toString();
}

export function readKnownReplayIds(hash: string): string[] {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(KNOWN_REPLAYS_PARAMETER);
  return value ? [...new Set(value.split(",").filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, 20) : [];
}

export function readBattlegraphTargetOrigin(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(BATTLEGRAPH_ORIGIN_PARAMETER);
  if (!value) return null;
  try {
    const url = new URL(value);
    const localDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname)
      || /^10\./.test(url.hostname)
      || /^192\.168\./.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
    return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && localDevelopment)) ? value : null;
  } catch {
    return null;
  }
}
