import jwt from "npm:jsonwebtoken";
import User from "../models/User.js";

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication token required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

const JWT_SECRET = Deno.env.get("JWT_SECRET") || "connectly_dev_secret";

export function signToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET, {
    expiresIn: Deno.env.get("JWT_EXPIRES_IN") || "7d"
  });
}
