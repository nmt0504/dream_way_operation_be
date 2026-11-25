# Phase 5 – Nhắc lịch và LMS

|                |                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Đợt release    | 4                                                                                                |
| Cần xong trước | Phase 2 và quyết định của business (nhắc lịch); trang đăng nhập của Phần 2 – LMS (tài khoản LMS) |
| Endpoint       | 3                                                                                                |
| Job / webhook  | 2 job + 2 webhook (chỉ làm webhook của nhà cung cấp được chọn)                                   |
| Màn hình       | Trang "Phase 5 – Nhắc lịch và LMS" trên canvas UI                                                |

Nối hệ thống ra bên ngoài. Hai nhánh độc lập; nhánh nào được business chốt trước thì làm trước.

## Nhánh A – Nhắc lịch

| Method | Path                      | Mô tả                               | Quyền | Ghi chú                       |
| ------ | ------------------------- | ----------------------------------- | ----- | ----------------------------- |
| PATCH  | `/sessions/{id}/reminder` | Bật hoặc tắt nhắc lịch cho một buổi | A, NV | Chuyển từ phase 2 **[ĐC-10]** |
| GET    | `/reminders`              | Tin nhắc đã gửi và gửi lỗi (SCH-07) | A, NV |                               |

`PATCH /settings` (phase 0) bắt đầu dùng các trường kênh nhắc và thời điểm gửi từ phase này.

| Tên                   | Loại                | Làm gì                                                                           |
| --------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `enqueue-reminders`   | Job, 5 phút một lần | Xếp tin nhắc cho buổi sắp tới; bỏ qua buổi đã tắt nhắc hoặc đã hủy               |
| `send-reminders`      | Worker              | Gửi tin qua Zalo OA hoặc SMS; thử lại tối đa 2 lần, cách nhau 5 phút **[ĐC-11]** |
| `POST /webhooks/zalo` | Webhook             | Nhận trạng thái gửi tin từ Zalo OA                                               |
| `POST /webhooks/sms`  | Webhook             | Nhận trạng thái gửi tin từ nhà cung cấp SMS                                      |

Người nhận: số phụ huynh chính; không có thì số học viên. Bỏ qua học viên đã nghỉ hoặc đang bảo lưu.

## Nhánh B – Tài khoản LMS

| Method | Path                         | Mô tả                                                       | Quyền | Ghi chú |
| ------ | ---------------------------- | ----------------------------------------------------------- | ----- | ------- |
| POST   | `/students/{id}/lms-account` | Tạo tài khoản LMS: tên đăng nhập là mã HV, kèm mật khẩu tạm | A, NV |         |

Hồ sơ học viên gọi API nội bộ `GET /internal/lms/students/{id}/homework-summary` của module LMS để hiện tóm tắt bài tập (STU-05).

## Bảng DB

`reminder_messages`, `users`, `settings`.

## Chờ business chốt trước khi làm

- Gửi nhắc lịch qua Zalo OA hay SMS brandname: quyết định nhà cung cấp cho `send-reminders` và webhook nào được làm.
- Số lần thử lại (đề xuất 2 lần, cách 5 phút như đặc tả).
- Dùng mã học viên làm tên đăng nhập LMS.
- Trang LMS cần có trước thì tài khoản LMS mới dùng được.

## Xong phase khi

- [ ] Phụ huynh nhận tin nhắc đúng giờ đã cài; buổi bị hủy hoặc đã tắt nhắc thì không nhận
- [ ] Tin gửi lỗi được thử lại và hiện trong `/reminders`
- [ ] Học viên đăng nhập được trang LMS bằng tài khoản vừa cấp
