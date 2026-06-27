import http from "node:http";
import path from "node:path";
import cors from "npm:cors";
import express from "npm:express";
import helmet from "npm:helmet";
import { Server } from "npm:socket.io";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import friendRoutes from "./routes/friends.js";
import messageRoutes from "./routes/messages.js";
import userRoutes from "./routes/users.js";
import { enableMemoryMode } from "./memory/memoryApp.js";
import { registerSocketHandlers } from "./socket/socketHandler.js";

const MONGO_URI = Deno.env.get("MONGO_URI");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const PORT = Number(Deno.env.get("PORT")) || 8000;
const clientUrl = Deno.env.get("CLIENT_URL") || "http://localhost:5173";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    credentials: true
  }
});

app.set("io", io);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/", (req, res) => {
  res.json({
    message: "Backend is running successfully"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", name: "connectly-server" });
});

const memoryMode = !MONGO_URI || MONGO_URI === "memory";

if (memoryMode) {
  console.warn("Connectly running in in-memory development mode. Data resets when the server stops.");
  enableMemoryMode(app, io);
} else {
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/friends", friendRoutes);
  app.use("/api/messages", messageRoutes);
  registerSocketHandlers(io);
}

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || "Server error" });
});

const start = async () => {
  if (!memoryMode) {
    await connectDB(MONGO_URI);
  }

  server.listen(PORT, () => {
    console.log(`Connectly API listening on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  Deno.exit(1);
});
