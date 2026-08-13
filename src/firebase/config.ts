import type { FirebaseOptions } from "firebase/app";

export type DeploymentVisibility = "private" | "public";

export interface DeploymentConfig {
  playerUserCode: number;
  visibility: DeploymentVisibility;
  firebase?: FirebaseOptions;
}

const FIREBASE_ENV = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  appId: "VITE_FIREBASE_APP_ID",
} as const;

function value(env: Record<string, unknown>, key: string): string {
  const candidate = env[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function parseDeploymentConfig(env: Record<string, unknown>): DeploymentConfig {
  const visibility = value(env, "VITE_DEPLOYMENT_VISIBILITY") || "private";
  if (visibility !== "private" && visibility !== "public") {
    throw new Error("VITE_DEPLOYMENT_VISIBILITY must be private or public");
  }

  const userCodeText = value(env, "VITE_PLAYER_USER_CODE") || "1134991793";
  if (!/^\d+$/.test(userCodeText)) throw new Error("VITE_PLAYER_USER_CODE must contain digits only");
  const playerUserCode = Number(userCodeText);
  if (!Number.isSafeInteger(playerUserCode)) throw new Error("VITE_PLAYER_USER_CODE is outside the safe integer range");

  const entries = Object.entries(FIREBASE_ENV).map(([option, envKey]) => [option, envKey, value(env, envKey)] as const);
  if (entries.every(([, , configured]) => !configured)) return { playerUserCode, visibility };
  const missing = entries.filter(([, , configured]) => !configured).map(([, envKey]) => envKey);
  if (missing.length) throw new Error(`Firebase configuration is incomplete: ${missing.join(", ")}`);

  return {
    playerUserCode,
    visibility,
    firebase: Object.fromEntries(entries.map(([option, , configured]) => [option, configured])) as FirebaseOptions,
  };
}
