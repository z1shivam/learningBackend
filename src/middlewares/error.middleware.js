import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    const jsonError = err.toJSON();
    return res.status(jsonError.statusCode).json(jsonError);
  }

  console.error(err);
  return res.status(500).json({ message: err });
};

export default errorHandler;
