import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWalletSummary, fetchWalletAccounts } from "../api/walletApi";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function when(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function StatCard({ icon, label, value, hint }) {
  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>
      <p className="font-headline-sm text-headline-sm text-on-surface mt-2">{value}</p>
      <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-on-surface-variant/70 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function WalletPage() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWalletSummary()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || "Couldn't load the wallet report."));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchWalletAccounts({ search, page, all: showAll })
      .then((r) => {
        setAccounts(r.accounts);
        setTotalPages(r.totalPages);
        setTotal(r.total);
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load wallet accounts."))
      .finally(() => setIsLoading(false));
  }, [search, page, showAll]);

  useEffect(() => {
    setPage(1);
  }, [search, showAll]);

  const s = data?.summary;

  return (
    <div>
      <div className="mb-lg">
        <h1 className="font-headline-md text-headline-md text-on-surface">Wallet</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
          Customer wallet balances - money the shop owes its customers. It only comes from items that could not be
          sent and cancelled orders, and is spent at checkout.
        </p>
      </div>

      {error && (
        <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <StatCard icon="account_balance_wallet" label="Owed to customers" value={s ? money(s.liability) : "—"} hint={s && s.held > 0 ? `${money(s.held)} reserved for payments in progress` : undefined} />
        <StatCard icon="group" label="Customers with balance" value={s ? s.accountsWithBalance : "—"} />
        <StatCard icon="add_card" label="Credited this month" value={s ? money(s.thisMonth.credited) : "—"} hint={s ? `${s.thisMonth.creditCount} credits` : undefined} />
        <StatCard icon="shopping_bag" label="Spent this month" value={s ? money(s.thisMonth.spent) : "—"} hint={s ? `${s.thisMonth.spentCount} orders` : undefined} />
      </div>

      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant mb-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-md border-b border-outline-variant">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Balances <span className="text-sm font-normal text-on-surface-variant">({total})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Include zero balances
            </label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search phone number"
              className="text-sm px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="p-md text-sm text-on-surface-variant">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="p-md text-sm text-on-surface-variant">No wallet balances to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-on-surface-variant">
                <tr className="border-b border-outline-variant">
                  <th className="text-left px-md py-2 font-label-bold text-label-bold">Customer</th>
                  <th className="text-left px-md py-2 font-label-bold text-label-bold">Phone</th>
                  <th className="text-right px-md py-2 font-label-bold text-label-bold">Balance</th>
                  <th className="text-right px-md py-2 font-label-bold text-label-bold">Reserved</th>
                  <th className="text-right px-md py-2 font-label-bold text-label-bold">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.phone} className="border-b border-outline-variant last:border-b-0">
                    <td className="px-md py-2 text-on-surface">
                      {a.customerId ? (
                        <Link to={`/customers/${a.customerId}`} className="text-primary hover:underline">
                          {a.customerName}
                        </Link>
                      ) : (
                        <span className="text-on-surface-variant">Guest (no account yet)</span>
                      )}
                    </td>
                    <td className="px-md py-2 text-on-surface">{a.phone}</td>
                    <td className="px-md py-2 text-right font-semibold text-on-surface">{money(a.balance)}</td>
                    <td className="px-md py-2 text-right text-on-surface-variant">{a.held > 0 ? money(a.held) : "—"}</td>
                    <td className="px-md py-2 text-right text-on-surface-variant">{when(a.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-md border-t border-outline-variant text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-on-surface-variant">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
        <div className="p-md border-b border-outline-variant">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Latest movements</h2>
        </div>
        {!data ? (
          <p className="p-md text-sm text-on-surface-variant">Loading…</p>
        ) : data.recent.length === 0 ? (
          <p className="p-md text-sm text-on-surface-variant">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-outline-variant text-sm">
            {data.recent.map((t) => (
              <li key={t.id} className="px-md py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-on-surface">
                  {t.reason}
                  <span className="block text-xs text-on-surface-variant">
                    {t.phone} · {when(t.createdAt)}
                    {t.orderId && (
                      <>
                        {" · "}
                        <Link to={`/orders/${t.orderId}`} className="text-primary hover:underline">
                          {t.orderNumber}
                        </Link>
                      </>
                    )}
                  </span>
                </span>
                <span className={`font-semibold ${t.type === "credit" ? "text-primary" : "text-on-surface"}`}>
                  {t.type === "credit" ? "+" : "−"}
                  {money(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
