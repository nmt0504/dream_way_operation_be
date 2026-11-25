# Phase 3 – Học phí

|                |                                              |
| -------------- | -------------------------------------------- |
| Đợt release    | 2 (release riêng, không chờ lương)           |
| Cần xong trước | Phase 1. Làm song song với phase 2 được      |
| Endpoint       | 11                                           |
| Job / webhook  | 2 job + 1 script chuyển dữ liệu chạy một lần |
| Màn hình       | Trang "Phase 3 – Học phí" trên canvas UI     |

Đưa việc thu học phí lên hệ thống.

> **Chặn trước khi code:** business phải chốt "kỳ" học phí là tháng hay khóa, và ngày hạn đóng mặc định. Xem [README › Cần business chốt](./README.md#cần-business-chốt).

## Endpoint

| Method | Path                      | Mô tả                                                                         | Quyền | Ghi chú |
| ------ | ------------------------- | ----------------------------------------------------------------------------- | ----- | ------- |
| GET    | `/invoices`               | Danh sách hóa đơn xếp theo mức cần xử lý, lọc trạng thái, lớp, cơ sở (FEE-03) | A, NV |         |
| GET    | `/invoices/summary`       | Số lượng và tổng tiền theo từng trạng thái                                    | A, NV |         |
| POST   | `/invoices`               | Tạo hóa đơn thủ công, tự cấp mã HD                                            | A, NV |         |
| GET    | `/invoices/{id}`          | Chi tiết hóa đơn kèm các lần thu                                              | A, NV |         |
| PATCH  | `/invoices/{id}`          | Sửa hạn đóng, ghi chú                                                         | A, NV |         |
| POST   | `/invoices/{id}/cancel`   | Hủy hóa đơn chưa thu đồng nào, bắt buộc lý do                                 | A     |         |
| POST   | `/invoices/{id}/payments` | Ghi nhận thu tiền, đóng từng phần, có `Idempotency-Key`                       | A, NV |         |
| POST   | `/payments/{id}/void`     | Hủy phiếu thu, bắt buộc lý do                                                 | A     |         |
| GET    | `/payments/{id}/receipt`  | Biên nhận A5 dạng PDF hoặc PNG                                                | A, NV |         |
| GET    | `/students/{id}/invoices` | Hóa đơn của một học viên                                                      | A, NV |         |
| POST   | `/invoices/generate`      | Chạy tay việc sinh hóa đơn đầu kỳ                                             | A     |         |

## Thay đổi ở endpoint của phase trước

| Endpoint                                              | Thay đổi                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /enrollments`                                   | Bật tự tạo hóa đơn kỳ đầu bằng cờ cấu hình (`settings.auto_invoice_on_enroll`), không cần release lại phase 1 |
| `PATCH /enrollments/{id}`                             | Bảo lưu hoặc kết thúc: dừng sinh hóa đơn các kỳ sau; hóa đơn kỳ hiện tại giữ nguyên để nhân viên xử lý tay    |
| `GET /students`                                       | Thêm lọc `fee_status` (chip "Còn nợ học phí")                                                                 |
| `GET /students/{id}`, `GET /sessions/{id}/attendance` | Thêm trạng thái học phí; ẩn với GV                                                                            |

## Job

| Job                 | Lịch chạy       | Làm gì                                                                                             |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `mark-overdue`      | 00:05 hằng ngày | Gọi `core.mark_overdue_invoices()`; hóa đơn quá hạn ngay sau ngày hạn đóng (chờ business xác nhận) |
| `generate-invoices` | 02:00 hằng ngày | Sinh hóa đơn cho ghi danh bước sang kỳ mới; chạy lại không trùng                                   |

## Script chuyển dữ liệu (chạy một lần trước ngày bật) [ĐC-7]

Các ghi danh tạo ở đợt 1 chưa có hóa đơn, và công nợ hiện có đang nằm trong sổ giấy của trung tâm.

1. Sinh hóa đơn kỳ hiện tại cho mọi ghi danh còn hiệu lực.
2. Nhập công nợ đầu kỳ từ file Excel của trung tâm (một hóa đơn loại `opening_balance` cho mỗi học viên còn nợ).
3. Chạy thử trên bản sao DB, đối chiếu tổng công nợ với sổ của trung tâm, rồi mới chạy thật.

## Quy tắc nghiệp vụ và mã lỗi

| Quy tắc                                 | Mã lỗi                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| Không thu vượt số còn thiếu             | `PAYMENT_EXCEEDS_BALANCE` (kèm số còn thiếu trong `message`) |
| Không thu tiền trên hóa đơn đã hủy      | `INVOICE_CANCELLED`                                          |
| Không hủy hóa đơn đã có tiền thu        | `INVOICE_HAS_PAYMENTS`                                       |
| Phiếu thu không sửa, không xóa, chỉ hủy | `PAYMENT_IMMUTABLE`                                          |
| Một ghi danh chỉ có một hóa đơn mỗi kỳ  | `INVOICE_PERIOD_EXISTS`                                      |

Số đã thu, trạng thái hóa đơn và nhật ký hủy phiếu do trigger tự cập nhật. API chỉ đọc lại sau khi ghi.

## Bảng và view DB

`invoices`, `payments`, `code_sequences`, `audit_logs`, view `v_student_fee_status`.

## Xong phase khi

- [ ] Script chuyển dữ liệu chạy trên dữ liệu thật; tổng công nợ khớp sổ của trung tâm
- [ ] Ghi danh học viên mới tự tạo hóa đơn kỳ đầu
- [ ] Thu 1,6 triệu trên hóa đơn 3,2 triệu thì trạng thái là Trả một phần; thu nốt thì thành Đã đóng
- [ ] Thu vượt số còn thiếu bị chặn, báo lỗi rõ số còn thiếu
- [ ] Admin hủy phiếu thu, hóa đơn quay về đúng trạng thái và có dòng nhật ký
- [ ] In được biên nhận A5 và xuất ảnh PNG
- [ ] Qua hạn đóng một ngày, hóa đơn tự chuyển sang Quá hạn
