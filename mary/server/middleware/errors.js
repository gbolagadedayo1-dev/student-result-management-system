import { ZodError } from "zod";

export function notFound(req, _res, next) {
  next(Object.assign(new Error(`Route ${req.method} ${req.path} was not found`), { status: 404 }));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: "Validation failed",
      details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }

  const status = Number(error.status ?? 500);
  const response = { error: status >= 500 ? "An unexpected server error occurred" : error.message };
  if (process.env.NODE_ENV !== "production" && status >= 500) response.details = error.message;
  return res.status(status).json(response);
}