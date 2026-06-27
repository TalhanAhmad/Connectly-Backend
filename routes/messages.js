import { Router } from "express";
import Message from "../models/Message.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { areFriends } from "../utils/friends.js";

const router = Router();
router.use(authMiddleware);

router.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    if (!(await areFriends(req.user._id, req.params.userId))) {
      return res.status(403).json({ message: "Messaging requires an accepted friend request" });
    }

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ]
    })
      .populate("sender receiver", "-password")
      .sort({ createdAt: 1 });

    res.json({ messages });
  })
);

router.put(
  "/seen/:messageId",
  asyncHandler(async (req, res) => {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.messageId, receiver: req.user._id },
      { seen: true, seenAt: new Date() },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: "Message not found" });

    req.app.get("io")?.to(message.sender.toString()).emit("message_seen", {
      messageId: message._id,
      seenAt: message.seenAt
    });

    res.json({ message });
  })
);

router.delete(
  "/:messageId",
  asyncHandler(async (req, res) => {
    const message = await Message.findOneAndDelete({ _id: req.params.messageId, sender: req.user._id });
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.json({ message: "Message deleted" });
  })
);

export default router;
