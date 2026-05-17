# 🧠 Dokumentasi Integrasi AI (Pickertime)

Dokumentasi ini menjelaskan arsitektur AI yang digunakan dalam Pickertime, batasan saat ini, dan panduan untuk mengelola API secara mandiri.

## 🛠️ Arsitektur Saat Ini: PocketBase JS Hooks
Demi keamanan, API Key Gemini **tidak lagi disimpan di sisi aplikasi mobile**. Semua permintaan AI dijembatani melalui **PocketBase JS Hooks** (`pb_hooks/ai_proxy.pb.js`).

### Keuntungan:
1. **Keamanan:** API Key tersimpan aman di environment variable server. Tidak ada di source code client.
2. **Abstraksi:** Kita bisa mengganti model AI (misalnya dari Gemini ke Groq atau Ollama) hanya dengan mengubah file hook tanpa harus merilis ulang aplikasi mobile.
3. **Control:** Akses endpoint ini diproteksi oleh PocketBase auth, jadi hanya user login yang bisa menggunakan AI.

---

## ⚠️ Batasan & Tantangan (Current Issues)
Saat ini, penggunaan **Google Gemini Free Tier** memiliki beberapa kendala:
1. **Quota Exceeded (429):** Google memberikan limit ketat pada penggunaan gratis.
2. **Model Availability:** Beberapa model (seperti `gemini-2.0-flash`) memiliki pembatasan *rate limit* yang tinggi.

---

## ⚡ Opsi Migrasi: Menggunakan Groq (Alternatif Gratis & Cepat)
Jika kamu ingin performa yang lebih cepat dan limit yang lebih longgar, kamu bisa mengganti Gemini dengan **Groq**.

### Langkah 1: Dapatkan API Key Groq
1. Daftar di [console.groq.com](https://console.groq.com/).
2. Buat API Key baru.

### Langkah 2: Update Environment Variables
```bash
export GROQ_API_KEY=gsk_your_key_here
./pocketbase serve
```

### Langkah 3: Update Kode Hook PocketBase
Ubah `pb_hooks/ai_proxy.pb.js` agar menembak URL API Groq (`https://api.groq.com/openai/v1/chat/completions`) menggunakan Authorization header `Bearer ${apiKey}`.

---

## 📂 Lokasi File Relevan
- **Frontend Logic:** `lib/gemini.ts` (Tempat aplikasi mobile memanggil proxy lokal).
- **Backend Logic:** `pb_hooks/ai_proxy.pb.js` (Custom route PocketBase yang menembak API AI sesungguhnya).
- **Secrets:** Dikelola via OS Environment Variables (`export GEMINI_API_KEY=...`).

