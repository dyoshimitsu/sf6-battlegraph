import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

const PROJECT_ID = "demo-sf6-battlegraph";
let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterEach(async () => environment.clearFirestore());
afterAll(async () => environment.cleanup());

async function seed(visibility: "private" | "public") {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "settings", "deployment"), { visibility });
    await setDoc(doc(db, "admins", "admin-user"), { createdAt: 1 });
    await setDoc(doc(db, "players", "100"), { userCode: "100" });
    await setDoc(doc(db, "players", "100", "matches", "REPLAY1"), { replayId: "REPLAY1" });
  });
}

describe("Firestore security rules", () => {
  it("denies private data reads to signed-out and non-admin users", async () => {
    await seed("private");
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "players", "100")));
    await assertFails(getDoc(doc(environment.authenticatedContext("ordinary-user").firestore(), "players", "100", "matches", "REPLAY1")));
  });

  it("allows an administrator to read and write player data", async () => {
    await seed("private");
    const db = environment.authenticatedContext("admin-user").firestore();
    await assertSucceeds(getDoc(doc(db, "players", "100")));
    await assertSucceeds(setDoc(doc(db, "players", "100", "matches", "REPLAY2"), { replayId: "REPLAY2" }));
    await assertSucceeds(deleteDoc(doc(db, "players", "100", "matches", "REPLAY1")));
  });

  it("allows public data reads but never public writes", async () => {
    await seed("public");
    const publicDb = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicDb, "players", "100")));
    await assertSucceeds(getDoc(doc(publicDb, "players", "100", "matches", "REPLAY1")));
    await assertFails(setDoc(doc(publicDb, "players", "100", "matches", "REPLAY2"), { replayId: "REPLAY2" }));
  });

  it("lets users inspect only their own admin registration", async () => {
    await seed("private");
    await assertSucceeds(getDoc(doc(environment.authenticatedContext("admin-user").firestore(), "admins", "admin-user")));
    await assertFails(getDoc(doc(environment.authenticatedContext("ordinary-user").firestore(), "admins", "admin-user")));
    await assertFails(setDoc(doc(environment.authenticatedContext("ordinary-user").firestore(), "admins", "ordinary-user"), {}));
    await assertFails(setDoc(doc(environment.authenticatedContext("admin-user").firestore(), "admins", "ordinary-user"), {}));
  });

  it("allows only administrators to switch a valid deployment visibility", async () => {
    await seed("private");
    const adminDb = environment.authenticatedContext("admin-user").firestore();
    await assertSucceeds(setDoc(doc(adminDb, "settings", "deployment"), { visibility: "public" }));
    await assertFails(setDoc(doc(adminDb, "settings", "deployment"), { visibility: "friends" }));
    await assertFails(setDoc(doc(environment.authenticatedContext("ordinary-user").firestore(), "settings", "deployment"), { visibility: "public" }));
  });

  it("denies access to paths outside the application data model", async () => {
    await seed("public");
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "unexpected", "document")));
    await assertFails(setDoc(doc(environment.authenticatedContext("admin-user").firestore(), "unexpected", "document"), {}));
  });
});
