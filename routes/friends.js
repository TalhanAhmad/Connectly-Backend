import { Router } from "express";
import FriendRequest from "../models/FriendRequest.js";
import User from "../models/User.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { addMutualFriends, removeMutualFriends } from "../utils/friends.js";

const router = Router();
router.use(authMiddleware);

function io(req) {
  return req.app.get("io");
}

router.post(
  "/request/:userId",
  asyncHandler(async (req, res) => {
    const to = await User.findById(req.params.userId);
    if (!to) return res.status(404).json({ message: "User not found" });
    if (to._id.equals(req.user._id)) return res.status(400).json({ message: "Cannot friend yourself" });
    if (req.user.friends.some((id) => id.equals(to._id))) return res.status(409).json({ message: "Already friends" });

    const reverse = await FriendRequest.findOne({ from: to._id, to: req.user._id, status: "pending" });
    if (reverse) {
      reverse.status = "accepted";
      await reverse.save();
      await addMutualFriends(req.user._id, to._id);
      io(req).to(to._id.toString()).emit("request_accepted", { by: req.user.toSafeJSON(), request: reverse });
      return res.json({ request: reverse, accepted: true });
    }

    const request = await FriendRequest.findOneAndUpdate(
      { from: req.user._id, to: to._id },
      { status: "pending" },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("from to", "-password");

    io(req).to(to._id.toString()).emit("friend_request_received", { request });
    res.status(201).json({ request });
  })
);

router.put(
  "/accept/:requestId",
  asyncHandler(async (req, res) => {
    const request = await FriendRequest.findOne({
      _id: req.params.requestId,
      to: req.user._id,
      status: "pending"
    }).populate("from to", "-password");

    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "accepted";
    await request.save();
    await addMutualFriends(request.from._id, request.to._id);

    io(req).to(request.from._id.toString()).emit("request_accepted", { by: req.user.toSafeJSON(), request });
    res.json({ request });
  })
);

router.put(
  "/decline/:requestId",
  asyncHandler(async (req, res) => {
    const request = await FriendRequest.findOneAndUpdate(
      { _id: req.params.requestId, to: req.user._id, status: "pending" },
      { status: "declined" },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json({ request });
  })
);

router.delete(
  "/cancel/:requestId",
  asyncHandler(async (req, res) => {
    await FriendRequest.deleteOne({ _id: req.params.requestId, from: req.user._id, status: "pending" });
    res.json({ message: "Request cancelled" });
  })
);

router.delete(
  "/remove/:friendId",
  asyncHandler(async (req, res) => {
    await removeMutualFriends(req.user._id, req.params.friendId);
    res.json({ message: "Friend removed" });
  })
);

router.get(
  "/requests/incoming",
  asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({ to: req.user._id, status: "pending" })
      .populate("from", "-password")
      .sort({ createdAt: -1 });
    res.json({ requests });
  })
);

router.get(
  "/requests/outgoing",
  asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({ from: req.user._id, status: "pending" })
      .populate("to", "-password")
      .sort({ createdAt: -1 });
    res.json({ requests });
  })
);

router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate("friends", "-password");
    res.json({ friends: user.friends });
  })
);

export default router;
