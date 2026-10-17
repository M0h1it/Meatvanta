import apiClient from "../../../lib/apiClient";

/** What the shop owes in wallet balance + how it moved this month + latest movements. */
export async function fetchWalletSummary() {
  const { data } = await apiClient.get("/wallet/summary");
  return data.data; // { summary, recent }
}

/** Wallet accounts, biggest balance first. { accounts, total, page, pageSize, totalPages } */
export async function fetchWalletAccounts({ search, page = 1, pageSize = 25, all = false } = {}) {
  const { data } = await apiClient.get("/wallet/accounts", {
    params: { search: search || undefined, page, pageSize, all: all ? "true" : undefined },
  });
  return data.data;
}
