import type { RequestHandler } from 'express';

import { branchScope } from '../../lib/branch-scope';
import { paginationQuery } from '../../lib/pagination';
import { idParams, parse } from '../../lib/validation';
import { currentUser } from '../../middlewares/authenticate';
import { createBranchBody, updateBranchBody } from './branches.schemas';
import * as branchesService from './branches.service';

export const list: RequestHandler = async (req, res) => {
  const p = parse(paginationQuery, req.query);
  res.json(await branchesService.listBranches(branchScope(currentUser(req)), p));
};

export const create: RequestHandler = async (req, res) => {
  const body = parse(createBranchBody, req.body);
  res.status(201).json({ data: await branchesService.createBranch(body) });
};

export const update: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateBranchBody, req.body);
  res.json({ data: await branchesService.updateBranch(id, body) });
};
