import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IUser {
  email: string;
  name?: string;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDoc extends IUser, Document {
  _id: mongoose.Types.ObjectId;
}

const UserSchema = new Schema<IUserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // Unique index on email for O(1) user lookups and auth uniqueness
    },
    name: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index: email (unique) - Enforces single account per email and O(1) lookups during login/signup

export const User: Model<IUserDoc> =
  mongoose.models.User || mongoose.model<IUserDoc>('User', UserSchema);
