import { sql } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '../../db';
import { type CenterSettings, settings } from '../../db/schema';
import type { updateSettingsBody } from './settings.schemas';

type SettingsRow = typeof settings.$inferSelect;

const toDto = (s: SettingsRow) => ({
  center_name: s.centerName,
  logo_url: s.settings.logo_url ?? null,
  address: s.settings.address ?? null,
  revenue_target: s.settings.revenue_target ?? null,
  updated_at: s.updatedAt,
});

// core.settings always has exactly one row (inserted by the core_functions migration)
export async function getSettings() {
  const [row] = await db.select().from(settings);
  if (!row) throw new Error('core.settings row is missing');
  return toDto(row);
}

export async function updateSettings(body: z.infer<typeof updateSettingsBody>) {
  const { center_name, ...rest } = body;
  const patch: CenterSettings = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );

  const [row] = await db
    .update(settings)
    .set({
      centerName: center_name,
      // shallow merge so keys owned by later phases (reminder...) are kept
      settings: sql`${settings.settings} || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('core.settings row is missing');
  return toDto(row);
}
