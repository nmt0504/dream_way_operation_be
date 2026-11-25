# Danh sách endpoint

Mỗi dòng một endpoint, sắp theo phase. Chi tiết, quy tắc và mã lỗi ở file phase tương ứng. Cột _Trạng thái_: `mới` là endpoint thêm so với tài liệu gốc, `chuyển` là endpoint đổi phase so với tài liệu gốc.

| Phase | Method | Path                                                | Quyền          | Trạng thái | File                                                             |
| ----- | ------ | --------------------------------------------------- | -------------- | ---------- | ---------------------------------------------------------------- |
| 0     | POST   | `/auth/login`                                       | Chưa đăng nhập |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/auth/refresh`                                     | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/auth/logout`                                      | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/auth/password`                                    | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/me`                                               | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/roles`                                            | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/users`                                            | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/users`                                            | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | PATCH  | `/users/{id}`                                       | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/users/{id}/branches`                              | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | PUT    | `/users/{id}/branches`                              | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/users/{id}/reset-password`                        | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/settings`                                         | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | PATCH  | `/settings`                                         | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/branches`                                         | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/branches`                                         | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | PATCH  | `/branches/{id}`                                    | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | GET    | `/rooms`                                            | A, NV, GV      |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | POST   | `/rooms`                                            | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 0     | PATCH  | `/rooms/{id}`                                       | A              |            | [phase-0-nen-tang.md](./phase-0-nen-tang.md)                     |
| 1     | GET    | `/teachers`                                         | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/teachers`                                         | A              |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/teachers/{id}`                                    | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/teachers/{id}`                                    | A              |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/teachers/{id}/rates`                              | A              |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/teachers/{id}/rates`                              | A              |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/classes`                                          | A, NV, GV*     |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/classes`                                          | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/classes/{id}`                                     | A, NV, GV*     |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/classes/{id}`                                     | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PUT    | `/classes/{id}/teachers`                            | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/classes/{id}/enrollments`                         | A, NV, GV*     | mới        | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/classes/{id}/schedules`                           | A, NV, GV*     |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/classes/{id}/schedules`                           | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/schedules/{id}`                                   | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | DELETE | `/schedules/{id}`                                   | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/students`                                         | A, NV, GV*     |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/students/check-phone`                             | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/students`                                         | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/students/import`                                  | A, NV          | mới        | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/students/{id}`                                    | A, NV, GV*     |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/students/{id}`                                    | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | GET    | `/guardians`                                        | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/students/{id}/guardians`                          | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/students/{id}/guardians/{gid}`                    | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | DELETE | `/students/{id}/guardians/{gid}`                    | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | POST   | `/enrollments`                                      | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 1     | PATCH  | `/enrollments/{id}`                                 | A, NV          |            | [phase-1-du-lieu-goc.md](./phase-1-du-lieu-goc.md)               |
| 2     | GET    | `/sessions`                                         | A, NV, GV**    |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | GET    | `/sessions/today`                                   | A, NV, GV**    |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | POST   | `/sessions/check-conflicts`                         | A, NV          |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | POST   | `/sessions`                                         | A, NV          |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | PATCH  | `/sessions/{id}`                                    | A, NV          |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | POST   | `/sessions/{id}/cancel`                             | A, NV          |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | POST   | `/sessions/bulk-cancel`                             | A, NV          | mới        | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | GET    | `/sessions/{id}/attendance`                         | A, NV, GV**    |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | PUT    | `/sessions/{id}/attendance`                         | A, NV, GV**    |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | PATCH  | `/attendance-records/{id}`                          | A, NV, GV**    |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | GET    | `/students/{id}/attendance`                         | A, NV, GV*     |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 2     | GET    | `/classes/{id}/attendance-summary`                  | A, NV, GV*     |            | [phase-2-buoi-hoc-diem-danh.md](./phase-2-buoi-hoc-diem-danh.md) |
| 3     | GET    | `/invoices`                                         | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | GET    | `/invoices/summary`                                 | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | POST   | `/invoices`                                         | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | GET    | `/invoices/{id}`                                    | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | PATCH  | `/invoices/{id}`                                    | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | POST   | `/invoices/{id}/cancel`                             | A              |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | POST   | `/invoices/{id}/payments`                           | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | POST   | `/payments/{id}/void`                               | A              |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | GET    | `/payments/{id}/receipt`                            | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | GET    | `/students/{id}/invoices`                           | A, NV          |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 3     | POST   | `/invoices/generate`                                | A              |            | [phase-3-hoc-phi.md](./phase-3-hoc-phi.md)                       |
| 4     | GET    | `/payroll/periods`                                  | A              |            | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/payroll/periods/{month}`                          | A              |            | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/payroll/periods/{month}/teachers/{id}`            | A              |            | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | POST   | `/payroll/periods/{month}/approve`                  | A              |            | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | POST   | `/payroll/periods/{month}/reopen`                   | A              |            | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/dashboard`                                        |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/dashboard/todo`                                   |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/reports/monthly?month=YYYY-MM&branch_id=`         |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/reports/monthly/classes?month=YYYY-MM&branch_id=` |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/notifications`                                    |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | POST   | `/notifications/{id}/read`                          |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | POST   | `/notifications/read-all`                           |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 4     | GET    | `/audit-logs`                                       |                | chuyển     | [phase-4-luong-so-lieu.md](./phase-4-luong-so-lieu.md)           |
| 5     | PATCH  | `/sessions/{id}/reminder`                           | A, NV          | chuyển     | [phase-5-nhac-lich-lms.md](./phase-5-nhac-lich-lms.md)           |
| 5     | GET    | `/reminders`                                        | A, NV          |            | [phase-5-nhac-lich-lms.md](./phase-5-nhac-lich-lms.md)           |
| 5     | POST   | `/students/{id}/lms-account`                        | A, NV          |            | [phase-5-nhac-lich-lms.md](./phase-5-nhac-lich-lms.md)           |

Tổng: 87 endpoint (phase 0: 20, phase 1: 28, phase 2: 12, phase 3: 11, phase 4: 13, phase 5: 3), cộng 4 job, 1 worker và 2 webhook.
