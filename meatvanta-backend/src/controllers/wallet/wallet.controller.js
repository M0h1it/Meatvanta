const walletService = require("../../services/wallet/wallet.service");
const { success } = require("../../utils/apiResponse.util");

/**
 * The signed-in customer's own wallet. The phone number comes from the verified
 * session (req.customer, set by requireCustomerAuth) - never from the request - so
 * nobody can read another number's balance by typing it in.
 */
async function mine(req, res, next) {
  try {
    const data = await walletService.getWallet(req.customer.phone, { limit: 30 });
    return success(res, 200, "Wallet fetched.", {
      balance: data.balance,
      held: data.held,
      transactions: data.transactions,
    });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------- admin report ------------------------------- */

/** Totals: what the shop owes, and how the wallet moved this month. */
async function adminSummary(req, res, next) {
  try {
    const [summary, recent] = await Promise.all([
      walletService.getSummary(),
      walletService.recentTransactions({ limit: 30 }),
    ]);
    return success(res, 200, "Wallet summary fetched.", { summary, recent });
  } catch (err) {
    return next(err);
  }
}

/** Accounts, biggest balance first. ?search=<phone digits>&page=&pageSize=&all=true */
async function adminAccounts(req, res, next) {
  try {
    const { search, page, pageSize, all } = req.query;
    const result = await walletService.listAccounts({
      search: search || "",
      page: page ? Math.max(1, Number(page)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(1, Number(pageSize))) : 25,
      onlyWithBalance: all !== "true",
    });
    return success(res, 200, "Wallet accounts fetched.", result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { mine, adminSummary, adminAccounts };
