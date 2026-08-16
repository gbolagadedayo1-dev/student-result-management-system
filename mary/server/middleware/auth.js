import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(Object.assign(new Error("Authentication required"), { status: 401 }));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"], issuer: "maryresult-api", audience: "maryresult-web" });
    return next();
  } catch {
    return next(Object.assign(new Error("Session is invalid or has expired"), { status: 401 }));
  }
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(Object.assign(new Error("You do not have permission for this action"), { status: 403 }));
    }
    return next();
  };
}