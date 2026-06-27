import { Router } from "express";
import { body, validationResult } from "express-validator";
import FriendRequest from "../models/FriendRequest.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { authMiddleware } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { deleteAvatar, uploadAvatar } from "../utils/avatar.js";

const router = Router();

router.use(authMiddleware);

function publicUser(user) {
  const json = user.toObject ? user.toObject() : user;
  delete json.password;
  return json;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await User.find({ _id: { $ne: req.user._id } }).select("-password").sort({ isOnline: -1, username: 1 });
    const incoming = await FriendRequest.find({ to: req.user._id, status: "pending" });
    const outgoing = await FriendRequest.find({ from: req.user._id, status: "pending" });

    const incomingMap = new Map(incoming.map((request) => [request.from.toString(), request]));
    const outgoingMap = new Map(outgoing.map((request) => [request.to.toString(), request]));
    const friendIds = new Set(req.user.friends.map((id) => id.toString()));

    res.json({
      users: users.map((user) => ({
        ...publicUser(user),
        relationship: friendIds.has(user._id.toString())
          ? "friend"
          : incomingMap.has(user._id.toString())
            ? "incoming"
            : outgoingMap.has(user._id.toString())
              ? "outgoing"
              : "none",
        requestId: incomingMap.get(user._id.toString())?._id || outgoingMap.get(user._id.toString())?._id || null
      }))
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: publicUser(user) });
  })
);

router.put(
  "/profile",
  [
    body("displayName").optional().trim().isLength({ max: 60 }),
    body("bio").optional().trim().isLength({ max: 160 })
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    req.user.displayName = req.body.displayName ?? req.user.displayName;
    req.user.bio = req.body.bio ?? req.user.bio;
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  })
);

router.post(
  "/avatar",
  upload.single("avatar"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Avatar image required" });

    if (req.user.avatarPublicId) {
      await deleteAvatar(req.user.avatarPublicId);
    }

    const result = await uploadAvatar(req.file, req.user._id);
    req.user.avatar = result.url;
    req.user.avatarPublicId = result.publicId;
    await req.user.save();

    res.json({ user: req.user.toSafeJSON() });
  })
);

router.post(
  "/avatar/adjust",
  [
    body("x").isNumeric(),
    body("y").isNumeric(),
    body("scale").isFloat({ min: 0.5, max: 3 })
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    req.user.avatarCrop = {
      x: Number(req.body.x),
      y: Number(req.body.y),
      scale: Number(req.body.scale)
    };
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  })
);

router.delete(
  "/account",
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    await Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] });
    await FriendRequest.deleteMany({ $or: [{ from: userId }, { to: userId }] });
    await User.updateMany({ friends: userId }, { $pull: { friends: userId } });
    await deleteAvatar(req.user.avatarPublicId);
    await User.findByIdAndDelete(userId);

    req.app.get("io")?.emit("user_deleted", { userId: userId.toString() });
    res.json({ message: "Account deleted" });
  })
);

export default router;
