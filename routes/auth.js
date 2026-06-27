import { Router } from "express";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import { authMiddleware, signToken } from "../middleware/auth.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false
});

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
}

router.post(
  "/register",
  authLimiter,
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username must be at least 3 characters"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const user = await User.create({
      username,
      email,
      password,
      displayName: username
    });

    res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.post(
  "/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select("+password");
    if (!user || !(await user.comparePassword(req.body.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

router.post("/logout", authMiddleware, (req, res) => {
  res.json({ message: "Logged out" });
});

export default router;
