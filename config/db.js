import mongoose from "npm:mongoose";

export async function connectDB(uri = Deno.env.get("MONGO_URI")) {
  if (!uri) {
    throw new Error("MONGO_URI is required");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected");
}
