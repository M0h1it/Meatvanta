import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAddresses, deleteAddress, setDefaultAddress } from "../api/addressesApi";
import { useCustomerAuth } from "../../../hooks/useCustomerAuth";
import AddressFormModal from "../components/AddressFormModal";
import AccountSidebar from "../components/AccountSidebar";
import { fetchWallet } from "../../wallet/api/walletApi";
import { formatRupees, formatDateTime } from "../../../lib/format";

export default function AccountPage() {
  const { customer, isAuthenticated, isLoading: authLoading, openLogin, logout, refreshCustomer } =
    useCustomerAuth();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [wallet, setWallet] = useState(null);

  async function loadAddresses() {
    setIsLoading(true);
    try {
      setAddresses(await fetchAddresses());
    } catch {
      setAddresses([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    loadAddresses();
    // The wallet is a nice-to-have on this page: a failure must not break addresses.
    fetchWallet().then(setWallet).catch(() => setWallet(null));
  }, [isAuthenticated]);

  async function handleDelete(address) {
    if (!confirm(`Remove "${address.label}" address?`)) return;
    await deleteAddress(address.id);
    await loadAddresses();
    refreshCustomer();
  }

  async function handleSetDefault(address) {
    await setDefaultAddress(address.id);
    await loadAddresses();
    refreshCustomer();
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  if (authLoading) {
    return <div className="page-x max-w-3xl mx-auto py-12 text-sm text-ink/60">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="page-x max-w-3xl mx-auto py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-ink/20 mb-3">account_circle</span>
        <p className="text-ink font-bold text-lg mb-1">Sign in to your account</p>
        <p className="text-ink/60 text-sm mb-6">Save addresses and see your order history.</p>
        <button
          onClick={() => openLogin()}
          className="bg-brand text-white font-bold px-8 py-3 rounded-full hover:opacity-90"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="page-x max-w-5xl mx-auto py-8 md:py-12">
      <h1 className="font-display text-headline-lg text-ink mb-6">My Account</h1>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <AccountSidebar customer={customer} onLogout={handleLogout} />

        <div className="flex-1 min-w-0 w-full">
          <div className="bg-white rounded border border-hairline p-5 mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-dark/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-brand-dark">person</span>
              </div>
              <div>
                <p className="font-bold text-ink">{customer?.name}</p>
                <p className="text-sm text-ink/60">+91 {customer?.phone}</p>
              </div>
            </div>
          </div>

          {wallet && (
            <div className="bg-white rounded border border-hairline p-5 mb-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-accent">account_balance_wallet</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-ink">Meat Vanta Wallet</h2>
                    <p className="text-xs text-ink/60">Use it at checkout, up to the full amount of your order.</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-ink shrink-0">{formatRupees(wallet.balance)}</p>
              </div>

              {wallet.transactions.length > 0 && (
                <ul className="mt-4 border-t border-hairline divide-y divide-hairline">
                  {wallet.transactions.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-ink">{t.reason}</p>
                        <p className="text-xs text-ink/50">{formatDateTime(t.createdAt)}</p>
                      </div>
                      <span className={`font-semibold shrink-0 ${t.type === "credit" || t.type === "release" ? "text-success" : "text-ink"}`}>
                        {t.type === "credit" || t.type === "release" ? "+" : "−"}
                        {formatRupees(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white rounded border border-hairline p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-ink">Saved Addresses</h2>
              <button
                onClick={() => {
                  setEditingAddress(null);
                  setIsFormOpen(true);
                }}
                className="text-sm font-bold text-brand-dark"
              >
                + Add New
              </button>
            </div>

            {isLoading ? (
              <p className="text-sm text-ink/60">Loading...</p>
            ) : addresses.length === 0 ? (
              <p className="text-sm text-ink/60">
                No saved addresses yet. Add one to speed up checkout.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {addresses.map((address) => (
                  <div key={address.id} className="border border-hairline rounded-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-ink text-sm">{address.label}</p>
                          {address.isDefault && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-brand-dark/10 text-brand-dark px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink/70 mt-0.5">{address.addressLine}</p>
                        {(address.area || address.pincode) && (
                          <p className="text-xs text-ink/50">
                            {[address.area, address.pincode].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 mt-2 text-xs font-semibold">
                      <button
                        onClick={() => {
                          setEditingAddress(address);
                          setIsFormOpen(true);
                        }}
                        className="text-brand-dark"
                      >
                        Edit
                      </button>
                      {!address.isDefault && (
                        <button onClick={() => handleSetDefault(address)} className="text-ink/60">
                          Set as default
                        </button>
                      )}
                      <button onClick={() => handleDelete(address)} className="text-brand">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddressFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingAddress(null);
        }}
        existingAddress={editingAddress}
        onSaved={() => {
          loadAddresses();
          refreshCustomer();
        }}
      />
    </div>
  );
}
