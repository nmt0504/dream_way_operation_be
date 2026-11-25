import type { CookieOptions, RequestHandler, Response } from 'express';

import { env } from '../../config/env';
import { REFRESH_TOKEN_TTL_MS } from '../../lib/tokens';
import { parse } from '../../lib/validation';
import { currentUser } from '../../middlewares/authenticate';
import { changePasswordBody, loginBody } from './auth.schemas';
import * as authService from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax',
  // only sent to /auth/refresh and /auth/logout
  path: '/api/v1/auth',
};

const sendTokens = (res: Response, tokens: authService.IssuedTokens) => {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
  res.json(authService.tokenResponse(tokens));
};

export const login: RequestHandler = async (req, res) => {
  const body = parse(loginBody, req.body);
  sendTokens(res, await authService.login(body.login, body.password));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    sendTokens(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE]));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
};

export const changePassword: RequestHandler = async (req, res) => {
  const body = parse(changePasswordBody, req.body);
  await authService.changePassword(currentUser(req).id, body.current_password, body.new_password);
  res.status(204).end();
};
