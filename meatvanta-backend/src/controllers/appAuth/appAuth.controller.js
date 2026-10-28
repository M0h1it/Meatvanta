const appAuthService = require("../../services/appAuth/appAuth.service");
const { validateAppLogin, validateFcmToken } = require("../../validators/app/app.validator");
const { success, failure } = require("../../utils/apiResponse.util");

function handleError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

async function login(req, res, next) {
  try {
    const { isValid, errors } = validateAppLogin(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const { email, password, deviceName, fcmToken } = req.body;
    const result = await appAuthService.login({ email, password, deviceName, fcmToken, ipAddress: req.ip });
    return success(res, 200, "Signed in.", result);
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function logout(req, res, next) {
  try {
    await appAuthService.logout({ adminId: req.admin.id, deviceId: req.appDevice.id, ipAddress: req.ip });
    return success(res, 200, "Signed out.");
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function me(req, res, next) {
  try {
    return success(res, 200, "Current user fetched.", { user: await appAuthService.getMe(req.admin.id) });
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function updateFcmToken(req, res, next) {
  try {
    const { isValid, errors } = validateFcmToken(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    await appAuthService.setFcmToken({ deviceId: req.appDevice.id, fcmToken: req.body.fcmToken });
    return success(res, 200, "Push token saved.");
  } catch (err) {
    return handleError(err, next, res);
  }
}

module.exports = { login, logout, me, updateFcmToken };
