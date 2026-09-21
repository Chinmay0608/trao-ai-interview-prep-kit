import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUserDoc } from '../db/models/User.js';

export interface UserDto {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: UserDto;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthenticationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'trao_dev_jwt_secret_minimum_32_characters_long_12345';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Normalizes email address deterministically.
 */
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Converts a User document to a sanitized client DTO.
 * Guaranteed to NEVER leak passwordHash or Mongo connection internals.
 */
export function toUserDto(user: IUserDoc): UserDto {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Signs a JWT token containing the user identity.
 */
export function signAuthToken(user: IUserDoc): string {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

/**
 * Verifies a JWT token and extracts the decoded payload.
 */
export function verifyAuthToken(token: string): { userId: string; email: string } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    if (!decoded || !decoded.userId) {
      throw new AuthenticationError('INVALID_TOKEN', 'Token payload is missing user identity.');
    }
    return decoded;
  } catch (err: any) {
    if (err instanceof AuthenticationError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AuthenticationError('TOKEN_EXPIRED', 'Authentication token has expired.');
    }
    throw new AuthenticationError('INVALID_TOKEN', 'Authentication token is invalid.');
  }
}

/**
 * Register a new user account with hashed password.
 */
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!email || !email.includes('@')) {
    throw new AuthenticationError('INVALID_EMAIL', 'A valid email address is required.');
  }
  if (!password || password.length < 8) {
    throw new AuthenticationError('WEAK_PASSWORD', 'Password must be at least 8 characters.');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AuthenticationError('USER_EXISTS', 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    name: input.name?.trim(),
    passwordHash,
  });

  const token = signAuthToken(user);
  return {
    token,
    user: toUserDto(user),
  };
}

/**
 * Authenticates user credentials and returns signed session token.
 */
export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const password = input.password || '';

  const user = await User.findOne({ email });
  if (!user || !user.passwordHash) {
    // Generic error to prevent account enumeration
    throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const token = signAuthToken(user);
  return {
    token,
    user: toUserDto(user),
  };
}
