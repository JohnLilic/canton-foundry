/**
 * Party ID → Project mapping for on-chain attribution.
 * Phase 2 stub.
 *
 * TODO: Build mapping from known party IDs to project_ids
 * TODO: Support multiple party IDs per project
 * TODO: Handle party ID rotation
 */

export interface PartyMapping {
  partyId: string;
  projectId: string;
  addedAt: string;
}

/**
 * Look up which project a party ID belongs to.
 * Currently returns null (Phase 2).
 */
export function resolveParty(
  _partyId: string,
): string | null {
  return null;
}
