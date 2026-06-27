import mongoose from "npm:mongoose";
import User from "../models/User.js";

export function objectId(id) {
  return new mongoose.Types.ObjectId(id);
}

export async function areFriends(userId, otherId) {
  const user = await User.exists({ _id: userId, friends: objectId(otherId) });
  return Boolean(user);
}

export async function addMutualFriends(a, b) {
  await User.bulkWrite([
    { updateOne: { filter: { _id: a }, update: { $addToSet: { friends: b } } } },
    { updateOne: { filter: { _id: b }, update: { $addToSet: { friends: a } } } }
  ]);
}

export async function removeMutualFriends(a, b) {
  await User.bulkWrite([
    { updateOne: { filter: { _id: a }, update: { $pull: { friends: b } } } },
    { updateOne: { filter: { _id: b }, update: { $pull: { friends: a } } } }
  ]);
}
