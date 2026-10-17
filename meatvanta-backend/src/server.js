require("dotenv").config();
const app = require("./app");
const walletService = require("./services/wallet/wallet.service");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Star Halal admin API running on port ${PORT}`);
});

// Wallet money reserved for an online payment that was never completed goes back to the
// customer's balance after ~20 minutes. The timer is only a convenience: the same release also
// runs whenever a wallet is opened, so nothing depends on this loop staying alive.
const HOLD_SWEEP_MS = 5 * 60 * 1000;
const sweep = () =>
  walletService.releaseExpiredHolds().catch((err) => console.error("[wallet] hold sweep failed:", err.message));
setTimeout(sweep, 30 * 1000).unref();
setInterval(sweep, HOLD_SWEEP_MS).unref();
