import { useCallback, useEffect, useState } from "react";
import { fetchBanners, setBannerActive, deleteBanner, reorderBanners } from "../api/bannersApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";
import BannerFormModal from "../components/BannerFormModal";
import LayoutModal from "../components/LayoutModal";
import { PLACEMENTS, STATUS_META, formatIst, DEFAULT_LAYOUT } from "../lib/placements";

/**
 * Offers & Banners. Banners are grouped by where they appear on the customer
 * site. A spot with nothing live is hidden on the site automatically.
 */
export default function BannersPage() {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("banners:create");
  const canUpdate = hasPermission("banners:update");
  const canDelete = hasPermission("banners:delete");

  const [banners, setBanners] = useState([]);
  const [layouts, setLayouts] = useState({});
  const [layoutFor, setLayoutFor] = useState(null); // placement id whose shape is being edited
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [modal, setModal] = useState(null); // { banner } | { placement }

  const load = useCallback(async () => {
    try {
      const data = await fetchBanners();
      setBanners(data.banners);
      setLayouts(data.layouts || {});
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load banners.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, message) {
    setIsBusy(true);
    try {
      await action();
      await load();
      if (message) showSuccess(message);
    } catch (err) {
      showError(err.response?.data?.message || "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  function move(group, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= group.length) return;
    const ids = group.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderBanners(group[0].placement, ids), "Order saved.");
  }

  async function handleDelete(banner) {
    const confirmed = await showConfirm({
      title: `Delete "${banner.title}"?`,
      text: "It disappears from the site straight away and its files are removed.",
      confirmButtonText: "Delete",
    });
    if (confirmed) run(() => deleteBanner(banner.id), "Banner deleted.");
  }

  const liveCount = banners.filter((b) => b.status === "live").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Offers & Banners</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            {liveCount} live on the site. Spots with nothing live stay hidden - customers never see an empty space.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setModal({ placement: "home_top" })}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            New banner
          </button>
        )}
      </div>

      {error && <div className="bg-error-container text-on-error-container rounded-lg px-md py-sm mb-md text-sm">{error}</div>}

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : (
        <div className="space-y-md">
          {PLACEMENTS.map((placement) => {
            const group = banners.filter((b) => b.placement === placement.id);
            const live = group.filter((b) => b.status === "live").length;
            return (
              <section key={placement.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant">
                <div className="flex flex-wrap items-start justify-between gap-3 px-md py-sm border-b border-outline-variant">
                  <div>
                    <h2 className="font-semibold text-on-surface">
                      {placement.label}
                      <span className="ml-2 text-xs font-normal text-on-surface-variant">
                        {live === 0 ? "hidden on site" : live === 1 ? "1 live" : `${live} live · rotate as a slider`}
                      </span>
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">{placement.where}</p>
                    {!placement.isText && <ShapeSummary layout={layouts[placement.id]} />}
                  </div>
                  <div className="flex gap-2">
                    {canUpdate && !placement.isText && (
                      <button
                        onClick={() => setLayoutFor(placement.id)}
                        className="text-sm px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                      >
                        Shape
                      </button>
                    )}
                    {canCreate && (
                      <button
                        onClick={() => setModal({ placement: placement.id })}
                        className="text-sm px-3 py-1.5 rounded border border-outline-variant text-primary hover:bg-surface-container-low"
                      >
                        + Add here
                      </button>
                    )}
                  </div>
                </div>

                {group.length === 0 ? (
                  <p className="px-md py-sm text-sm text-outline">Nothing here - this spot doesn't show on the site.</p>
                ) : (
                  <ul>
                    {group.map((banner, index) => (
                      <BannerRow
                        key={banner.id}
                        banner={banner}
                        isFirst={index === 0}
                        isLast={index === group.length - 1}
                        showOrder={group.length > 1}
                        isBusy={isBusy}
                        canUpdate={canUpdate}
                        canDelete={canDelete}
                        onMove={(dir) => move(group, index, dir)}
                        onToggle={(next) =>
                          run(() => setBannerActive(banner.id, next), next ? "Banner switched on." : "Banner switched off.")
                        }
                        onEdit={() => setModal({ banner })}
                        onDelete={() => handleDelete(banner)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {layoutFor && (
        <LayoutModal
          placement={layoutFor}
          layout={layouts[layoutFor]}
          sampleBanner={banners.find((b) => b.placement === layoutFor && b.desktopUrl)}
          onClose={() => setLayoutFor(null)}
          onSaved={() => {
            setLayoutFor(null);
            load();
          }}
        />
      )}

      <BannerFormModal
        layouts={layouts}
        isOpen={Boolean(modal)}
        banner={modal?.banner || null}
        defaultPlacement={modal?.placement}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          load();
        }}
      />
    </div>
  );
}

function ShapeSummary({ layout }) {
  const l = layout || DEFAULT_LAYOUT;
  const text = (r) => (r === "auto" ? "own shape" : r);
  return (
    <p className="text-[11px] text-on-surface-variant mt-1">
      Shape: computer {text(l.desktopRatio)} · phone {text(l.mobileRatio)}
      {l.fullWidth ? " · full width" : ""}
    </p>
  );
}

function BannerRow({ banner, isFirst, isLast, showOrder, isBusy, canUpdate, canDelete, onMove, onToggle, onEdit, onDelete }) {
  const status = STATUS_META[banner.status] || STATUS_META.off;

  let schedule = "Always";
  if (banner.startsAt && banner.endsAt) schedule = `${formatIst(banner.startsAt)} → ${formatIst(banner.endsAt)}`;
  else if (banner.startsAt) schedule = `From ${formatIst(banner.startsAt)}`;
  else if (banner.endsAt) schedule = `Until ${formatIst(banner.endsAt)}`;

  const linkText = {
    none: "No link",
    product: "Opens a product",
    category: "Opens a category",
    url: `Opens ${banner.linkValue}`,
  }[banner.linkType];

  return (
    <li className="flex flex-wrap sm:flex-nowrap items-center gap-md px-md py-sm border-t first:border-t-0 border-outline-variant">
      {/* Preview */}
      <div className="w-full sm:w-44 shrink-0 aspect-[16/6] rounded overflow-hidden bg-surface-container-low border border-outline-variant flex items-center justify-center">
        {banner.placement === "announcement" ? (
          <p className="text-[11px] text-white bg-secondary w-full h-full flex items-center justify-center text-center px-2">
            {banner.text}
          </p>
        ) : banner.mediaType === "video" ? (
          <video src={banner.desktopUrl} poster={banner.posterUrl || undefined} muted loop autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <img src={banner.desktopUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-on-surface truncate">{banner.title}</p>
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${status.className}`}>
            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
              {status.icon}
            </span>
            {status.label}
          </span>
          {banner.mediaType && (
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wide">
              {banner.mediaType}
              {banner.mobileUrl ? " · phone version" : ""}
            </span>
          )}
        </div>
        <p className="text-xs text-on-surface-variant mt-1">
          {schedule} · {linkText}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {canUpdate && showOrder && (
          <>
            <IconBtn icon="arrow_upward" label="Show earlier" disabled={isBusy || isFirst} onClick={() => onMove(-1)} />
            <IconBtn icon="arrow_downward" label="Show later" disabled={isBusy || isLast} onClick={() => onMove(1)} />
          </>
        )}
        {canUpdate && (
          <div className="mx-2">
            <Toggle checked={banner.isActive} onChange={onToggle} disabled={isBusy} showLabel={false} />
          </div>
        )}
        {canUpdate && <IconBtn icon="edit" label="Edit" disabled={isBusy} onClick={onEdit} />}
        {canDelete && <IconBtn icon="delete" label="Delete" disabled={isBusy} onClick={onDelete} danger />}
      </div>
    </li>
  );
}

function IconBtn({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded flex items-center justify-center disabled:opacity-30 ${
        danger ? "text-error hover:bg-error-container" : "text-on-surface-variant hover:bg-surface-container-low"
      }`}
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </button>
  );
}
