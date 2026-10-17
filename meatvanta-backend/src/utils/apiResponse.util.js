function success(res, statusCode, message, data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    // The server's own clock. The customer site uses it to hide offers at the exact
    // moment they end even when the visitor's phone clock is wrong.
    serverTime: new Date().toISOString(),
  });
}

function failure(res, statusCode, message, errors = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}

module.exports = { success, failure };
