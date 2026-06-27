import mongoose from "npm:mongoose";

const MessageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ["text", "emoji"], default: "text" },
    delivered: { type: Boolean, default: false },
    seen: { type: Boolean, default: false },
    seenAt: { type: Date }
  },
  { timestamps: true }
);

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

export default mongoose.model("Message", MessageSchema);
