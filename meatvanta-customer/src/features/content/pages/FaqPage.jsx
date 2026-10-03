import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDeliveryAvailability } from "../api/contentApi";
import { useShopInfo } from "../../../hooks/useShopInfo";
import { formatWindow, formatRupees } from "../../../lib/format";

function FaqItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="bg-white rounded border border-hairline overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
        aria-expanded={isOpen}
      >
        <span className="font-bold text-ink text-sm">{question}</span>
        <span
          className={`material-symbols-outlined text-ink/40 shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 -mt-1">
          <p className="text-sm text-ink/70 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  const { shopInfo } = useShopInfo();
  const [availability, setAvailability] = useState(null);
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => {
    fetchDeliveryAvailability()
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, []);

  const window = availability
    ? formatWindow(availability.deliveryWindow.startTime, availability.deliveryWindow.endTime)
    : "6:00 AM – 11:00 AM";

  const chargeAnswer =
    availability?.deliveryChargeMode === "flat"
      ? `A flat ${formatRupees(availability.flatDeliveryCharge)} delivery charge is added at checkout, shown before you pay.`
      : "Delivery is charged based on your address. We confirm the exact amount after you order, and it appears on your order details.";

  // Questions are about how the system works, so they live in code; the
  // answers pull live numbers so they can never go stale.
  const faqs = [
    {
      question: "How fresh is the meat?",
      answer: `Raw material is bought fresh at market every morning, and your order is cut and prepared after it comes in — not portioned in advance. That's the whole reason deliveries run in the ${window} window.`,
    },
    {
      question: "When will my order arrive?",
      answer: `Deliveries go out between ${window} on the date you choose at checkout. You'll pick from the dates we're currently delivering on.`,
    },
    {
      question: "How much is delivery?",
      answer: chargeAnswer,
    },
    {
      question: "How do I pay?",
      answer: `${
        availability?.payment?.codEnabled === false ? "" : "Cash on delivery, or "
      }online payment at checkout (UPI, cards and netbanking via Razorpay). Your order is confirmed as soon as the payment goes through.`,
    },
    {
      question: "Which areas do you deliver to?",
      answer: availability?.deliveryAreaNote || "We deliver across Gurugram.",
    },
    {
      question: "Can I change or cancel my order?",
      answer: `Call us as soon as possible${
        shopInfo?.phone ? ` on ${shopInfo.phone}` : ""
      }. Since everything is cut fresh to order, we can usually help if the meat hasn't been prepared yet.`,
    },
    {
      question: "Do I need an account?",
      answer:
        "You can browse and build your cart freely. Signing in with your mobile number is only needed at checkout — it takes one OTP, and it's what lets you track orders and reorder later.",
    },
    {
      question: "How do I track my order?",
      answer:
        "Open My Orders and tap the order. The status updates on its own as we prepare and dispatch it — no need to refresh.",
    },
    {
      question: "Is the meat halal?",
      answer:
        "Yes. Everything is sourced and prepared to halal standards, the same way it has been for decades.",
    },
    {
      question: "Do you take bulk or party orders?",
      answer: shopInfo?.phone
        ? `Yes. For large quantities, call us on ${shopInfo.phone} so we can plan the procurement and confirm timing.`
        : "Yes — please contact us directly so we can plan the procurement and confirm timing.",
    },
  ];

  return (
    <div className="page-x max-w-3xl mx-auto py-8 md:py-12">
      <h1 className="font-display text-headline-lg text-ink mb-1">Frequently Asked Questions</h1>
      <p className="text-ink/60 text-sm mb-6">Everything about ordering, delivery and payment.</p>

      <div className="space-y-2.5">
        {faqs.map((faq, index) => (
          <FaqItem
            key={faq.question}
            question={faq.question}
            answer={faq.answer}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
          />
        ))}
      </div>

      <div className="mt-8 bg-white rounded border border-hairline p-5 text-center">
        <p className="font-bold text-ink mb-1">Still have a question?</p>
        <p className="text-sm text-ink/60 mb-4">We're happy to help.</p>
        <Link
          to="/contact"
          className="inline-block bg-brand text-white font-bold px-6 py-3 rounded-full hover:opacity-90"
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}
