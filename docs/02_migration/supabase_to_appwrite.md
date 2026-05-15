# Migration Guide: Supabase to Appwrite

## 1. Persiapan SDK
Ganti dependensi di `package.json`:
*   *Hapus:* `@supabase/supabase-js`
*   *Tambah:* `react-native-appwrite`

## 2. Inisialisasi Project
Ubah file `lib/supabase.ts` (atau buat file baru `lib/appwrite.ts`):
```typescript
import { Client, Account, Databases } from 'react-native-appwrite';

const client = new Client()
    .setEndpoint('https://api.server-anda.com/v1')
    .setProject('PROJECT_ID_ANDA');

export const account = new Account(client);
export const databases = new Databases(client);
```

## 3. Perubahan Logika Auth
Supabase menggunakan `auth.signIn()`, sedangkan Appwrite menggunakan `account.createEmailSession()`. Skema data user tetap bisa dipertahankan di dalam koleksi `Profiles`.

## 4. Perubahan Query Database
*   **Supabase:** `supabase.from('tasks').select('*')`
*   **Appwrite:** `databases.listDocuments('DB_ID', 'COLLECTION_ID')`

## 5. Webhooks & Realtime
Appwrite memiliki fitur "Events" yang sangat kuat. Setiap ada perubahan di koleksi `Tasks`, server bisa mengirimkan sinyal ke OpenClaw secara otomatis tanpa perlu *polling* manual yang berat.
