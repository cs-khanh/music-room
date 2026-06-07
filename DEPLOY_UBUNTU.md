# Deploy Music Room trên Ubuntu không Docker

Hướng dẫn này giả định:

- Frontend chạy local port `2345`.
- Backend API + Socket.IO chạy local port `2346`.
- MySQL cài trực tiếp trên Ubuntu.
- Domain đi qua Cloudflare Tunnel.
- Ví dụ domain:
  - Frontend: `https://music.example.com`
  - Backend/API/socket: `https://api.music.example.com`

Thay domain ví dụ bằng domain thật của bạn.

## 1. Cài dependency hệ thống

```bash
sudo apt update
sudo apt install -y curl git build-essential mysql-server
```

Cài Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Cài PM2 để chạy app nền:

```bash
sudo npm install -g pm2
```

## 2. Setup MySQL

Mở MySQL:

```bash
sudo mysql
```

Tạo database và user:

```sql
CREATE DATABASE music_room CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'music_room_user'@'localhost' IDENTIFIED BY 'CHANGE_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON music_room.* TO 'music_room_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`DATABASE_URL` sẽ là:

```env
mysql://music_room_user:CHANGE_STRONG_PASSWORD@localhost:3306/music_room
```

## 3. Clone code và cài package

```bash
cd /var/www
sudo git clone <YOUR_REPO_URL> music-room
sudo chown -R $USER:$USER /var/www/music-room
cd /var/www/music-room
npm ci
```

Nếu bạn upload source thủ công thay vì clone git, chỉ cần đặt source vào `/var/www/music-room` rồi chạy `npm ci`.

## 4. Tạo env production

### Backend env

Tạo `backend/.env`:

```bash
nano backend/.env
```

Nội dung mẫu:

```env
PORT=2346
FRONTEND_URL=https://music.example.com
DATABASE_URL="mysql://music_room_user:CHANGE_STRONG_PASSWORD@localhost:3306/music_room"

JWT_ACCESS_SECRET=GENERATE_A_LONG_RANDOM_SECRET_FOR_ACCESS
JWT_REFRESH_SECRET=GENERATE_A_LONG_RANDOM_SECRET_FOR_REFRESH
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_V3_KEY
```

Tạo secret bằng lệnh:

```bash
openssl rand -base64 48
```

Chạy 2 lần, một lần cho `JWT_ACCESS_SECRET`, một lần cho `JWT_REFRESH_SECRET`.

### Frontend env

Tạo `frontend/.env.local`:

```bash
nano frontend/.env.local
```

Nội dung mẫu:

```env
NEXT_PUBLIC_API_URL=https://api.music.example.com
NEXT_PUBLIC_SOCKET_URL=https://api.music.example.com
```

Không đưa `YOUTUBE_API_KEY` vào frontend. Key YouTube chỉ để trong `backend/.env`.

## 5. Prisma generate và migrate DB

```bash
npm run prisma:generate -w backend
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

Nếu migrate lỗi kết nối MySQL, kiểm tra lại:

```bash
mysql -u music_room_user -p music_room
```

## 6. Build production

Build shared trước, sau đó backend và frontend:

```bash
npm run build -w shared
npm run build -w backend
npm run build -w frontend
```

## 7. Chạy app bằng PM2

Backend:

```bash
pm2 start "node backend/dist/main.js" --name music-room-backend --cwd /var/www/music-room
```

Frontend:

```bash
pm2 start "npm run start -w frontend -- -p 2345" --name music-room-frontend --cwd /var/www/music-room
```

Lưu PM2 để tự chạy lại sau reboot:

```bash
pm2 save
pm2 startup
```

Lệnh `pm2 startup` sẽ in ra một command `sudo ...`; copy command đó và chạy lại.

Kiểm tra:

```bash
pm2 status
pm2 logs music-room-backend
pm2 logs music-room-frontend
```

Test local trên server:

```bash
curl http://localhost:2345
curl http://localhost:2346/auth/me
```

`/auth/me` có thể trả `401 Unauthorized`, miễn là backend có response là được.

## 8. Cloudflare Tunnel

Cài `cloudflared` theo hướng dẫn Cloudflare, sau đó tạo tunnel.

Ví dụ file config:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: music.example.com
    service: http://localhost:2345
  - hostname: api.music.example.com
    service: http://localhost:2346
  - service: http_status:404
```

Chạy tunnel:

```bash
cloudflared tunnel run <TUNNEL_NAME>
```

Cài tunnel chạy nền:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

Trong Cloudflare DNS, hostname `music.example.com` và `api.music.example.com` phải trỏ vào tunnel.

## 9. Redis có cần setup không?

Hiện tại codebase chưa dùng Redis.

Trong `backend/.env.example` có `REDIS_URL`, nhưng source hiện tại không import Redis client, không dùng cache Redis, và Socket.IO cũng chưa dùng Redis adapter. Vì vậy production hiện tại không cần cài Redis.

Khi nào cần Redis:

- Chạy nhiều backend instance cùng lúc.
- Muốn Socket.IO sync qua nhiều process/server.
- Muốn cache search YouTube ngoài MySQL.
- Muốn queue/job nền.

Với deploy một backend instance qua PM2 như hướng dẫn này, bỏ `REDIS_URL` cũng được.

## 10. WebSocket setup thế nào?

WebSocket đang chạy bằng Socket.IO trong NestJS backend, chung port với REST API.

Vì backend chạy `PORT=2346`, frontend phải dùng:

```env
NEXT_PUBLIC_SOCKET_URL=https://api.music.example.com
```

Cloudflare Tunnel hỗ trợ WebSocket, nên không cần mở port WebSocket riêng. Chỉ cần route `api.music.example.com` vào `http://localhost:2346`.

Lưu ý:

- `FRONTEND_URL` trong `backend/.env` phải đúng frontend domain, ví dụ `https://music.example.com`, để CORS cho REST và Socket.IO hoạt động.
- Không chạy nhiều backend instance nếu chưa thêm Redis adapter cho Socket.IO. Nếu PM2 cluster nhiều instance, user trong cùng room có thể bị lệch socket state.
- Dùng PM2 mode thường như hướng dẫn là ổn.

## 11. Deploy update code lần sau

Mỗi lần pull code mới:

```bash
cd /var/www/music-room
git pull
npm ci
npm run prisma:generate -w backend
npx prisma migrate deploy --schema backend/prisma/schema.prisma
npm run build -w shared
npm run build -w backend
npm run build -w frontend
pm2 restart music-room-backend
pm2 restart music-room-frontend
```

## 12. Checklist nhanh khi lỗi

Backend không chạy:

```bash
pm2 logs music-room-backend
cat backend/.env
```

Frontend không gọi được API:

```bash
cat frontend/.env.local
cat backend/.env
```

Kiểm tra `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `FRONTEND_URL`.

Socket không sync room:

```bash
pm2 logs music-room-backend
```

Kiểm tra browser DevTools Network tab có request `socket.io` tới `https://api.music.example.com/socket.io/...` không.

YouTube search lỗi:

- Kiểm tra `YOUTUBE_API_KEY`.
- Kiểm tra quota YouTube Data API v3.
- Không đặt key này trong frontend.

