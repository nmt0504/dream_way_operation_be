# Phase 1 – Dữ liệu gốc

|                |                                              |
| -------------- | -------------------------------------------- |
| Đợt release    | 1                                            |
| Cần xong trước | Phase 0                                      |
| Endpoint       | 28 (26 gốc + 2 mới)                          |
| Job / webhook  | 0                                            |
| Màn hình       | Trang "Phase 1 – Dữ liệu gốc" trên canvas UI |

Cho trung tâm nhập toàn bộ giáo viên, lớp và học viên hiện có. Ghi danh ở phase này **chưa** tạo hóa đơn; phase 3 bật bằng cờ cấu hình.

## Endpoint

### Giáo viên

| Method | Path                   | Mô tả                                                  | Quyền | Ghi chú                                                                |
| ------ | ---------------------- | ------------------------------------------------------ | ----- | ---------------------------------------------------------------------- |
| GET    | `/teachers`            | Danh sách giáo viên                                    | A, NV |                                                                        |
| POST   | `/teachers`            | Thêm giáo viên, có thể chưa cấp tài khoản              | A     | Cấp tài khoản sau qua `POST /users` với `teacher_id`                   |
| GET    | `/teachers/{id}`       | Hồ sơ kèm các lớp phụ trách                            | A, NV |                                                                        |
| PATCH  | `/teachers/{id}`       | Sửa hồ sơ, cho nghỉ                                    | A     |                                                                        |
| GET    | `/teachers/{id}/rates` | Lịch sử đơn giá                                        | A     |                                                                        |
| POST   | `/teachers/{id}/rates` | Thêm đơn giá theo giờ hoặc theo buổi, có ngày hiệu lực | A     | Bị chặn nếu hiệu lực rơi vào kỳ lương đã duyệt (từ phase 4) **[ĐC-8]** |

### Lớp và lịch cố định

| Method | Path                        | Mô tả                                                                    | Quyền      | Ghi chú                                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------- |
| GET    | `/classes`                  | Danh sách lớp, lọc theo cơ sở, giáo viên, trạng thái                     | A, NV, GV* |                                                                             |
| POST   | `/classes`                  | Tạo lớp kèm giáo viên phụ trách và lịch cố định                          | A, NV      |                                                                             |
| GET    | `/classes/{id}`             | Chi tiết lớp                                                             | A, NV, GV* |                                                                             |
| PATCH  | `/classes/{id}`             | Sửa lớp, đóng lớp, **cấu hình học phí** (số tiền, chu kỳ, ngày hạn đóng) | A, NV      | Lưu cấu hình học phí từ phase này để phase 3 dùng; chu kỳ chờ business chốt |
| PUT    | `/classes/{id}/teachers`    | Đặt lại danh sách giáo viên phụ trách                                    | A, NV      |                                                                             |
| GET    | `/classes/{id}/enrollments` | Học viên của lớp, lọc theo trạng thái ghi danh                           | A, NV, GV* | **Mới [ĐC-4]**                                                              |
| GET    | `/classes/{id}/schedules`   | Lịch cố định của lớp                                                     | A, NV, GV* |                                                                             |
| POST   | `/classes/{id}/schedules`   | Thêm ca cố định                                                          | A, NV      |                                                                             |
| PATCH  | `/schedules/{id}`           | Sửa ca                                                                   | A, NV      | Từ phase 2: sinh lại buổi tương lai **[ĐC-1]**                              |
| DELETE | `/schedules/{id}`           | Kết thúc ca                                                              | A, NV      | Từ phase 2: hủy buổi tương lai **[ĐC-1]**                                   |

### Học viên, phụ huynh, ghi danh

| Method | Path                             | Mô tả                                                                                                                                | Quyền      | Ghi chú                              |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------ |
| GET    | `/students`                      | Tìm và lọc học viên, tìm không dấu (STU-01)                                                                                          | A, NV, GV* | Lọc `fee_status` thêm ở phase 3      |
| GET    | `/students/check-phone`          | Cảnh báo số điện thoại đã có                                                                                                         | A, NV      |                                      |
| POST   | `/students`                      | Thêm học viên vào một cơ sở quản lý, tự cấp mã HV                                                                                    | A, NV      |                                      |
| POST   | `/students/import`               | Nhập học viên từ file Excel theo mẫu; `?dry_run=true` trả lỗi từng dòng, chạy thật trong một transaction                             | A, NV      | **Mới [ĐC-6]**                       |
| GET    | `/students/{id}`                 | Hồ sơ học viên                                                                                                                       | A, NV, GV* | GV không thấy SĐT, học phí           |
| PATCH  | `/students/{id}`                 | Sửa hồ sơ, đánh dấu nghỉ                                                                                                             | A, NV      |                                      |
| GET    | `/guardians`                     | Tìm phụ huynh theo số điện thoại                                                                                                     | A, NV      |                                      |
| POST   | `/students/{id}/guardians`       | Gắn phụ huynh, chọn phụ huynh chính                                                                                                  | A, NV      |                                      |
| PATCH  | `/students/{id}/guardians/{gid}` | Sửa quan hệ                                                                                                                          | A, NV      |                                      |
| DELETE | `/students/{id}/guardians/{gid}` | Gỡ phụ huynh                                                                                                                         | A, NV      |                                      |
| POST   | `/enrollments`                   | Ghi danh vào lớp. Nhận `student_id` (học viên đã có) **hoặc** `student` + `guardians[]` để tạo mới và ghi danh trong một transaction | A, NV      | **[ĐC-5]**                           |
| PATCH  | `/enrollments/{id}`              | Bảo lưu hoặc kết thúc ghi danh                                                                                                       | A, NV      | Từ phase 3: dừng sinh hóa đơn kỳ sau |

## Quy tắc nghiệp vụ và mã lỗi

| Quy tắc                                                                                  | Mã lỗi                                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Ca cố định phải do giáo viên phụ trách lớp dạy                                           | `SCHEDULE_TEACHER_NOT_IN_CLASS`                                               |
| Phòng phải cùng cơ sở với lớp                                                            | `ROOM_NOT_IN_BRANCH`                                                          |
| Đổi cơ sở của lớp khi còn dùng phòng cơ sở cũ                                            | `CLASS_BRANCH_HAS_ROOMS`                                                      |
| Một học viên chỉ có một ghi danh còn hiệu lực trong một lớp                              | `ENROLLMENT_EXISTS`                                                           |
| Quyền xem học viên theo cơ sở và lớp, hàm `can_see_student()`                            | `404` như không tồn tại                                                       |
| `POST /enrollments` tạo mới: lỗi ở bất kỳ bước nào thì rollback cả học viên và phụ huynh | Lỗi của bước gây ra, không để lại bản ghi dư                                  |
| `POST /students/import`: file sai mẫu                                                    | `IMPORT_INVALID_TEMPLATE` (mã mới); lỗi từng dòng trả trong `rows[].errors[]` |

## Bảng DB

`teachers`, `teacher_rates`, `classes` (thêm cột cấu hình học phí), `class_teachers`, `class_schedules`, `students`, `guardians`, `student_guardians`, `enrollments`, `code_sequences`.

## Xong phase khi

- [ ] Nhập file Excel khoảng 500 học viên của một cơ sở thật; chạy thử báo đúng dòng lỗi, mã HV cấp liên tiếp không trùng
- [ ] Ghi danh học viên mới cùng phụ huynh trong một lệnh gọi; lỗi ở bước ghi danh thì không còn học viên dư
- [ ] Một lớp có hai giáo viên phụ trách, cả hai đều thấy lớp trong `/classes`
- [ ] Tìm "nguyen minh" ra đúng "Nguyễn Minh Anh" dưới 150ms với 500 học viên
- [ ] Giáo viên xem hồ sơ học viên không thấy số điện thoại và học phí
- [ ] Nhân viên cơ sở A không mở được hồ sơ học viên chỉ học ở cơ sở B
