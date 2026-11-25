import { DatabaseError } from 'pg';

import { AppError } from './app-error';

type Mapped = { status: number; code: string; message: string; field?: string };

// Constraint name -> API error. Names must match the DB (drizzle names FKs <table>_<col>_<ref>_<col>_fkey).
const byConstraint: Record<string, Mapped> = {
  users_phone_key: {
    status: 409,
    code: 'PHONE_TAKEN',
    message: 'Số điện thoại đã được dùng cho tài khoản khác',
    field: 'phone',
  },
  users_username_key: {
    status: 409,
    code: 'USERNAME_TAKEN',
    message: 'Tên đăng nhập đã được dùng cho tài khoản khác',
    field: 'username',
  },
  teachers_user_id_key: {
    status: 409,
    code: 'TEACHER_HAS_ACCOUNT',
    message: 'Giáo viên này đã có tài khoản',
    field: 'teacher_id',
  },
  rooms_branch_id_name_key: {
    status: 409,
    code: 'ROOM_NAME_TAKEN',
    message: 'Cơ sở này đã có phòng cùng tên',
    field: 'name',
  },
  rooms_branch_id_branches_id_fkey: {
    status: 422,
    code: 'BRANCH_NOT_FOUND',
    message: 'Cơ sở không tồn tại',
    field: 'branch_id',
  },
  user_branches_branch_id_branches_id_fkey: {
    status: 422,
    code: 'BRANCH_NOT_FOUND',
    message: 'Có cơ sở không tồn tại',
    field: 'branch_ids',
  },
};

// Fallback by SQLSTATE when the constraint is not in the table above
const byCode: Record<string, Mapped> = {
  '23505': { status: 409, code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' },
  '23503': { status: 422, code: 'REFERENCE_NOT_FOUND', message: 'Dữ liệu liên quan không tồn tại' },
  '23514': { status: 400, code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ' },
  '23502': { status: 400, code: 'VALIDATION_ERROR', message: 'Thiếu dữ liệu bắt buộc' },
  '22P02': { status: 400, code: 'VALIDATION_ERROR', message: 'Dữ liệu sai định dạng' },
};

// Drizzle wraps driver errors (DrizzleQueryError.cause), so walk the cause chain.
function findPgError(err: unknown): DatabaseError | undefined {
  for (let e = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if (e instanceof DatabaseError) return e;
  }
  return undefined;
}

export function mapPgError(err: unknown): AppError | undefined {
  const pg = findPgError(err);
  if (!pg) return undefined;

  const known = (pg.constraint && byConstraint[pg.constraint]) || (pg.code && byCode[pg.code]);
  if (known) return new AppError(known.status, known.code, known.message, known.field);

  // RAISE EXCEPTION in our triggers: the message is already Vietnamese and user-facing
  if (pg.code === 'P0001') return new AppError(409, 'BUSINESS_RULE_VIOLATION', pg.message);
  return undefined;
}
