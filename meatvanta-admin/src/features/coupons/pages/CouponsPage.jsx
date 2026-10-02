import { useCallback, useEffect, useState } from "react";
import { fetchCoupons, updateCoupon, deleteCoupon } from "../api/couponsApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";
import CouponFormModal from "../components/CouponFormModal";
import NewCustomerOfferCard from "../components/NewCustomerOfferCard";
import { formatIst } from "../../banners/lib/placements";

const STATUS = {
  live: { label: "Live", icon: "radio_button_checked", className: "bg-secondary-fixed text-on-secondary-fixed-variant" },
  scheduled: { label: "Scheduled", icon: "schedule", className: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  expired: { label: "Ended", icon: "event_busy", className: "bg-surface-container-high text-on-surface-variant" },
  used_up: { label: "Used up", icon: "block", className: "bg-surface-container-high text-on-surface-variant" },
  off: { label: "Off", icon: "toggle_off", className: "bg-surface-container-high text-on-surface-variant" },
};

/** Discount codes customers type in the cart. All discounts are worked out on the server. */
export default function CouponsPage() {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("coupons:create");
  const canUpdate = hasPermission("coupons:update");
  const canDelete = hasPermission("coupons:delete");

  const [coupons, setCoupons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null); // { couponId } | {}

  const load = useCallback(async () => {
    try {
      setCoupons(await fetchCoupons());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load coupons.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(coupon, next) {
    setBusyId(coupon.id);
    try {
      await updateCoupon(coupon.id, { isActive: next });
      await load();
      showSuccess(next ? `${coupon.code} switched on.` : `${coupon.code} switched off.`);
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't update the coupon.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(coupon) {
    const ok = await showConfirm({
      title: `Delete ${coupon.code}?`,
      text: "Customers won't be able to use it any more.",
      confirmButtonText: "Delete",
    });
    if (!ok) return;
    try {
      await deleteCoupon(coupon.id);
      await load();
      showSuccess("Coupon deleted.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't delete the coupon.");
    }
  }

  const totalGiven = coupons.reduce((s, c) => s + (c.discountGiven || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Coupons</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Codes customers type in the cart. ₹{Math.round(totalGiven).toLocaleString("en-IN")} saved by customers so far.
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setModal({})} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90">
            <span className="material-symbols-outlined text-lg">add</span>
            New coupon
          </button>
        )}
      </div>

      {error && <div className="bg-error-container text-on-error-container rounded-lg px-md py-sm mb-md text-sm">{error}</div>}

      <NewCustomerOfferCard canUpdate={canUpdate} />

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : coupons.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant flex flex-col items-center text-center py-xl px-md">
          <span className="material-symbols-outlined text-4xl text-outline-variant mb-2">sell</span>
          <p className="text-on-surface-variant">No coupons yet. Create one - e.g. WELCOME50 for ₹50 off a first order.</p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-surface-container-low text-on-surface">
              <tr>
                <th className="text-left px-4 py-2 font-label-bold text-label-bold">Code</th>
                <th className="text-left px-4 py-2 font-label-bold text-label-bold">Discount</th>
                <th className="text-left px-4 py-2 font-label-bold text-label-bold">Used</th>
                <th className="text-left px-4 py-2 font-label-bold text-label-bold">Valid</th>
                <th className="text-right px-4 py-2 font-label-bold text-label-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const status = STATUS[c.status] || STATUS.off;
                let valid = "Always";
                if (c.startsAt && c.endsAt) valid = `${formatIst(c.startsAt)} → ${formatIst(c.endsAt)}`;
                else if (c.startsAt) valid = `From ${formatIst(c.startsAt)}`;
                else if (c.endsAt) valid = `Until ${formatIst(c.endsAt)}`;
                return (
                  <tr key={c.id} className="border-t border-outline-variant align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold tracking-wider text-on-surface">{c.code}</p>
                      <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${status.className}`}>
                        <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                          {status.icon}
                        </span>
                        {status.label}
                      </span>
                      {c.showOnSite && <p className="text-[11px] text-on-surface-variant mt-1">Shown in cart offers</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface">
                      {c.summary}
                      {c.appliesTo !== "all" && (
                        <p className="text-xs text-on-surface-variant">
                          Only on selected {c.appliesTo === "products" ? "products" : "categories"}
                        </p>
                      )}
                      {c.description && <p className="text-xs text-on-surface-variant">“{c.description}”</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface tabular-nums">
                      {c.usedCount}
                      {c.totalLimit ? ` / ${c.totalLimit}` : ""}
                      {c.perCustomerLimit && <p className="text-xs text-on-surface-variant">{c.perCustomerLimit}× per customer</p>}
                      {c.discountGiven > 0 && <p className="text-xs text-on-surface-variant">₹{Math.round(c.discountGiven).toLocaleString("en-IN")} saved</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">{valid}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate && (
                          <div className="mr-2">
                            <Toggle checked={c.isActive} onChange={(v) => toggle(c, v)} disabled={busyId === c.id} showLabel={false} />
                          </div>
                        )}
                        {canUpdate && (
                          <button type="button" title="Edit" aria-label={`Edit ${c.code}`} onClick={() => setModal({ couponId: c.id })} className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low">
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                        )}
                        {canDelete && c.usedCount === 0 && (
                          <button type="button" title="Delete" aria-label={`Delete ${c.code}`} onClick={() => remove(c)} className="w-8 h-8 rounded flex items-center justify-center text-error hover:bg-error-container">
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CouponFormModal
        isOpen={Boolean(modal)}
        couponId={modal?.couponId || null}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          load();
        }}
      />
    </div>
  );
}
