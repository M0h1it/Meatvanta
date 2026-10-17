import Swal from "sweetalert2";
import { fetchRiders } from "../api/deliveryApi";
import { showError } from "../../../lib/sweetAlert";

/**
 * Pop-up with the list of delivery riders.
 * Resolves { chosen: false } if closed, else { chosen: true, riderId } (riderId null = remove rider).
 */
export async function pickRider({ title, currentRiderId = null }) {
  let riders;
  try {
    riders = await fetchRiders();
  } catch (err) {
    showError(err.response?.data?.message || "Could not load delivery riders.");
    return { chosen: false };
  }

  if (riders.length === 0) {
    await Swal.fire({
      icon: "info",
      title: "No delivery rider yet",
      text: 'First create a role with the "delivery" permissions (Roles), then add the rider as an Admin User with that role.',
      confirmButtonColor: "#B4141F",
    });
    return { chosen: false };
  }

  const options = { "": "— No rider —" };
  riders.forEach((r) => {
    options[r.id] = r.phone ? `${r.name} (${r.phone})` : r.name;
  });

  const result = await Swal.fire({
    title,
    input: "select",
    inputOptions: options,
    inputValue: currentRiderId ? String(currentRiderId) : "",
    showCancelButton: true,
    confirmButtonText: "Save",
    confirmButtonColor: "#B4141F",
    cancelButtonColor: "#6b7280",
  });
  if (!result.isConfirmed) return { chosen: false };
  return { chosen: true, riderId: result.value === "" ? null : Number(result.value) };
}
