# Phase 0 – Nền tảng

|                |                                           |
| -------------- | ----------------------------------------- |
| Đợt release    | 1 (cùng phase 1, 2)                       |
| Cần xong trước | Không                                     |
| Endpoint       | 20                                        |
| Job / webhook  | 0                                         |
| Màn hình       | Trang "Phase 0 – Nền tảng" trên canvas UI |

Dựng đăng nhập, phân quyền và toàn bộ quy ước trong [conventions.md](./conventions.md). Mọi phase sau dùng lại phần này; làm sai ở đây thì phase sau phải sửa theo, nên đây là phase cần review kỹ nhất.

## Việc cần xong trước khi viết endpoint

- Middleware xác thực: access token 15 phút, refresh token 30 ngày trong cookie httpOnly.
- Middleware phân quyền ba bước: mã quyền theo vai trò → phạm vi cơ sở qua `user_branches` → ẩn trường theo vai trò.
- Định dạng lỗi, bảng đổi tên constraint DB sang `error.code`, phân trang, `warnings[]`, `Idempotency-Key`, `?branch_id=` (xem conventions).
- Bảng `audit_logs` và trigger ghi nhật ký. **[ĐC-9]**

## Endpoint

| Method | Path                         | Mô tả                                                                    | Quyền          | Ghi chú                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------- |
| POST   | `/auth/login`                | Đăng nhập bằng số điện thoại và mật khẩu; khóa tạm 15 phút sau 5 lần sai | Chưa đăng nhập |                                                             |
| POST   | `/auth/refresh`              | Cấp access token mới                                                     | A, NV, GV      |                                                             |
| POST   | `/auth/logout`               | Thu hồi refresh token                                                    | A, NV, GV      |                                                             |
| POST   | `/auth/password`             | Đổi mật khẩu; bắt buộc ở lần đầu và sau khi được đặt lại                 | A, NV, GV      |                                                             |
| GET    | `/me`                        | Vai trò, cơ sở được gán, `teacher_id`, lớp phụ trách, danh sách mã quyền | A, NV, GV      | Trả `teacher_id` **[ĐC-3]**                                 |
| GET    | `/roles`                     | Ba vai trò và mã quyền của từng vai trò                                  | A              |                                                             |
| GET    | `/users`                     | Danh sách tài khoản                                                      | A              |                                                             |
| POST   | `/users`                     | Tạo tài khoản, gán vai trò, mật khẩu tạm                                 | A              | Nhận `teacher_id` **[ĐC-3]**                                |
| PATCH  | `/users/{id}`                | Đổi tên, vai trò, khóa hoặc mở                                           | A              | Nhận `teacher_id` **[ĐC-3]**                                |
| GET    | `/users/{id}/branches`       | Các cơ sở của một người dùng                                             | A              |                                                             |
| PUT    | `/users/{id}/branches`       | Gán cơ sở (`branch_ids[]`)                                               | A              |                                                             |
| POST   | `/users/{id}/reset-password` | Đặt mật khẩu tạm                                                         | A              |                                                             |
| GET    | `/settings`                  | Cài đặt trung tâm: tên, logo, địa chỉ, mục tiêu doanh thu                | A              | Khung app cần tên và logo                                   |
| PATCH  | `/settings`                  | Sửa cài đặt trung tâm                                                    | A              | Trường kênh nhắc và giờ gửi chỉ dùng từ phase 5 **[ĐC-10]** |
| GET    | `/branches`                  | Danh sách cơ sở                                                          | A, NV, GV      |                                                             |
| POST   | `/branches`                  | Thêm cơ sở                                                               | A              |                                                             |
| PATCH  | `/branches/{id}`             | Sửa cơ sở                                                                | A              |                                                             |
| GET    | `/rooms`                     | Danh sách phòng theo cơ sở                                               | A, NV, GV      |                                                             |
| POST   | `/rooms`                     | Thêm phòng                                                               | A              |                                                             |
| PATCH  | `/rooms/{id}`                | Sửa phòng                                                                | A              |                                                             |

## Quy tắc nghiệp vụ

| Quy tắc                                           | Xử lý                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Một giáo viên tối đa một tài khoản                | Unique `users.teacher_id`; trùng → `409 TEACHER_HAS_ACCOUNT` (mã mới) **[ĐC-3]**                     |
| Tài khoản mới hoặc vừa bị đặt lại mật khẩu        | Mọi endpoint trừ `/auth/password`, `/auth/logout`, `/me` trả `403 PASSWORD_CHANGE_REQUIRED` (mã mới) |
| Sai mật khẩu 5 lần                                | Khóa 15 phút → `423 ACCOUNT_LOCKED` (mã mới) kèm thời điểm mở khóa                                   |
| Đổi vai trò, khóa/mở, đặt lại mật khẩu, gán cơ sở | Ghi một dòng `audit_logs` **[ĐC-9]**                                                                 |

## Bảng DB

`settings`, `branches`, `rooms`, `users`, `user_branches`, `audit_logs`.

## Xong phase khi

- [ ] Admin đăng nhập, bị bắt đổi mật khẩu ở lần đầu
- [ ] Sai mật khẩu 5 lần thì tài khoản bị khóa tạm
- [ ] Admin tạo được 2 cơ sở, phòng cho từng cơ sở, và tài khoản nhân viên gán vào một cơ sở
- [ ] Nhân viên gọi endpoint chỉ dành cho Admin thì nhận 403
- [ ] Nhân viên truyền `branch_id` của cơ sở không được gán thì nhận 403
- [ ] Đổi vai trò một tài khoản sinh một dòng nhật ký
