# Phase 2 – Buổi học và điểm danh

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| Đợt release    | 1                                                      |
| Cần xong trước | Phase 1                                                |
| Endpoint       | 12 (bỏ 1, thêm 1)                                      |
| Job / webhook  | 1 job                                                  |
| Màn hình       | Trang "Phase 2 – Buổi học và điểm danh" trên canvas UI |

Đưa việc điểm danh hằng ngày lên hệ thống. Giáo viên làm việc này mỗi ngày, nên cần nhanh và ổn định: lưu điểm danh cả lớp dưới 30 giây.

## Endpoint

| Method | Path                               | Mô tả                                                                                                                              | Quyền       | Ghi chú                                 |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------- |
| GET    | `/sessions`                        | Lịch theo khoảng ngày, lọc lớp, giáo viên, phòng, cơ sở                                                                            | A, NV, GV** |                                         |
| GET    | `/sessions/today`                  | Các buổi học hôm nay                                                                                                               | A, NV, GV** | Dùng cho Tổng quan rút gọn ở đợt 1      |
| POST   | `/sessions/check-conflicts`        | Kiểm tra trùng phòng, trùng giáo viên (SCH-06)                                                                                     | A, NV       |                                         |
| POST   | `/sessions`                        | Thêm buổi bù hoặc buổi lẻ; đặt `is_manual = true`                                                                                  | A, NV       | Trùng phòng: trả `warnings[]`, vẫn lưu  |
| PATCH  | `/sessions/{id}`                   | Đổi giờ, phòng, gán giáo viên dạy thay; đặt `is_manual = true`                                                                     | A, NV       |                                         |
| POST   | `/sessions/{id}/cancel`            | Hủy buổi, bắt buộc lý do                                                                                                           | A, NV       |                                         |
| POST   | `/sessions/bulk-cancel`            | Hủy mọi buổi trong khoảng ngày theo cơ sở hoặc danh sách lớp, bắt buộc lý do; trả số buổi đã hủy và số buổi bỏ qua vì đã điểm danh | A, NV       | **Mới [ĐC-2]**                          |
| GET    | `/sessions/{id}/attendance`        | Danh sách điểm danh, mặc định có mặt; kèm ngữ cảnh từng học viên (tỷ lệ chuyên cần, số buổi vắng trong tháng) – ATT-05             | A, NV, GV** | Cờ nợ học phí thêm ở phase 3, ẩn với GV |
| PUT    | `/sessions/{id}/attendance`        | Lưu điểm danh cả lớp một lần, có `Idempotency-Key`                                                                                 | A, NV, GV** |                                         |
| PATCH  | `/attendance-records/{id}`         | Sửa một dòng sau khi lưu; GV chỉ trong 24 giờ                                                                                      | A, NV, GV** |                                         |
| GET    | `/students/{id}/attendance`        | Lịch sử điểm danh và chuyên cần                                                                                                    | A, NV, GV*  |                                         |
| GET    | `/classes/{id}/attendance-summary` | Chuyên cần từng học viên trong lớp (ATT-08)                                                                                        | A, NV, GV*  |                                         |

`PATCH /sessions/{id}/reminder` của tài liệu gốc đã chuyển sang [phase 5](./phase-5-nhac-lich-lms.md). **[ĐC-10]**

## Job

| Job                 | Lịch chạy       | Làm gì                                                                                                               |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `generate-sessions` | 01:00 hằng ngày | Sinh buổi học 4 tuần tới từ lịch cố định; chạy lại không sinh trùng. Lần chạy đầu sinh cho mọi lớp đã tạo ở phase 1. |

## Sửa lịch cố định khi đã có buổi sinh sẵn [ĐC-1]

Job sinh trước 4 tuần, nên `PATCH` và `DELETE /schedules/{id}` (phase 1) phải xử lý các buổi đã sinh:

- Buổi tương lai, chưa điểm danh, `is_manual = false`: sinh lại theo ca mới (PATCH) hoặc hủy (DELETE) trong cùng transaction.
- Buổi đã sửa tay (`is_manual = true`) hoặc đã điểm danh: giữ nguyên, trả danh sách trong `warnings[]`.

Cần thêm cột `sessions.is_manual`.

## Quy tắc nghiệp vụ và mã lỗi

| Quy tắc                                                                                               | Mã lỗi                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| Vắng bắt buộc chọn có phép hoặc không phép                                                            | `ATTENDANCE_EXCUSE_REQUIRED` |
| Chỉ điểm danh từ 15 phút trước giờ học (kiểm tra ở API)                                               | `ATTENDANCE_NOT_OPEN`        |
| Giáo viên chỉ sửa trong 24 giờ sau khi lưu (kiểm tra ở API)                                           | `ATTENDANCE_EDIT_EXPIRED`    |
| Buổi thuộc kỳ lương đã duyệt: không sửa điểm danh, không thêm, sửa, hủy buổi (có hiệu lực từ phase 4) | `PAYROLL_LOCKED` **[ĐC-8]**  |
| Phòng của buổi phải cùng cơ sở với lớp                                                                | `ROOM_NOT_IN_BRANCH`         |

Sửa điểm danh sau khi lưu được trigger tự ghi vào `audit_logs`, API không cần ghi thêm.

## Bảng và view DB

`sessions` (thêm `is_manual`), `attendance_records`, `audit_logs`, view `v_sessions`, view `v_enrollment_attendance`.

Công thức chuyên cần trong `v_enrollment_attendance` chờ business chốt (Trễ có tính có mặt không, Vắng có phép có bị trừ không).

## Xong phase khi

- [ ] Job chạy hai lần liên tiếp không sinh buổi trùng
- [ ] Đổi giờ lịch cố định thì các buổi tương lai đổi theo, buổi đã sửa tay giữ nguyên
- [ ] Hủy hàng loạt nghỉ Tết cho cả cơ sở trong một lệnh gọi
- [ ] Giáo viên điểm danh một lớp 20 học viên trên điện thoại dưới 30 giây
- [ ] Chọn Vắng mà thiếu có phép / không phép thì không lưu được
- [ ] Giáo viên dạy thay điểm danh được buổi mình dạy dù không phụ trách lớp
- [ ] Thêm buổi bù trùng phòng thì nhận cảnh báo nhưng vẫn lưu được
- [ ] Bấm lưu điểm danh hai lần do mạng chậm chỉ ghi một lần
