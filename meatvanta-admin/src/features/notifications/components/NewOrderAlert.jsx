import { useNavigate } from "react-router-dom";
import { useNewOrderAlerts } from "../../../hooks/useNewOrderAlerts";

function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function paymentLabel(order) {
  if (order.paymentMethod === "cod") return { text: `Cash on Delivery — collect ${money(order.total)}`, tone: "warn" };
  if (order.paymentStatus === "paid") return { text: "Paid online", tone: "ok" };
  return { text: "Online payment — not confirmed yet", tone: "warn" };
}

function slot(order) {
  if (!order.deliveryDate) return null;
  const day = String(order.deliveryDate).slice(0, 10).split("-").reverse().join("/");
  const time = order.deliveryStartTime && order.deliveryEndTime ? `, ${order.deliveryStartTime}–${order.deliveryEndTime}` : "";
  return `${day}${time}`;
}

/**
 * Full-screen "new order" popup, mounted once in AdminLayout so it appears on
 * every page. It cannot be dismissed by clicking outside or pressing Escape:
 * only OK closes an order (and marks it read). With several waiting, the
 * arrows step through them ("2 of 3").
 */
export default function NewOrderAlert() {
  const navigate = useNavigate();
  const { canSee, alerts, index, current, next, prev, acknowledge, replaySound, soundBlocked } = useNewOrderAlerts();

  if (!canSee || !current) return null;
  const { order } = current;
  const pay = paymentLabel(order);
  const when = slot(order);
  const many = alerts.length > 1;

  async function openOrder() {
    await acknowledge(current.notificationId);
    navigate(`/orders/${order.id}`);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3"
      role="alertdialog"
      aria-modal="true"
      aria-label="New order received"
    >
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
        {soundBlocked && (
          <button
            type="button"
            onClick={replaySound}
            className="flex items-center justify-center gap-2 bg-amber-400 text-black text-sm font-semibold px-4 py-2 hover:bg-amber-300"
          >
            <span className="material-symbols-outlined text-lg">volume_off</span>
            Sound off — tap here to enable
          </button>
        )}

        <div className="bg-primary text-on-primary px-5 py-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl animate-bounce">notifications_active</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide opacity-80">New order</p>
            <p className="text-xl font-bold leading-tight">{order.orderNumber}</p>
          </div>
          {many && (
            <div className="flex items-center gap-1 bg-white/15 rounded-full px-1 py-0.5">
              <button
                type="button"
                onClick={prev}
                disabled={index === 0}
                aria-label="Previous order"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="text-sm font-semibold tabular-nums px-1">
                {index + 1} of {alerts.length}
              </span>
              <button
                type="button"
                onClick={next}
                disabled={index === alerts.length - 1}
                aria-label="Next order"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          )}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-on-surface">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight">{order.customerName}</p>
              <a href={`tel:${order.customerPhone}`} className="text-sm text-primary font-medium">
                {order.customerPhone}
              </a>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-primary">{money(order.total)}</p>
              <span
                className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  pay.tone === "ok" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
                }`}
              >
                {pay.text}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant divide-y divide-outline-variant">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.quantity} × {item.productName}{" "}
                    <span className="text-on-surface-variant font-normal">({item.variantLabel})</span>
                  </p>
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-on-surface-variant">
                      {item.selectedOptions.map((o) => o.optionName).join(", ")}
                    </p>
                  )}
                </div>
                <span className="font-semibold shrink-0">{money(item.lineTotal)}</span>
              </div>
            ))}
            {(order.discount > 0 || order.deliveryCharge > 0) && (
              <div className="px-3 py-2 text-xs text-on-surface-variant space-y-0.5">
                {order.discount > 0 && (
                  <p className="flex justify-between">
                    <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                    <span>−{money(order.discount)}</span>
                  </p>
                )}
                {order.deliveryCharge > 0 && (
                  <p className="flex justify-between">
                    <span>Delivery</span>
                    <span>{money(order.deliveryCharge)}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {order.deliveryAddress && (
            <div className="flex items-start gap-2 text-sm">
              <span className="material-symbols-outlined text-lg text-on-surface-variant">location_on</span>
              <p className="whitespace-pre-line">{order.deliveryAddress}</p>
            </div>
          )}
          {when && (
            <div className="flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-lg text-on-surface-variant">schedule</span>
              <p>Deliver: {when}</p>
            </div>
          )}
          {order.notes && (
            <div className="flex items-start gap-2 text-sm rounded bg-amber-50 border border-amber-200 px-3 py-2">
              <span className="material-symbols-outlined text-lg text-amber-700">sticky_note_2</span>
              <p className="whitespace-pre-line">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-outline-variant bg-surface-container-low">
          <button
            type="button"
            onClick={replaySound}
            className="flex items-center gap-1 text-sm px-3 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-lg">volume_up</span>
            Replay sound
          </button>
          <button
            type="button"
            onClick={openOrder}
            className="text-sm px-3 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container"
          >
            Open order
          </button>
          <button
            type="button"
            onClick={() => acknowledge(current.notificationId)}
            className="ml-auto bg-primary-container text-on-primary font-bold px-8 py-2.5 rounded hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
