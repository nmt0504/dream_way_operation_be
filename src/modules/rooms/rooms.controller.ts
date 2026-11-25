import type { RequestHandler } from 'express';

import { branchScope } from '../../lib/branch-scope';
import { idParams, parse } from '../../lib/validation';
import { currentUser } from '../../middlewares/authenticate';
import { createRoomBody, listRoomsQuery, updateRoomBody } from './rooms.schemas';
import * as roomsService from './rooms.service';

export const list: RequestHandler = async (req, res) => {
  const { branch_id, ...p } = parse(listRoomsQuery, req.query);
  res.json(await roomsService.listRooms(branchScope(currentUser(req), branch_id), p));
};

export const create: RequestHandler = async (req, res) => {
  const body = parse(createRoomBody, req.body);
  res.status(201).json({ data: await roomsService.createRoom(body) });
};

export const update: RequestHandler = async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateRoomBody, req.body);
  res.json({ data: await roomsService.updateRoom(id, body) });
};
