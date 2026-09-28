const { failure } = require("../utils/apiResponse.util");
const multer = require("multer");
const { MAX_FILE_SIZE_MB, MAX_FILES_PER_UPLOAD } = require("./upload.middleware");

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Each image must be ${MAX_FILE_SIZE_MB}MB or smaller.`,
  LIMIT_FILE_COUNT: `You can upload up to ${MAX_FILES_PER_UPLOAD} images at a time.`,
  LIMIT_UNEXPECTED_FILE: `Upload images using the "images" field, up to ${MAX_FILES_PER_UPLOAD} at a time.`,
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error("[errorHandler]", err);

  if (err instanceof multer.MulterError) {
    return failure(res, 422, MULTER_MESSAGES[err.code] || "Image upload failed.");
  }

  const statusCode = err.statusCode || 500;
  const message = err.expose ? err.message : "Something went wrong on our end.";

  return failure(res, statusCode, message);
}

module.exports = { errorHandler };
