// Prices in rupees, times in India time (the shop's time, whatever the phone's setting is).

export function rupees(amount) {
  const n = Number(amount);
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function istTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function minutesAgo(value) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

export const STATUS_LABELS = {
  placed: 'Placed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

// The one step the app offers for each status (the server only allows moving forward).
export const NEXT_STATUS_BUTTON = {
  preparing: 'Mark as Preparing',
  out_for_delivery: 'Mark as Out for delivery',
  delivered: 'Mark as Delivered',
};
