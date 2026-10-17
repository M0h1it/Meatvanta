import apiClient from "../../../lib/apiClient";

/**
 * The signed-in customer's Meat Vanta wallet (tied to their phone number).
 * { balance, held, transactions: [{ id, type, amount, balanceAfter, orderNumber, reason, createdAt }] }
 */
export async function fetchWallet() {
  const { data } = await apiClient.get("/auth/wallet");
  return data.data;
}
