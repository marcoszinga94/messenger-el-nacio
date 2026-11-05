import { z } from 'zod';
import {
  DISPLAY_NAME_MAX,
  GROUP_NAME_MAX,
  GROUP_TOPIC_MAX,
  MESSAGE_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  STATUS_MESSAGE_MAX,
  USERNAME_RE,
} from './constants.js';

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_RE, 'Usá entre 3 y 20 letras, números, puntos, guiones o guión bajo.');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `La contraseña necesita al menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, 'La contraseña es demasiado larga.');

export const registerSchema = z.object({
  code: z.string().trim().min(1, 'Falta el código de invitación.').max(64),
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  avatar: z.string().max(16).optional(),
  statusMessage: z.string().max(STATUS_MESSAGE_MAX).optional(),
  status: z.enum(['online', 'away', 'busy', 'invisible']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});

export const contactRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
});

export const dmSchema = z.object({
  userId: z.string().min(1),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX),
  topic: z.string().trim().max(GROUP_TOPIC_MAX).optional().default(''),
  memberIds: z.array(z.string().min(1)).max(200).optional().default([]),
});

export const addMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(200),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'El mensaje está vacío.').max(MESSAGE_MAX, 'El mensaje es demasiado largo.'),
});

export const nudgeSchema = z.object({
  conversationId: z.string().min(1),
});

export const inviteSchema = z.object({
  course: z.string().trim().max(60).optional().default(''),
  maxUses: z.number().int().min(1).max(500).optional().default(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional().default(30),
});

export const adminUserPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  banned: z.boolean().optional(),
  role: z.enum(['student', 'admin']).optional(),
});

export const settingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650).optional(),
  registrationEnabled: z.boolean().optional(),
  maxGroupSize: z.number().int().min(2).max(200).optional(),
  appName: z.string().trim().min(1).max(60).optional(),
});
