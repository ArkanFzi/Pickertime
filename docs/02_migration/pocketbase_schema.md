# PocketBase Schema Mapping: Pickertime

Silakan buat koleksi berikut melalui Dashboard PocketBase Anda di `https://api.elarisnoir.my.id/_/`.

## 1. Profiles (Auth Collection)
Gunakan koleksi `users` bawaan atau ubah namanya menjadi `Profiles`.
Tambahkan field berikut:
- `full_name` (Text)
- `role` (Select: Student, Professional, Researcher, Creator, Freelancer)
- `focus_goal` (Text)
- `energy_pref` (Select: Morning, Afternoon, Night Owl)

## 2. Tasks (Base Collection)
Field:
- `user` (Relation: constant to `Profiles`, Single)
- `title` (Text, Non-empty)
- `category` (Select: Work, Study, Health, Personal, etc.)
- `start_time` (DateTime)
- `duration_minutes` (Number)
- `is_completed` (Bool, default: false)
- `has_alarm` (Bool)

## 3. Focus_Sessions (Base Collection)
Field:
- `user` (Relation: `Profiles`)
- `task` (Relation: `Tasks`, Optional)
- `duration_seconds` (Number)
- `completed` (Bool)

## 4. Workspace_Events (Base Collection)
*Koleksi ini sangat penting untuk jembatan OpenClaw.*
Field:
- `user` (Relation: `Profiles`)
- `event_type` (Text: START_FOCUS, STOP_FOCUS, SESSION_COMPLETE)
- `payload` (JSON: {task_title, duration})
- `is_processed` (Bool, default: false)

---

### API Rules (Security)
Untuk setiap koleksi di atas, pastikan untuk mengatur **API Rules**:
- **List/Search**: `user = @request.auth.id`
- **View**: `user = @request.auth.id`
- **Create**: `user = @request.auth.id` (atau `@request.auth.id != ""` jika field user otomatis diisi oleh SDK)
- **Update**: `user = @request.auth.id`
- **Delete**: `user = @request.auth.id`
