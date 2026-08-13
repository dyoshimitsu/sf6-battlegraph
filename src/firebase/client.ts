import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore/lite";
import { parseDeploymentConfig, type DeploymentConfig } from "./config";

export interface FirebaseServices {
  auth: Auth;
  db: Firestore;
}

export type FirebaseRuntime =
  | { status: "disabled" }
  | { status: "ready"; services: FirebaseServices }
  | { status: "error"; message: string };

let parsedConfig: DeploymentConfig;
let configurationError: string | undefined;
try {
  parsedConfig = parseDeploymentConfig(import.meta.env);
} catch (cause) {
  parsedConfig = parseDeploymentConfig({});
  configurationError = cause instanceof Error ? cause.message : "Firebase configuration is invalid";
}
export const deploymentConfig = parsedConfig;

function createFirebaseRuntime(): FirebaseRuntime {
  if (configurationError) return { status: "error", message: configurationError };
  if (!deploymentConfig.firebase) return { status: "disabled" };
  try {
    const app = initializeApp(deploymentConfig.firebase);
    return {
      status: "ready",
      services: {
        auth: getAuth(app),
        db: initializeFirestore(app, { ignoreUndefinedProperties: true }),
      },
    };
  } catch (cause) {
    return { status: "error", message: cause instanceof Error ? cause.message : "Firebase initialization failed" };
  }
}

export const firebaseRuntime = createFirebaseRuntime();
