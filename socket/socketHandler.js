import jwt from "npm:jsonwebtoken";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { areFriends } from "../utils/friends.js";
import { addUserSocket, removeUserSocket } from "./socketState.js";

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication token required"));

      const decoded = jwt.verify(token, Deno.env.get("JWT_SECRET") || "connectly_dev_secret");
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("User not found"));

      socket.user = user;
      socket.userId = user._id.toString();
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    addUserSocket(userId, socket.id);
    socket.join(userId);

    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit("user_online", { userId });

    socket.on("send_message", async (payload, callback) => {
      try {
        const { to, content, type = "text" } = payload || {};
        if (!to || !content?.trim()) throw new Error("Recipient and content are required");
        if (!(await areFriends(userId, to))) throw new Error("Messaging requires accepted friendship");

        const message = await Message.create({
          sender: userId,
          receiver: to,
          content: content.trim(),
          type,
          delivered: true
        });

        const populated = await message.populate("sender receiver", "-password");
        socket.emit("message_delivered", { messageId: message._id, message: populated });
        io.to(to).emit("new_message", populated);
        callback?.({ ok: true, message: populated });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("mark_seen", async ({ messageId, fromUserId } = {}) => {
      if (!messageId) return;
      const message = await Message.findOneAndUpdate(
        { _id: messageId, receiver: userId },
        { seen: true, seenAt: new Date() },
        { new: true }
      );
      if (message) {
        io.to((fromUserId || message.sender).toString()).emit("message_seen", {
          messageId: message._id,
          seenAt: message.seenAt
        });
      }
    });

    socket.on("typing_start", ({ to } = {}) => {
      if (to) io.to(to).emit("typing", { from: userId });
    });

    socket.on("typing_stop", ({ to } = {}) => {
      if (to) io.to(to).emit("stop_typing", { from: userId });
    });

    socket.on("disconnect", async () => {
      const lastSocketGone = removeUserSocket(userId, socket.id);
      if (lastSocketGone) {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
        socket.broadcast.emit("user_offline", { userId, lastSeen });
      }
    });
  });
}
