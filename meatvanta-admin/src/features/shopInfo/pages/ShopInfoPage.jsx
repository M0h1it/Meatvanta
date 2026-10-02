import { useEffect, useState } from "react";
import { fetchShopInfo, updateShopInfo } from "../api/shopInfoApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError } from "../../../lib/sweetAlert";

const FIELD_SECTIONS = [
  {
    title: "Identity",
    hint: "Shown in the site header, footer and on the About page.",
    fields: [
      { key: "shopName", label: "Shop Name" },
      { key: "tagline", label: "Tagline" },
      { key: "yearsInBusiness", label: "Years in Business", type: "number" },
    ],
  },
  {
    title: "Contact",
    hint: "Customers see these on the Contact page. Leave any blank to hide it.",
    fields: [
      { key: "phone", label: "Phone Number" },
      { key: "whatsappNumber", label: "WhatsApp Number" },
      { key: "email", label: "Email" },
      { key: "shopHours", label: "Shop Hours", placeholder: "e.g. 6:00 AM – 9:00 PM, all days" },
    ],
  },
  {
    title: "Location",
    hint: "The map link becomes a 'Get directions' button.",
    fields: [
      { key: "addressLine", label: "Shop Address", type: "textarea" },
      { key: "mapUrl", label: "Google Maps Link", placeholder: "https://maps.app.goo.gl/..." },
    ],
  },
  {
    title: "Social Media",
    hint: "Shown as icons in the website footer. Paste the full profile link. Leave blank to hide an icon.",
    fields: [
      { key: "instagramUrl", label: "Instagram", placeholder: "https://www.instagram.com/yourshop" },
      { key: "facebookUrl", label: "Facebook", placeholder: "https://www.facebook.com/yourshop" },
      { key: "youtubeUrl", label: "YouTube", placeholder: "https://www.youtube.com/@yourshop" },
    ],
  },
  {
    title: "Story",
    hint: "Blank lines start a new paragraph. This is the About page.",
    fields: [
      { key: "aboutStory", label: "Our Story", type: "textarea", rows: 8 },
      { key: "qualityPromise", label: "Quality Promise", type: "textarea", rows: 5 },
    ],
  },
  {
    title: "Compliance",
    hint: "Food businesses are required to display their FSSAI licence number.",
    fields: [{ key: "fssaiNumber", label: "FSSAI Licence Number" }],
  },
];

export default function ShopInfoPage() {
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const { hasPermission } = usePermission();
  const canUpdate = hasPermission("shop_info:update");

  useEffect(() => {
    fetchShopInfo()
      .then(setForm)
      .catch((err) => setError(err.response?.data?.message || "Failed to load shop info."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    try {
      const updated = await updateShopInfo(form);
      setForm(updated);
      setError(null);
      showSuccess("Shop info saved.");
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setFieldErrors(data.errors);
      const message = data?.message || "Save failed.";
      setError(message);
      showError(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading...</p>;

  if (!form) {
    return (
      <div className="rounded bg-error-container text-on-error-container text-sm px-3 py-2">
        {error || "Shop info unavailable."}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline-md text-headline-md text-on-surface">Shop Info</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1 mb-lg">
        Everything customers read on the About, Contact and FAQ pages. Changes go live immediately.
      </p>

      {error && (
        <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-lg max-w-2xl">
        {FIELD_SECTIONS.map((section) => (
          <section
            key={section.title}
            className="bg-surface-container-lowest rounded-lg border border-outline-variant p-lg"
          >
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">{section.title}</h2>
            <p className="text-xs text-on-surface-variant mb-4">{section.hint}</p>

            <div className="space-y-3">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <label className="block font-label-bold text-label-bold text-on-surface mb-1">
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      rows={field.rows || 3}
                      disabled={!canUpdate}
                      placeholder={field.placeholder}
                      value={form[field.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      disabled={!canUpdate}
                      placeholder={field.placeholder}
                      value={form[field.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    />
                  )}
                  {fieldErrors[field.key] && (
                    <p className="text-xs text-error mt-1">{fieldErrors[field.key]}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {canUpdate && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-primary-container text-on-primary text-sm px-6 py-2.5 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSaving ? "Saving..." : "Save Shop Info"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
