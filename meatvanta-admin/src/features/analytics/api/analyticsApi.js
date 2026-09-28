import apiClient from "../../../lib/apiClient";

/**
 * from / to: India-time dates "YYYY-MM-DD" (inclusive). Leave `from` out for all time.
 * groupBy: day | week | month | year. dateBasis: order | delivery.
 */
export async function fetchAnalytics({ from, to, groupBy, dateBasis }) {
  const { data } = await apiClient.get("/analytics", { params: { from, to, groupBy, dateBasis } });
  return data.data;
}
