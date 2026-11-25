# Quy ước chung

Làm một lần ở [phase 0](./phase-0-nen-tang.md), mọi endpoint sau dùng lại. Mục đánh dấu _(đề xuất)_ là chi tiết tài liệu gốc chưa ghi, cần team xác nhận trước khi code.

## Vai trò và ký hiệu quyền

| Ký hiệu        | Nghĩa                                                     |
| -------------- | --------------------------------------------------------- |
| A              | Admin                                                     |
| NV             | Nhân viên                                                 |
| GV             | Giáo viên                                                 |
| GV*            | Giáo viên, chỉ với lớp mình phụ trách                     |
| GV**           | Giáo viên, với lớp mình phụ trách hoặc buổi mình dạy thay |
| Chưa đăng nhập | Không cần token                                           |

Phụ huynh không có tài khoản trong Phần 1.

## Xác thực

- Access token 15 phút; refresh token 30 ngày trong cookie httpOnly.
- `POST /auth/refresh` cấp access token mới; `POST /auth/logout` thu hồi refresh token.
- Tài khoản mới hoặc vừa bị đặt lại mật khẩu phải gọi `POST /auth/password` trước khi dùng các endpoint khác.

## Phân quyền ba bước

1. **Mã quyền theo vai trò:** vai trò không có quyền → `403`.
2. **Phạm vi cơ sở** qua `user_branches`: truyền `branch_id` không được gán → `403`. Bản ghi thuộc cơ sở không được gán (ví dụ học viên, qua `can_see_student()`) → `404` như không tồn tại.
3. **Ẩn trường theo vai trò:** GV không nhận số điện thoại, thông tin học phí, doanh thu, lương; NV không nhận doanh thu trên `/dashboard`.

## Định dạng lỗi

```json
{
  "error": {
    "code": "PAYMENT_EXCEEDS_BALANCE",
    "message": "Vượt số còn thiếu 700.000đ. Nhập tối đa 700.000đ.",
    "field": "amount"
  }
}
```

- `code`: hằng số viết hoa, ổn định, frontend dùng để rẽ nhánh. Lỗi constraint DB được đổi sang `code` qua một bảng ánh xạ tên constraint → code.
- `message`: tiếng Việt, nói cách sửa; frontend có thể hiện thẳng.
- `field`: tên trường gây lỗi (nếu có) để frontend báo ngay tại ô nhập.

HTTP status _(đề xuất)_: `400` dữ liệu sai dạng · `401` chưa đăng nhập hoặc token hết hạn · `403` không có quyền · `404` không tồn tại hoặc không được xem · `409` vi phạm quy tắc nghiệp vụ (mọi `code` trong các file phase) · `422` dữ liệu hợp lệ về dạng nhưng sai nghiệp vụ ở một trường · `423` tài khoản bị khóa tạm.

## Cảnh báo mềm

Thao tác vẫn thành công nhưng có điều cần người dùng biết (trùng phòng, buổi đã sửa tay không được sinh lại…): trả `200/201` kèm

```json
{
  "data": {},
  "warnings": [{ "code": "ROOM_CONFLICT", "message": "Trùng phòng P.101 với Toán 8B 08:00–09:30" }]
}
```

## Phân trang

Endpoint danh sách nhận `page` (từ 1) và `page_size` _(đề xuất mặc định 20, tối đa 100)_, trả

```json
{ "data": [], "meta": { "page": 1, "page_size": 20, "total": 214 } }
```

## Chống ghi trùng

Endpoint ghi quan trọng (`PUT /sessions/{id}/attendance`, `POST /invoices/{id}/payments`, và nên áp cho mọi `POST` tạo bản ghi) nhận header `Idempotency-Key`. Gửi lại cùng key trong 24 giờ _(đề xuất)_ trả lại đúng kết quả lần đầu, không ghi thêm.

## Lọc theo cơ sở

Endpoint danh sách nhận `?branch_id=`. Không truyền thì lấy mọi cơ sở người dùng được gán. Truyền cơ sở không được gán → `403`.

## Định dạng dữ liệu _(đề xuất)_

| Loại                      | Định dạng trong API                    | Ví dụ                    |
| ------------------------- | -------------------------------------- | ------------------------ |
| Tiền                      | Số nguyên VND, không thập phân         | `3200000`                |
| Ngày                      | ISO `YYYY-MM-DD`                       | `2026-11-24`             |
| Thời điểm                 | ISO 8601 có múi giờ, lưu UTC           | `2026-11-24T10:30:00Z`   |
| Tháng (kỳ lương, báo cáo) | `YYYY-MM`                              | `2026-10`                |
| Số điện thoại             | Chỉ chữ số, 10 số                      | `0912445118`             |
| Mã                        | Tiền tố + số, cấp qua `code_sequences` | `HV-0142`, `HD-2611-003` |

Frontend tự định dạng hiển thị (`3.200.000đ`, `24/11/2026`, `0912 445 118`) theo brand book của DreamWay Design System.

## Nhật ký thao tác

Trigger DB ghi `audit_logs` cho các thao tác nhạy cảm (đổi vai trò, đặt lại mật khẩu, sửa điểm danh sau khi lưu, hủy phiếu thu, duyệt hoặc mở lại kỳ lương). API không ghi thêm.
