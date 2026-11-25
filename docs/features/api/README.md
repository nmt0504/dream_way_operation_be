# DreamWay LMS – API Phần 1: Vận hành

Tài liệu API của app quản lý trung tâm, chia theo phase để implement. Đây là bản export từ tài liệu "DreamWay LMS – API vận hành theo phase", đã gộp các điểm chỉnh trong "Kế hoạch implement theo phase (API + UI)". Mỗi chỗ chỉnh được đánh dấu **[ĐC-n]**, tra ở bảng dưới.

## Cách đọc

1. [conventions.md](./conventions.md): xác thực, phân quyền, định dạng lỗi, phân trang, chống ghi trùng. Đọc trước khi code bất kỳ endpoint nào.
2. File của phase đang làm. Mỗi file có cùng cấu trúc: thông tin phase → endpoint → thay đổi ở endpoint phase trước (nếu có) → job → quy tắc và mã lỗi → bảng DB → tiêu chí "Xong phase khi".
3. [endpoints.md](./endpoints.md): danh sách phẳng cả 87 endpoint, để tra nhanh hoặc dựng router.

## Phase

| Phase                    | File                                                             | Endpoint | Job / webhook                 | Cần xong trước                       | Đợt |
| ------------------------ | ---------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------ | --- |
| 0. Nền tảng              | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     | 20       | 0                             | Không                                | 1   |
| 1. Dữ liệu gốc           | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               | 28       | 0                             | Phase 0                              | 1   |
| 2. Buổi học và điểm danh | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) | 12       | 1 job                         | Phase 1                              | 1   |
| 3. Học phí               | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       | 11       | 2 job + script chuyển dữ liệu | Phase 1 (song song phase 2 được)     | 2   |
| 4. Lương và số liệu      | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           | 13       | 1 job                         | Phase 2, 3 và một tháng dữ liệu thật | 3   |
| 5. Nhắc lịch và LMS      | [phase-5-nhac-lich-lms.md](./phase-5-nhac-lich-lms.md)           | 3        | 2 job, 2 webhook              | Phase 2 và quyết định của business   | 4   |

| Đợt                      | Phase   | Trung tâm dùng được gì                             |
| ------------------------ | ------- | -------------------------------------------------- |
| 1. Chạy lớp và điểm danh | 0, 1, 2 | Nhập lớp, học viên; giáo viên điểm danh hằng ngày  |
| 2. Thu học phí           | 3       | Thu tiền tại quầy, theo dõi công nợ                |
| 3. Lương và số liệu      | 4       | Chốt lương tháng, xem tổng quan và báo cáo         |
| 4. Nhắc lịch và LMS      | 5       | Phụ huynh nhận tin nhắc; học viên có tài khoản LMS |

## Điểm chỉnh so với tài liệu gốc

| #     | Thay đổi                                                                                                                        | Phase |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| ĐC-1  | `PATCH` / `DELETE /schedules/{id}` sinh lại hoặc hủy buổi tương lai chưa điểm danh, chưa sửa tay; thêm cột `sessions.is_manual` | 1, 2  |
| ĐC-2  | Thêm `POST /sessions/bulk-cancel` cho nghỉ lễ                                                                                   | 2     |
| ĐC-3  | `POST` / `PATCH /users` nhận `teacher_id`; `GET /me` trả `teacher_id`; một giáo viên tối đa một tài khoản                       | 0     |
| ĐC-4  | Thêm `GET /classes/{id}/enrollments`                                                                                            | 1     |
| ĐC-5  | `POST /enrollments` nhận `student` + `guardians[]` để tạo mới và ghi danh trong một transaction                                 | 1     |
| ĐC-6  | Thêm `POST /students/import` (Excel, có chạy thử)                                                                               | 1     |
| ĐC-7  | Script chuyển dữ liệu một lần: hóa đơn kỳ hiện tại cho ghi danh cũ, công nợ đầu kỳ                                              | 3     |
| ĐC-8  | `PAYROLL_LOCKED` chặn cả thêm, sửa, hủy buổi và đơn giá có hiệu lực trong kỳ đã duyệt                                           | 2, 4  |
| ĐC-9  | Bảng và trigger `audit_logs` dựng từ phase 0                                                                                    | 0     |
| ĐC-10 | `PATCH /sessions/{id}/reminder` chuyển từ phase 2 sang phase 5                                                                  | 5     |
| ĐC-11 | Thử lại gửi tin tối đa 2 lần, cách 5 phút (gốc ghi 3 lần), chờ chốt                                                             | 5     |
| ĐC-12 | Tổng quan, báo cáo, thông báo, nhật ký, job `notify-todo` chuyển từ phase 5 lên phase 4                                         | 4     |

Mã lỗi chưa có trong tài liệu gốc được ghi "(mã mới)" trong file phase. Chi tiết tài liệu gốc chưa ghi được đánh dấu _(đề xuất)_ trong conventions.

## Cần business chốt

| Câu hỏi                                                                | Chặn phase          | Đề xuất                                                    |
| ---------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| "Trễ" có tính là có mặt khi tính chuyên cần? "Vắng có phép" có bị trừ? | 2                   | Trễ tính có mặt; vắng có phép vẫn trừ nhưng hiển thị riêng |
| Học phí tính theo tháng hay theo khóa? Hạn đóng mặc định ngày mấy?     | 1 (lưu cấu hình), 3 | Cấu hình theo từng lớp                                     |
| "Quá hạn" là ngay sau hạn hay sau 7 ngày?                              | 3                   | Ngay sau hạn                                               |
| Nhân viên có được xem bảng lương?                                      | 4                   | Không, giữ chỉ Admin                                       |
| Kênh nhắc Zalo OA hay SMS brandname? Ai chịu chi phí?                  | 5                   | Thử lại 2 lần, cách 5 phút                                 |
| Dùng mã học viên làm tên đăng nhập LMS?                                | 5                   | Đồng ý                                                     |

## Ngoài phạm vi

- Phần 2 – LMS (bài tập, nộp bài): tài liệu riêng.
- Cổng phụ huynh: không có trong Phần 1.

## Nguồn

- Tài liệu API gốc: https://claude.ai/artifact/KzEHKata4n3U6Jfq168Mwp
- Kế hoạch implement theo phase: https://claude.ai/artifact/UVEgJ5PEqujUFFtYU7y1iW
- UI theo phase: https://claude.ai/artifact/6zx6CRgTGL7q54SR2YSJ7A
- DreamWay Design System: https://claude.ai/artifact/GMYgtCnJXv2L3YTy2DGacZ
