Các vấn đề cần khắc phục:
1. Nút Play/Pause thì nên đổi đang thái chỉ giữ 1 cái, implement chức năng các button có trong room: Play/pause, next, sync và button delete trong queue. 
2. Khi user join thì cần update state phòng và hiển thị danh sách user cho tất cả các user khác. Phải đồng bộ state phòng cho tất cả user trong phòng


kill: for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %a