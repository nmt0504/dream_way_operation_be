import type { RequestHandler } from 'express';

import { paginationQuery } from '../../lib/pagination';
import { idParams, parse } from '../../lib/validation';
import { currentUser } from '../../middlewares/authenticate';
import {
  createUserBody,
  resetPasswordBody,
  setBranchesBody,
  updateUserBody,
} from './users.schemas';
import * as usersService from './users.service';

export const list: RequestHandler = async (req, res) => {
  res.json(await usersService.listUsers(parse(paginationQuery, req.query)));
};

export const create: RequestHandler = async (req, res) => {
  const body = parse(createUserBody, req.body);
  res.status(201).json({ data: await usersService.createUser(currentUser(req).id, body) });
};

export const update: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateUserBody, req.body);
  res.json({ data: await usersService.updateUser(currentUser(req).id, id, body) });
};

export const getBranches: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json({ data: await usersService.getUserBranches(id) });
};

export const setBranches: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(setBranchesBody, req.body);
  res.json({ data: await usersService.setUserBranches(currentUser(req).id, id, body.branch_ids) });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(resetPasswordBody, req.body);
  await usersService.resetPassword(currentUser(req).id, id, body.password);
  res.status(204).end();
};
