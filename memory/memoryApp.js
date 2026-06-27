import bcrypt from "npm:bcryptjs";
import jwt from "npm:jsonwebtoken";
import multer from "npm:multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const db = {
  users: [],
  messages: [],
  requests: []
};

let seq = 1;
const id = () => String(seq++);

function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function sign(user) {
  return jwt.sign({ id: user._id }, Deno.env.get("JWT_SECRET") || "connectly_dev_secret", {
    expiresIn: Deno.env.get("JWT_EXPIRES_IN") || "7d"
  });
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication token required" });
    const decoded = jwt.verify(token, Deno.env.get("JWT_SECRET") || "connectly_dev_secret");
    const user = db.users.find((item) => item._id === decoded.id);
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

function relationship(current, other) {
  if (current.friends.includes(other._id)) return { relationship: "friend", requestId: null };
  const incoming = db.requests.find((request) => request.from === other._id && request.to === current._id && request.status === "pending");
  if (incoming) return { relationship: "incoming", requestId: incoming._id };
  const outgoing = db.requests.find((request) => request.from === current._id && request.to === other._id && request.status === "pending");
  if (outgoing) return { relationship: "outgoing", requestId: outgoing._id };
  return { relationship: "none", requestId: null };
}

function addFriends(a, b) {
  const userA = db.users.find((user) => user._id === a);
  const userB = db.users.find((user) => user._id === b);
  if (userA && !userA.friends.includes(b)) userA.friends.push(b);
  if (userB && !userB.friends.includes(a)) userB.friends.push(a);
}

function registerApi(app, io) {
  app.post("/api/auth/register", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (username.length < 3 || !email.includes("@") || password.length < 6) {
      return res.status(422).json({ message: "Username, valid email, and 6 character password are required" });
    }
    if (db.users.some((user) => user.username === username || user.email === email)) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const user = {
      _id: id(),
      username,
      email,
      password: await bcrypt.hash(password, 12),
      displayName: username,
      bio: "",
      avatar: "",
      avatarPublicId: "",
      avatarCrop: { x: 0, y: 0, scale: 1 },
      isOnline: false,
      lastSeen: new Date().toISOString(),
      friends: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(user);
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = db.users.find((item) => item.email === email);
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  });

  app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post("/api/auth/logout", auth, (req, res) => res.json({ message: "Logged out" }));

  app.get("/api/users", auth, (req, res) => {
    const users = db.users
      .filter((user) => user._id !== req.user._id)
      .map((user) => ({ ...publicUser(user), ...relationship(req.user, user) }));
    res.json({ users });
  });

  app.get("/api/users/:id", auth, (req, res) => {
    const user = db.users.find((item) => item._id === req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: publicUser(user) });
  });

  app.put("/api/users/profile", auth, (req, res) => {
    req.user.displayName = String(req.body.displayName || req.user.displayName).slice(0, 60);
    req.user.bio = String(req.body.bio || "").slice(0, 160);
    req.user.updatedAt = new Date().toISOString();
    res.json({ user: publicUser(req.user) });
  });

  app.post("/api/users/avatar", auth, upload.single("avatar"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Avatar image required" });
    req.user.avatar = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    req.user.updatedAt = new Date().toISOString();
    res.json({ user: publicUser(req.user) });
  });

  app.post("/api/users/avatar/adjust", auth, (req, res) => {
    req.user.avatarCrop = {
      x: Number(req.body.x || 0),
      y: Number(req.body.y || 0),
      scale: Number(req.body.scale || 1)
    };
    res.json({ user: publicUser(req.user) });
  });

  app.delete("/api/users/account", auth, (req, res) => {
    db.messages = db.messages.filter((message) => message.sender !== req.user._id && message.receiver !== req.user._id);
    db.requests = db.requests.filter((request) => request.from !== req.user._id && request.to !== req.user._id);
    db.users.forEach((user) => {
      user.friends = user.friends.filter((friendId) => friendId !== req.user._id);
    });
    db.users = db.users.filter((user) => user._id !== req.user._id);
    io.emit("user_deleted", { userId: req.user._id });
    res.json({ message: "Account deleted" });
  });

  app.post("/api/friends/request/:userId", auth, (req, res) => {
    const to = db.users.find((user) => user._id === req.params.userId);
    if (!to) return res.status(404).json({ message: "User not found" });
    if (to._id === req.user._id) return res.status(400).json({ message: "Cannot friend yourself" });
    if (req.user.friends.includes(to._id)) return res.status(409).json({ message: "Already friends" });

    const reverse = db.requests.find((request) => request.from === to._id && request.to === req.user._id && request.status === "pending");
    if (reverse) {
      reverse.status = "accepted";
      addFriends(req.user._id, to._id);
      io.to(to._id).emit("request_accepted", { by: publicUser(req.user), request: reverse });
      return res.json({ request: reverse, accepted: true });
    }

    let request = db.requests.find((item) => item.from === req.user._id && item.to === to._id);
    if (!request) {
      request = { _id: id(), from: req.user._id, to: to._id, status: "pending", createdAt: new Date().toISOString() };
      db.requests.push(request);
    } else {
      request.status = "pending";
    }
    io.to(to._id).emit("friend_request_received", { request });
    res.status(201).json({ request });
  });

  app.put("/api/friends/accept/:requestId", auth, (req, res) => {
    const request = db.requests.find((item) => item._id === req.params.requestId && item.to === req.user._id && item.status === "pending");
    if (!request) return res.status(404).json({ message: "Request not found" });
    request.status = "accepted";
    addFriends(request.from, request.to);
    io.to(request.from).emit("request_accepted", { by: publicUser(req.user), request });
    res.json({ request });
  });

  app.put("/api/friends/decline/:requestId", auth, (req, res) => {
    const request = db.requests.find((item) => item._id === req.params.requestId && item.to === req.user._id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    request.status = "declined";
    res.json({ request });
  });

  app.delete("/api/friends/cancel/:requestId", auth, (req, res) => {
    db.requests = db.requests.filter((request) => !(request._id === req.params.requestId && request.from === req.user._id));
    res.json({ message: "Request cancelled" });
  });

  app.delete("/api/friends/remove/:friendId", auth, (req, res) => {
    req.user.friends = req.user.friends.filter((friendId) => friendId !== req.params.friendId);
    const other = db.users.find((user) => user._id === req.params.friendId);
    if (other) other.friends = other.friends.filter((friendId) => friendId !== req.user._id);
    res.json({ message: "Friend removed" });
  });

  app.get("/api/friends/requests/incoming", auth, (req, res) => {
    res.json({ requests: db.requests.filter((request) => request.to === req.user._id && request.status === "pending") });
  });

  app.get("/api/friends/requests/outgoing", auth, (req, res) => {
    res.json({ requests: db.requests.filter((request) => request.from === req.user._id && request.status === "pending") });
  });

  app.get("/api/friends/list", auth, (req, res) => {
    res.json({ friends: db.users.filter((user) => req.user.friends.includes(user._id)).map(publicUser) });
  });

  app.get("/api/messages/:userId", auth, (req, res) => {
    if (!req.user.friends.includes(req.params.userId)) {
      return res.status(403).json({ message: "Messaging requires an accepted friend request" });
    }
    const messages = db.messages
      .filter(
        (message) =>
          (message.sender === req.user._id && message.receiver === req.params.userId) ||
          (message.sender === req.params.userId && message.receiver === req.user._id)
      )
      .map(hydrateMessage);
    res.json({ messages });
  });

  app.put("/api/messages/seen/:messageId", auth, (req, res) => {
    const message = db.messages.find((item) => item._id === req.params.messageId && item.receiver === req.user._id);
    if (!message) return res.status(404).json({ message: "Message not found" });
    message.seen = true;
    message.seenAt = new Date().toISOString();
    io.to(message.sender).emit("message_seen", { messageId: message._id, seenAt: message.seenAt });
    res.json({ message: hydrateMessage(message) });
  });

  app.delete("/api/messages/:messageId", auth, (req, res) => {
    db.messages = db.messages.filter((message) => !(message._id === req.params.messageId && message.sender === req.user._id));
    res.json({ message: "Message deleted" });
  });
}

function hydrateMessage(message) {
  return {
    ...message,
    sender: publicUser(db.users.find((user) => user._id === message.sender)),
    receiver: publicUser(db.users.find((user) => user._id === message.receiver))
  };
}

function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token, Deno.env.get("JWT_SECRET") || "connectly_dev_secret");
      const user = db.users.find((item) => item._id === decoded.id);
      if (!user) return next(new Error("User not found"));
      socket.user = user;
      socket.userId = user._id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    socket.join(user._id);
    user.isOnline = true;
    io.emit("user_online", { userId: user._id });

    socket.on("send_message", ({ to, content, type = "text" } = {}, callback) => {
      if (!to || !String(content || "").trim()) return callback?.({ ok: false, message: "Recipient and content are required" });
      if (!user.friends.includes(to)) return callback?.({ ok: false, message: "Messaging requires accepted friendship" });

      const message = {
        _id: id(),
        sender: user._id,
        receiver: to,
        content: String(content).trim(),
        type,
        delivered: true,
        seen: false,
        seenAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.messages.push(message);
      const hydrated = hydrateMessage(message);
      socket.emit("message_delivered", { messageId: message._id, message: hydrated });
      io.to(to).emit("new_message", hydrated);
      callback?.({ ok: true, message: hydrated });
    });

    socket.on("mark_seen", ({ messageId, fromUserId } = {}) => {
      const message = db.messages.find((item) => item._id === messageId && item.receiver === user._id);
      if (!message) return;
      message.seen = true;
      message.seenAt = new Date().toISOString();
      io.to(fromUserId || message.sender).emit("message_seen", { messageId: message._id, seenAt: message.seenAt });
    });

    socket.on("typing_start", ({ to } = {}) => to && io.to(to).emit("typing", { from: user._id }));
    socket.on("typing_stop", ({ to } = {}) => to && io.to(to).emit("stop_typing", { from: user._id }));

    socket.on("disconnect", () => {
      user.isOnline = false;
      user.lastSeen = new Date().toISOString();
      io.emit("user_offline", { userId: user._id, lastSeen: user.lastSeen });
    });
  });
}

export function enableMemoryMode(app, io) {
  registerApi(app, io);
  registerSockets(io);
}
