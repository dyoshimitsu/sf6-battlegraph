import { describe, expect, it } from "vitest";
import { parseDeploymentConfig } from "./config";

const completeFirebaseEnv = {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example-project",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("parseDeploymentConfig", () => {
  it("keeps local mode when no Firebase values are configured", () => {
    expect(parseDeploymentConfig({})).toEqual({
      playerUserCode: 1134991793,
      visibility: "private",
    });
  });

  it("parses a complete self-hosted deployment configuration", () => {
    expect(
      parseDeploymentConfig({
        ...completeFirebaseEnv,
        VITE_PLAYER_USER_CODE: "987654321",
        VITE_DEPLOYMENT_VISIBILITY: "public",
      }),
    ).toEqual({
      playerUserCode: 987654321,
      visibility: "public",
      firebase: {
        apiKey: "test-api-key",
        authDomain: "example.firebaseapp.com",
        projectId: "example-project",
        appId: "1:123:web:abc",
      },
    });
  });

  it("rejects a partial Firebase configuration", () => {
    expect(() => parseDeploymentConfig({ VITE_FIREBASE_API_KEY: "only-one-value" })).toThrow(
      /VITE_FIREBASE_AUTH_DOMAIN/,
    );
  });

  it("rejects invalid visibility and user codes", () => {
    expect(() => parseDeploymentConfig({ VITE_DEPLOYMENT_VISIBILITY: "friends" })).toThrow(
      /private or public/,
    );
    expect(() => parseDeploymentConfig({ VITE_PLAYER_USER_CODE: "abc" })).toThrow(/digits only/);
  });
});
