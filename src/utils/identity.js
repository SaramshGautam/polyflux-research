import { auth } from "../firebaseConfig";

// const ls = (k) => (localStorage.getItem(k) || "").trim();
const ls = (k) => {
  try {
    const v = localStorage.getItem(k);
    return (typeof v === "string" ? v : "").trim();
  } catch {
    return "";
  }
};

/**
 * Resolves the current user's identity, in priority order:
 *   1. localStorage "participantId" - the canonical key, set at login
 *      (LoginPage.js) from the Participant ID the person typed/confirmed,
 *      e.g. "P014". This is what should identify a person's actions
 *      (shapes.createdBy/updatedBy, export_buffer.actor_name, etc).
 *   2. localStorage "userDisplayName" - legacy alias some older code reads;
 *      LoginPage.js writes both keys so either lookup works.
 *   3. Firebase auth's displayName - also set to the participant ID at
 *      login (see updateProfile() in LoginPage.js), so this is a solid
 *      fallback if localStorage got cleared mid-session.
 *   4. localStorage "userEmail" / auth email - covers teacher/admin logins,
 *      which don't have a participant ID.
 *   5. "Anonymous" - last resort.
 */
export function getActorIdentity() {
  const u = auth.currentUser;

  const storedParticipantId = ls("participantId") || ls("userDisplayName");
  const storedEmail = ls("userEmail").toLowerCase();

  const authDisplayName = (u?.displayName || "").trim();
  const authEmail = (u?.email || "").trim().toLowerCase();

  const participantId = storedParticipantId || authDisplayName || "";
  const email = storedEmail || authEmail || "";

  // Stable, lowercase key used anywhere we need a deterministic id
  // (history doc ids, actor bucketing, etc). Prefer the participant ID
  // over email/uid since that's the identity we actually want to group by.
  const actorId = String(participantId || email || u?.uid || "anon")
    .trim()
    .toLowerCase();

  // Human-readable identity: prefer participantId; else email; else Anonymous
  const actorName = participantId || email || "Anonymous";

  return {
    actorId,
    actorName,
    participantId: participantId || null,
    email: email || null,
    uid: u?.uid || null,
  };
}
