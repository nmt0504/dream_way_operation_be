# Phase 4 – Lương và số liệu

|                |                                                                 |
| -------------- | --------------------------------------------------------------- |
| Đợt release    | 3                                                               |
| Cần xong trước | Phase 2, phase 3, và ít nhất một tháng điểm danh, thu tiền thật |
| Endpoint       | 13 (5 lương gốc + 8 chuyển từ phase 5)                          |
| Job / webhook  | 1 job (chuyển từ phase 5)                                       |
| Màn hình       | Trang "Phase 4 – Lương và số liệu" trên canvas UI               |

Admin chốt lương giáo viên từ các buổi đã điểm danh; Tổng quan, báo cáo tháng, thông báo và nhật ký lên cùng đợt. Các phần tổng hợp được kéo lên từ phase 5 của tài liệu gốc vì chúng không phụ thuộc quyết định nào của business. **[ĐC-12]**

## Endpoint

### Lương

| Method | Path                                     | Mô tả                                                                                                                                             | Quyền | Ghi chú |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- |
| GET    | `/payroll/periods`                       | Danh sách kỳ lương và trạng thái                                                                                                                  | A     |         |
| GET    | `/payroll/periods/{month}`               | Bảng lương tháng: tạm tính nếu chưa duyệt, số đã chốt nếu đã duyệt. Kèm cảnh báo buổi chưa điểm danh, giáo viên chưa có đơn giá, số buổi dạy thay | A     |         |
| GET    | `/payroll/periods/{month}/teachers/{id}` | Các buổi được tính lương của một giáo viên, gồm cả buổi dạy thay                                                                                  | A     |         |
| POST   | `/payroll/periods/{month}/approve`       | Duyệt và khóa kỳ, gọi `core.approve_payroll()`                                                                                                    | A     |         |
| POST   | `/payroll/periods/{month}/reopen`        | Mở lại kỳ đã duyệt, bắt buộc lý do, gọi `core.reopen_payroll()`                                                                                   | A     |         |

Quyền xem bảng lương của nhân viên đang chờ business chốt (đặc tả cho xem, API chỉ cho Admin). Giữ chỉ Admin cho tới khi có quyết định.

### Tổng quan, báo cáo, thông báo, nhật ký (chuyển từ phase 5)

| Method | Path                                                | Mô tả                                                                                        | Quyền       | Ghi chú |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- | ------- |
| GET    | `/dashboard`                                        | Bốn chỉ số tổng quan; nhân viên không nhận doanh thu                                         | A, NV       |         | Chuyển từ phase 5 |
| GET    | `/dashboard/todo`                                   | Việc cần xử lý hôm nay (DB-02)                                                               | A, NV, GV** |         | Chuyển từ phase 5 |
| GET    | `/reports/monthly?month=YYYY-MM&branch_id=`         | Sáu chỉ số báo cáo tháng, toàn trung tâm hoặc một cơ sở; lương chỉ tính kỳ đã duyệt (RPT-02) | A           |         | Chuyển từ phase 5 |
| GET    | `/reports/monthly/classes?month=YYYY-MM&branch_id=` | Sĩ số và chuyên cần theo lớp (RPT-03)                                                        | A           |         | Chuyển từ phase 5 |
| GET    | `/notifications`                                    | Thông báo của tôi                                                                            | A, NV, GV   |         | Chuyển từ phase 5 |
| POST   | `/notifications/{id}/read`                          | Đánh dấu đã đọc                                                                              | A, NV, GV   |         | Chuyển từ phase 5 |
| POST   | `/notifications/read-all`                           | Đánh dấu tất cả đã đọc                                                                       | A, NV, GV   |         | Chuyển từ phase 5 |
| GET    | `/audit-logs`                                       | Nhật ký thao tác (bảng đã ghi từ phase 0)                                                    | A           |         | Chuyển từ phase 5 |

## Job

| Job           | Lịch chạy       | Làm gì                                                                                                                    |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `notify-todo` | 07:00 hằng ngày | Tạo thông báo chuông cho việc tồn đọng: hóa đơn quá hạn, buổi chưa điểm danh, kỳ lương chờ duyệt, giáo viên thiếu đơn giá |

## Quy tắc nghiệp vụ và mã lỗi

| Quy tắc                                                                                                                                                                       | Mã lỗi                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Có giáo viên chưa có đơn giá trong kỳ thì không duyệt được                                                                                                                    | `PAYROLL_MISSING_RATE`                                   |
| Kỳ đã duyệt thì không duyệt lại                                                                                                                                               | `PAYROLL_ALREADY_APPROVED`                               |
| Mở lại phải có lý do, chỉ mở kỳ đã duyệt                                                                                                                                      | `PAYROLL_REOPEN_REASON_REQUIRED`, `PAYROLL_NOT_APPROVED` |
| Kỳ đã duyệt: chặn sửa điểm danh, `POST /sessions`, `PATCH /sessions/{id}`, `/sessions/{id}/cancel`, `/sessions/bulk-cancel` và `POST /teachers/{id}/rates` có ngày rơi vào kỳ | `PAYROLL_LOCKED` **[ĐC-8]**                              |

Duyệt khóa các buổi trong tháng; từ lúc này `PAYROLL_LOCKED` của phase 2 bắt đầu có tác dụng. Mở lại gỡ khóa, duyệt lại tính lương từ đầu. Cả hai đều tự ghi nhật ký.

## Bảng, view và hàm DB

`payroll_periods`, `payroll_items`, `teacher_rates`, `sessions`, `notifications`, `audit_logs`, view `v_payroll_preview`, hàm `monthly_report()`, `monthly_class_report()`.

## Xong phase khi

- [ ] Bảng lương tháng đầu khớp với cách tính tay của trung tâm
- [ ] Buổi dạy thay được tính cho đúng người dạy
- [ ] Sau khi duyệt, sửa điểm danh hay đổi giờ, hủy, thêm buổi trong tháng đó đều bị chặn
- [ ] Mở lại kỳ, sửa, duyệt lại thì tổng lương được tính lại đúng
- [ ] Trang bảng lương cảnh báo các buổi chưa điểm danh trước khi duyệt
- [ ] Số liệu báo cáo tháng khớp với sổ sách của trung tâm cho một tháng thật
- [ ] Báo cáo theo từng cơ sở cộng lại bằng báo cáo toàn trung tâm
- [ ] Nhân viên gọi `/dashboard` không nhận doanh thu và lương
