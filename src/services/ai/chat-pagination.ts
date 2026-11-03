import { ObjectId } from 'mongodb';
import { z } from 'zod';

export const PageRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(40),
  before: z.string().max(256).optional(),
});
export function decodeCursor(value: string) {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Invalid chat cursor');
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      !/^[a-f\d]{24}$/.test(cursor.id) ||
      typeof cursor.date !== 'string' ||
      !Number.isFinite(Date.parse(cursor.date)) ||
      new Date(cursor.date).toISOString() !== cursor.date
    )
      throw new Error();
    return { id: new ObjectId(cursor.id), date: new Date(cursor.date) };
  } catch {
    throw new Error('Invalid chat cursor');
  }
}
export function encodeCursor(id: ObjectId, date: Date) {
  return Buffer.from(
    JSON.stringify({ id: id.toHexString(), date: date.toISOString() })
  ).toString('base64url');
}
