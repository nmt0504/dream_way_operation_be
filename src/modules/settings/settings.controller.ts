import type { RequestHandler } from 'express';

import { parse } from '../../lib/validation';
import { updateSettingsBody } from './settings.schemas';
import * as settingsService from './settings.service';

export const get: RequestHandler = async (_req, res) => {
  res.json({ data: await settingsService.getSettings() });
};

export const update: RequestHandler = async (req, res) => {
  const body = parse(updateSettingsBody, req.body);
  res.json({ data: await settingsService.updateSettings(body) });
};
