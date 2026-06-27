import mongoose from "npm:mongoose";

const FriendRequestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending"
    }
  },
  { timestamps: true }
);

FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

export default mongoose.model("FriendRequest", FriendRequestSchema);
