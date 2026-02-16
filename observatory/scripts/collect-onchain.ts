/**
 * On-chain data collection — Phase 2 stub.
 *
 * All on-chain fields are null until Scan API integration.
 * TODO: Integrate with Canton Scan API
 *       https://docs.dev.sync.global/app_dev/scan_api/
 */

export interface OnChainFields {
  tx_count_30d: null;
  tx_count_90d: null;
  unique_parties_30d: null;
  cc_burned_30d: null;
  featured_markers_30d: null;
  onchain_since: null;
}

/**
 * Collect on-chain data for a project.
 * Currently returns null for all fields (Phase 2).
 *
 * TODO: Implement Scan API client
 * TODO: Map party IDs to projects via attribution.ts
 * TODO: Query transaction counts and Canton Coin burns
 */
export async function collectOnChain(
  _projectId: string,
): Promise<OnChainFields> {
  return {
    tx_count_30d: null,
    tx_count_90d: null,
    unique_parties_30d: null,
    cc_burned_30d: null,
    featured_markers_30d: null,
    onchain_since: null,
  };
}
