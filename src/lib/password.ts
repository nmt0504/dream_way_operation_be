import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(128);

export const hashPassword = (password: string) => hash(password);

export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password).catch(() => false);
