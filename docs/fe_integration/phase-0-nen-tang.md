# Tích hợp FE – Phase 0: Nền tảng

Tài liệu cho frontend app vận hành (Admin, Nhân viên, Giáo viên). Mô tả đúng hành vi API đang chạy, không phải bản thiết kế. Quy ước chung xem thêm [conventions.md](../features/api/conventions.md); nghiệp vụ xem [phase-0-nen-tang.md](../features/api/phase-0-nen-tang.md).

## 1. Thông tin chung

|                 |                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------- |
| Base URL        | `{API_HOST}/api/v1` (dev: `http://localhost:8080/api/v1`)                                     |
| Định dạng       | JSON, tên trường `snake_case`                                                                 |
| Xác thực        | Header `Authorization: Bearer <access_token>`                                                 |
| Origin FE ở dev | `http://localhost` và `http://localhost:5173`. Origin khác phải báo BE thêm vào `CORS_ORIGIN` |

Định dạng dữ liệu:

| Loại          | Định dạng                   | Ví dụ                                    |
| ------------- | --------------------------- | ---------------------------------------- |
| Id            | UUID                        | `"8adb566e-9cea-4aaf-bbb2-c7f3da027f54"` |
| Thời điểm     | ISO 8601, UTC               | `"2026-11-24T10:30:00.000Z"`             |
| Tiền          | Số nguyên VND               | `300000000`                              |
| Số điện thoại | 10 chữ số, bắt đầu bằng `0` | `"0912445118"`                           |

FE tự định dạng khi hiển thị (`300.000.000đ`, `24/11/2026 17:30`, `0912 445 118`).

## 2. Định dạng response

**Thành công, một bản ghi:**

```json
{ "data": { "id": "…", "name": "Cơ sở Q.3" } }
```

**Thành công, danh sách (có phân trang):**

```json
{ "data": [ … ], "meta": { "page": 1, "page_size": 20, "total": 214 } }
```

**Lỗi:**

```json
{
  "error": {
    "code": "PHONE_TAKEN",
    "message": "Số điện thoại đã được dùng cho tài khoản khác",
    "field": "phone"
  }
}
```

- `code`: dùng để rẽ nhánh xử lý. Giá trị ổn định, không đổi.
- `message`: tiếng Việt, hiển thị thẳng cho người dùng được.
- `field`: chỉ có khi lỗi gắn với một ô nhập. Dùng để báo lỗi ngay dưới ô đó. Với trường lồng nhau hoặc mảng, path nối bằng dấu chấm, ví dụ `branch_ids.0`.
- Một số lỗi có thêm trường riêng, ví dụ `ACCOUNT_LOCKED` có `locked_until`.

**Không có nội dung:** một số endpoint trả `204` với body rỗng.

> `warnings[]` (cảnh báo mềm) đã có trong quy ước nhưng chưa endpoint nào ở phase 0 trả về.

## 3. Xác thực

### Token

|                | Access token                                       | Refresh token                                                     |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Nằm ở đâu      | Body response `data.access_token`                  | Cookie `refresh_token` (httpOnly, path `/api/v1/auth`)            |
| Thời hạn       | 15 phút (`expires_in: 900`)                        | 30 ngày                                                           |
| FE lưu ở đâu   | **Bộ nhớ** (state/store). Không lưu `localStorage` | Trình duyệt tự giữ, JS không đọc được                             |
| Gửi đi thế nào | Header `Authorization`                             | Trình duyệt tự gửi, **chỉ** tới `/auth/refresh` và `/auth/logout` |

Bắt buộc:

- Gọi `/auth/login`, `/auth/refresh`, `/auth/logout` với `credentials: 'include'` (fetch) hoặc `withCredentials: true` (axios). Thiếu thì cookie không được lưu và cũng không được gửi.
- Mỗi lần refresh, refresh token được **xoay vòng**: token cũ bị thu hồi, token mới được set lại vào cookie. Nếu hai tab refresh cùng lúc, chỉ một tab thành công. Vì vậy FE chỉ được chạy **một lần refresh tại một thời điểm**: các request khác chờ chung một promise refresh.
- Cookie dùng `SameSite=Lax`, nên FE và API phải cùng site. Ví dụ `app.dreamway.vn` và `api.dreamway.vn` là được. Ở dev, `localhost` khác cổng vẫn được tính là cùng site.

### Luồng

```
Mở app / F5
  └─ POST /auth/refresh ──200──> lưu access_token ─> GET /me ─> vào app
                         └─401──> màn đăng nhập

Đăng nhập
  └─ POST /auth/login ─> lưu access_token
       ├─ must_change_password = true  ─> màn đổi mật khẩu (bắt buộc)
       └─ must_change_password = false ─> GET /me ─> vào app

Gọi API bất kỳ nhận 401
  └─ POST /auth/refresh (một lần, dùng chung cho mọi request đang chờ)
       ├─ 200 ─> gọi lại request ban đầu với token mới
       └─ 401 ─> xóa state, về màn đăng nhập

Đăng xuất
  └─ POST /auth/logout ─> xóa state ─> màn đăng nhập
```

Có thể refresh chủ động trước khi hết hạn, ví dụ ở giây thứ `expires_in - 60`. Dù vậy vẫn phải giữ cơ chế bắt 401 ở trên.

### Đổi mật khẩu bắt buộc

Tài khoản mới tạo hoặc vừa được Admin đặt lại mật khẩu có `must_change_password = true`. Khi cờ này bật:

- Chỉ gọi được `GET /me`, `POST /auth/password`, `POST /auth/refresh`, `POST /auth/logout`.
- Mọi endpoint khác trả `403 PASSWORD_CHANGE_REQUIRED`. FE gặp mã này ở bất kỳ đâu thì chuyển sang màn đổi mật khẩu.
- Đổi mật khẩu thành công thì **access token hiện tại vẫn dùng tiếp được**, không cần đăng nhập lại.

## 4. Quyền

Lấy từ `GET /me` → `data.permissions`. FE ẩn/hiện menu và nút theo mã quyền, **không** theo tên vai trò, để các phase sau thêm quyền không phải sửa FE.

| Mã quyền          | Admin | Nhân viên | Giáo viên | Dùng cho                    |
| ----------------- | :---: | :-------: | :-------: | --------------------------- |
| `users.manage`    |   ✓   |           |           | Màn tài khoản, `GET /roles` |
| `settings.manage` |   ✓   |           |           | Màn cài đặt trung tâm       |
| `branches.read`   |   ✓   |     ✓     |     ✓     | Danh sách cơ sở             |
| `branches.manage` |   ✓   |           |           | Thêm, sửa cơ sở             |
| `rooms.read`      |   ✓   |     ✓     |     ✓     | Danh sách phòng             |
| `rooms.manage`    |   ✓   |           |           | Thêm, sửa phòng             |

**Phạm vi cơ sở:**

- Nhân viên và giáo viên chỉ thấy các cơ sở được gán. `GET /me` → `data.branches` là danh sách cơ sở dùng cho bộ chọn cơ sở.
- Admin không cần gán, thấy mọi cơ sở. `data.branches` của Admin chứa tất cả cơ sở.
- Truyền `?branch_id=` của cơ sở không được gán thì nhận `403 BRANCH_NOT_ASSIGNED`.

## 5. Phân trang

Mọi endpoint danh sách nhận `?page=` (bắt đầu từ 1, mặc định 1) và `?page_size=` (mặc định 20, tối đa 100). Vượt giới hạn thì nhận `400 VALIDATION_ERROR`, `field: "page_size"`.

Dropdown cơ sở hoặc phòng: gọi `page_size=100`. Số cơ sở và số phòng nhỏ nên một trang là đủ.

## 6. Idempotency-Key

Áp dụng cho `POST /users`, `POST /branches`, `POST /rooms`.

- Mỗi lần người dùng bấm **Lưu** trên form tạo mới, FE sinh một key bằng `crypto.randomUUID()`.
- Khi **thử lại** request đó (mạng chập chờn, timeout), FE gửi lại đúng key cũ trong header `Idempotency-Key`.
- Gửi lại cùng key với cùng body trong 24 giờ thì API trả lại đúng kết quả lần đầu và không tạo bản ghi trùng.
- Người dùng sửa form rồi bấm Lưu lần nữa thì sinh key mới. Nếu dùng lại key cũ với body khác, API trả `422 IDEMPOTENCY_KEY_REUSED`.
- `409 IDEMPOTENCY_IN_PROGRESS` nghĩa là request đầu tiên vẫn đang chạy. FE chờ 1–2 giây rồi gửi lại.

Header này không bắt buộc. Thiếu thì API xử lý như request bình thường.

## 7. Endpoint

Quy ước trong mục này:

- **Quyền** ghi mã quyền cần có. Thiếu quyền thì nhận `403 FORBIDDEN`.
- Mọi endpoint (trừ `/auth/login`, `/auth/refresh`, `/auth/logout`) cần header `Authorization`. Thiếu hoặc sai thì nhận `401`.
- Body sai dạng thì nhận `400 VALIDATION_ERROR` kèm `field`.
- Id trên path không phải UUID thì nhận `400 VALIDATION_ERROR`, `field: "id"`.

### 7.1 Xác thực

#### `POST /auth/login`

Không cần token. Gọi với `credentials: 'include'`.

```json
{ "login": "0912445118", "password": "TempPass123" }
```

- `login`: số điện thoại (dạng `0xxxxxxxxx`) hoặc tên đăng nhập. Không phân biệt hoa thường với tên đăng nhập.
- App vận hành chỉ cho Admin, Nhân viên, Giáo viên đăng nhập.

`200` (kèm cookie `refresh_token`):

```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiJ9…",
    "token_type": "Bearer",
    "expires_in": 900,
    "must_change_password": true
  }
}
```

| Lỗi                       | Khi nào                                                    | FE xử lý                                            |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `401 INVALID_CREDENTIALS` | Sai tài khoản hoặc mật khẩu (API không nói rõ sai cái nào) | Hiện `message`                                      |
| `423 ACCOUNT_LOCKED`      | Sai 5 lần liên tiếp, bị khóa 15 phút. Có `locked_until`    | Hiện `message`, có thể đếm ngược tới `locked_until` |
| `403 ACCOUNT_INACTIVE`    | Admin đã khóa tài khoản                                    | Hiện `message`                                      |
| `403 ROLE_NOT_ALLOWED`    | Tài khoản phụ huynh hoặc học viên                          | Hiện `message`                                      |

```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Tài khoản bị khóa tạm do nhập sai mật khẩu 5 lần. Thử lại sau 15 phút.",
    "locked_until": "2026-11-28T03:15:00.000Z"
  }
}
```

#### `POST /auth/refresh`

Không cần token, không cần body. Gọi với `credentials: 'include'`.

- `200`: cùng dạng response với login, kèm cookie mới.
- `401 UNAUTHENTICATED`: không có cookie, cookie hết hạn hoặc đã bị thu hồi, hoặc tài khoản đã bị khóa. FE về màn đăng nhập.

#### `POST /auth/logout`

Không cần token, không cần body. Gọi với `credentials: 'include'`. Luôn trả `204` và xóa cookie.

#### `POST /auth/password`

Cần token. Gọi được kể cả khi `must_change_password = true`.

```json
{ "current_password": "TempPass123", "new_password": "NewPassword456" }
```

- `new_password`: 8–128 ký tự.
- `204`: thành công.

| Lỗi                                                 | FE xử lý                     |
| --------------------------------------------------- | ---------------------------- |
| `422 INVALID_PASSWORD`, `field: "current_password"` | Báo dưới ô mật khẩu hiện tại |
| `422 PASSWORD_UNCHANGED`, `field: "new_password"`   | Báo dưới ô mật khẩu mới      |

### 7.2 Người dùng hiện tại

#### `GET /me`

Cần token. Gọi được kể cả khi `must_change_password = true`.

```json
{
  "data": {
    "id": "8adb566e-…",
    "full_name": "Nguyễn Thị Lan",
    "phone": "0912445118",
    "username": null,
    "role": "teacher",
    "must_change_password": false,
    "teacher_id": "3f1c…",
    "branches": [{ "id": "b1…", "name": "Cơ sở Q.3" }],
    "classes": [{ "id": "c1…", "name": "Toán 9A", "status": "open" }],
    "permissions": ["branches.read", "rooms.read"]
  }
}
```

- `role`: `admin` | `staff` | `teacher`.
- `teacher_id`: id hồ sơ giáo viên gắn với tài khoản. `null` nếu không phải giáo viên hoặc chưa gắn.
- `branches`: cơ sở được gán, sắp theo tên. Với Admin là mọi cơ sở.
- `classes`: các lớp giáo viên phụ trách, gồm cả lớp đã đóng (`status: "closed"`). Rỗng nếu không phải giáo viên. Phase 1 mới có dữ liệu lớp.

### 7.3 Vai trò

#### `GET /roles`

Quyền: `users.manage`. Dùng cho dropdown vai trò ở form tài khoản.

```json
{
  "data": [
    {
      "code": "admin",
      "name": "Admin",
      "permissions": [
        "users.manage",
        "settings.manage",
        "branches.read",
        "branches.manage",
        "rooms.read",
        "rooms.manage"
      ]
    },
    { "code": "staff", "name": "Nhân viên", "permissions": ["branches.read", "rooms.read"] },
    { "code": "teacher", "name": "Giáo viên", "permissions": ["branches.read", "rooms.read"] }
  ]
}
```

### 7.4 Tài khoản

Mọi endpoint trong mục này cần quyền `users.manage`. Danh sách chỉ gồm tài khoản Admin, Nhân viên, Giáo viên. Tài khoản phụ huynh và học viên không hiện ở đây; gọi tới id của chúng thì nhận `404 USER_NOT_FOUND`.

**Đối tượng `User`:**

```json
{
  "id": "…",
  "full_name": "Trần Thị Hoa",
  "phone": "0911111111",
  "username": null,
  "role": "staff",
  "status": "active",
  "must_change_password": true,
  "locked_until": null,
  "last_login_at": null,
  "created_at": "2026-11-28T02:00:00.000Z",
  "teacher_id": null
}
```

- `status`: `active` (đang hoạt động) | `inactive` (bị Admin khóa).
- `locked_until`: khác `null` và lớn hơn thời điểm hiện tại nghĩa là đang bị khóa tạm do sai mật khẩu. Hiển thị khác với `inactive`.

#### `GET /users?page=&page_size=`

`200`: `{ data: User[], meta }`, mới tạo trước. Chưa có tìm kiếm hay lọc.

#### `POST /users`

Có Idempotency-Key.

```json
{
  "full_name": "Trần Thị Hoa",
  "phone": "0911111111",
  "role": "staff",
  "password": "TempPass123",
  "teacher_id": "3f1c…"
}
```

- `role`: `admin` | `staff` | `teacher`.
- `password`: mật khẩu tạm, 8–128 ký tự, do Admin tự nhập rồi báo cho người dùng. Người dùng bắt buộc phải đổi ở lần đăng nhập đầu.
- `teacher_id`: không bắt buộc. Chỉ gửi khi `role = "teacher"`, để gắn tài khoản với hồ sơ giáo viên (hồ sơ tạo ở phase 1).
- Tạo xong chưa có cơ sở nào. Gọi tiếp `PUT /users/{id}/branches` để gán.

`201`: `{ data: User }`.

| Lỗi                                                | Ghi chú                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `409 PHONE_TAKEN`, `field: "phone"`                |                                                  |
| `409 TEACHER_HAS_ACCOUNT`, `field: "teacher_id"`   | Giáo viên đã có tài khoản khác                   |
| `422 TEACHER_NOT_FOUND`, `field: "teacher_id"`     |                                                  |
| `422 TEACHER_ROLE_REQUIRED`, `field: "teacher_id"` | Gửi `teacher_id` khi `role` không phải `teacher` |

#### `PATCH /users/{id}`

Gửi các trường cần đổi, ít nhất một trường. Không đổi được số điện thoại.

```json
{ "full_name": "…", "role": "teacher", "status": "inactive", "teacher_id": "3f1c…" }
```

- `status: "inactive"`: khóa tài khoản. Người dùng bị đăng xuất ngay: request tiếp theo của họ nhận `403 ACCOUNT_INACTIVE`, và refresh nhận `401`. `status: "active"` để mở lại.
- `teacher_id: null`: bỏ gắn hồ sơ giáo viên.
- Đổi `role` sang khác `teacher` thì hồ sơ giáo viên tự động bị bỏ gắn.
- Admin hiện vẫn tự khóa hoặc tự hạ vai trò chính mình được. FE nên ẩn hoặc hỏi xác nhận khi `id` trùng với `me.id`.

`200`: `{ data: User }`. Lỗi giống `POST /users`, thêm `404 USER_NOT_FOUND`.

#### `POST /users/{id}/reset-password`

```json
{ "password": "TempPass999" }
```

`204`. Sau khi đặt lại:

- `must_change_password` bật lại.
- Khóa tạm do sai mật khẩu (nếu có) được gỡ.
- Mọi phiên đăng nhập của người đó bị thu hồi.

#### `GET /users/{id}/branches`

`200`, không phân trang:

```json
{ "data": [{ "id": "…", "name": "Cơ sở Q.3", "address": "12 Lê Văn Sỹ" }] }
```

#### `PUT /users/{id}/branches`

Thay **toàn bộ** danh sách cơ sở được gán. Gửi mảng rỗng để bỏ hết.

```json
{ "branch_ids": ["…", "…"] }
```

`200`: danh sách cơ sở sau khi gán, cùng dạng với `GET`. Có cơ sở không tồn tại thì nhận `422 BRANCH_NOT_FOUND`, `field: "branch_ids"`.

Thay đổi có hiệu lực ngay ở request tiếp theo của người được gán. FE của người đó nên gọi lại `GET /me` khi cần làm mới bộ chọn cơ sở.

### 7.5 Cài đặt trung tâm

Quyền: `settings.manage`, chỉ Admin.

#### `GET /settings`

```json
{
  "data": {
    "center_name": "DreamWay",
    "logo_url": null,
    "address": null,
    "revenue_target": null,
    "updated_at": "2026-11-28T02:00:00.000Z"
  }
}
```

#### `PATCH /settings`

Gửi các trường cần đổi, ít nhất một trường. Gửi `null` để xóa giá trị.

```json
{
  "center_name": "DreamWay English",
  "logo_url": "https://cdn…/logo.png",
  "address": "…",
  "revenue_target": 300000000
}
```

- `logo_url`: phải là URL hợp lệ. Chưa có API upload; FE nhập hoặc dán URL.
- `revenue_target`: số nguyên VND, lớn hơn hoặc bằng 0.

`200`: cùng dạng `GET`.

### 7.6 Cơ sở

**Đối tượng `Branch`:** `{ "id", "name", "address", "created_at" }`. `address` có thể `null`.

#### `GET /branches?page=&page_size=`

Quyền: `branches.read`. Tự lọc theo cơ sở được gán; không nhận `branch_id`. Sắp theo tên.

#### `POST /branches`

Quyền: `branches.manage`. Có Idempotency-Key.

```json
{ "name": "Cơ sở Q.3", "address": "12 Lê Văn Sỹ" }
```

`201`: `{ data: Branch }`.

#### `PATCH /branches/{id}`

Quyền: `branches.manage`. Body là `name` và/hoặc `address`.

`200`: `{ data: Branch }`. Không tồn tại thì `404 BRANCH_NOT_FOUND`.

> Chưa có API xóa cơ sở.

### 7.7 Phòng

**Đối tượng `Room`:** `{ "id", "branch_id", "name", "capacity" }`. `capacity` có thể `null`.

#### `GET /rooms?branch_id=&page=&page_size=`

Quyền: `rooms.read`. Sắp theo tên cơ sở rồi tên phòng.

- Không truyền `branch_id`: lấy phòng của mọi cơ sở được gán.
- Truyền `branch_id` không được gán: `403 BRANCH_NOT_ASSIGNED`.

#### `POST /rooms`

Quyền: `rooms.manage`. Có Idempotency-Key.

```json
{ "branch_id": "…", "name": "P.101", "capacity": 20 }
```

`capacity`: 1–1000, không bắt buộc. `201`: `{ data: Room }`.

| Lỗi                                          |                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `409 ROOM_NAME_TAKEN`, `field: "name"`       | Cơ sở đã có phòng trùng tên. Hai cơ sở khác nhau được đặt trùng tên phòng |
| `422 BRANCH_NOT_FOUND`, `field: "branch_id"` |                                                                           |

#### `PATCH /rooms/{id}`

Quyền: `rooms.manage`. Body là `branch_id`, `name`, `capacity` (ít nhất một trường).

`200`: `{ data: Room }`. Lỗi giống `POST`, thêm:

- `404 ROOM_NOT_FOUND`.
- `409 BUSINESS_RULE_VIOLATION`: chuyển phòng sang cơ sở khác trong khi lớp của cơ sở cũ vẫn đang dùng phòng. Lỗi này chỉ xảy ra từ phase 1, 2 trở đi.

> Chưa có API xóa phòng.

## 8. Bảng mã lỗi

| HTTP | `code`                                                                    | Ý nghĩa                                        | FE xử lý chung                                             |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                                                        | Dữ liệu sai dạng                               | Báo tại ô `field` nếu có, không thì toast                  |
| 401  | `UNAUTHENTICATED`                                                         | Chưa đăng nhập, token sai, hoặc phiên hết hạn  | Refresh một lần, thất bại thì về đăng nhập                 |
| 401  | `TOKEN_EXPIRED`                                                           | Access token hết hạn                           | Refresh rồi gọi lại                                        |
| 401  | `INVALID_CREDENTIALS`                                                     | Sai tài khoản hoặc mật khẩu (chỉ ở login)      | Hiện `message`                                             |
| 403  | `PASSWORD_CHANGE_REQUIRED`                                                | Phải đổi mật khẩu trước                        | Chuyển màn đổi mật khẩu                                    |
| 403  | `ACCOUNT_INACTIVE`                                                        | Tài khoản bị Admin khóa                        | Xóa state, về đăng nhập, hiện `message`                    |
| 403  | `ROLE_NOT_ALLOWED`                                                        | Phụ huynh hoặc học viên đăng nhập app vận hành | Hiện `message`                                             |
| 403  | `FORBIDDEN`                                                               | Vai trò không có quyền                         | Toast. Nếu FE ẩn nút đúng theo `permissions` thì không gặp |
| 403  | `BRANCH_NOT_ASSIGNED`                                                     | Cơ sở không được gán                           | Toast, reset bộ chọn cơ sở                                 |
| 404  | `NOT_FOUND`                                                               | Sai đường dẫn API                              | Lỗi lập trình                                              |
| 404  | `USER_NOT_FOUND`, `BRANCH_NOT_FOUND`, `ROOM_NOT_FOUND`                    | Bản ghi không tồn tại                          | Toast, quay về danh sách                                   |
| 409  | `PHONE_TAKEN`, `USERNAME_TAKEN`, `TEACHER_HAS_ACCOUNT`, `ROOM_NAME_TAKEN` | Trùng dữ liệu                                  | Báo tại ô `field`                                          |
| 409  | `BUSINESS_RULE_VIOLATION`                                                 | Vi phạm quy tắc nghiệp vụ trong DB             | Hiện `message`                                             |
| 409  | `CONFLICT`                                                                | Trùng dữ liệu chưa có mã riêng                 | Hiện `message`                                             |
| 409  | `IDEMPOTENCY_IN_PROGRESS`                                                 | Request cùng key đang chạy                     | Chờ rồi gửi lại                                            |
| 413  | `PAYLOAD_TOO_LARGE`                                                       | Body quá lớn                                   | Toast                                                      |
| 422  | `INVALID_PASSWORD`, `PASSWORD_UNCHANGED`                                  | Đổi mật khẩu không hợp lệ                      | Báo tại ô `field`                                          |
| 422  | `TEACHER_NOT_FOUND`, `TEACHER_ROLE_REQUIRED`, `BRANCH_NOT_FOUND`          | Tham chiếu sai                                 | Báo tại ô `field`                                          |
| 422  | `REFERENCE_NOT_FOUND`                                                     | Tham chiếu sai, chưa có mã riêng               | Hiện `message`                                             |
| 422  | `IDEMPOTENCY_KEY_REUSED`                                                  | Dùng lại key cho body khác                     | Lỗi lập trình: sinh key mới cho mỗi lần submit             |
| 423  | `ACCOUNT_LOCKED`                                                          | Khóa tạm 15 phút                               | Hiện `message` và `locked_until`                           |
| 500  | `INTERNAL_ERROR`                                                          | Lỗi hệ thống                                   | Toast chung, cho phép thử lại                              |

Lưu ý: `BRANCH_NOT_FOUND` trả `404` ở `PATCH /branches/{id}`, nhưng trả `422` khi là cơ sở được tham chiếu trong body (`branch_id`, `branch_ids`). FE nên rẽ nhánh theo `code` + `field`, không chỉ theo HTTP status.

Message của `VALIDATION_ERROR` sinh tự động, ví dụ `"Quá nhỏ: mong đợi string có >=8 ký tự"`. FE nên validate trước ở form với câu chữ của mình; lỗi từ API chỉ là lớp bảo vệ cuối.

## 9. Ràng buộc nhập liệu (để validate ở form)

| Trường                               | Ràng buộc                                      |
| ------------------------------------ | ---------------------------------------------- |
| `phone`                              | `^0[0-9]{9}$`                                  |
| `password`, `new_password`           | 8–128 ký tự                                    |
| `full_name`                          | 1–100 ký tự (sau khi bỏ khoảng trắng đầu/cuối) |
| `name` (cơ sở, phòng), `center_name` | 1–100 ký tự                                    |
| `address`                            | Tối đa 500 ký tự                               |
| `capacity`                           | Số nguyên 1–1000                               |
| `revenue_target`                     | Số nguyên ≥ 0                                  |
| `logo_url`                           | URL hợp lệ, tối đa 2048 ký tự                  |
| `branch_ids`                         | Tối đa 100 phần tử, mỗi phần tử là UUID        |

## 10. Chưa có ở phase 0

- `GET /users/{id}` (xem chi tiết), tìm kiếm và lọc ở `GET /users`. FE lấy dữ liệu từ dòng trong danh sách.
- Xóa cơ sở và xóa phòng.
- Upload logo.
- Nhân viên và giáo viên chưa đọc được tên và logo trung tâm, vì `GET /settings` chỉ dành cho Admin. Đang chờ chốt cách làm.
- Trường kênh nhắc và giờ gửi trong cài đặt: phase 5.
