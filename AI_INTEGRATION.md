# 🧠 Dokumentasi Integrasi AI (Pickertime)

Dokumentasi ini menjelaskan arsitektur AI yang digunakan dalam Pickertime, batasan saat ini, dan panduan untuk migrasi ke penyedia lain seperti Groq.

## 🛠️ Arsitektur Saat Ini: Supabase Edge Functions
Demi keamanan, API Key Gemini **tidak lagi disimpan di sisi aplikasi mobile**. Semua permintaan AI dijembatani melalui **Supabase Edge Functions** (`gemini-ai`).

### Keuntungan:
1. **Keamanan:** API Key tersimpan aman di server (Supabase Secrets).
2. **Abstraksi:** Kita bisa mengganti model AI tanpa harus merilis ulang aplikasi mobile.
3. **Control:** Memungkinkan penambahan limitasi akses atau filter konten di server.

---

## ⚠️ Batasan & Tantangan (Current Issues)
Saat ini, penggunaan **Google Gemini Free Tier** memiliki beberapa kendala:
1. **Quota Exceeded (429):** Google memberikan limit ketat pada penggunaan gratis. Terlalu banyak percobaan dalam waktu singkat akan menyebabkan error `Quota exceeded`.
2. **Model Availability:** Beberapa model (seperti `gemini-2.0-flash`) mungkin memiliki ketersediaan yang berbeda-beda tergantung region atau status project.
3. **Cold Start:** Fungsi Edge pertama kali dipanggil mungkin butuh beberapa detik untuk inisialisasi.

---

## ⚡ Opsi Migrasi: Menggunakan Groq (Alternatif Gratis & Cepat)
Jika kamu ingin performa yang lebih cepat dan limit yang lebih longgar, kamu bisa mengganti Gemini dengan **Groq**.

### Langkah 1: Dapatkan API Key Groq
1. Daftar di [console.groq.com](https://console.groq.com/).
2. Buat API Key baru.

### Langkah 2: Update Secrets di Supabase
```bash
# Hapus secret lama (Opsional)
supabase secrets set GROQ_API_KEY=gsk_your_key_here
```

### Langkah 3: Update Kode Edge Function
Ubah `supabase/functions/gemini-ai/index.ts` menjadi seperti ini:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { action, payload } = await req.json()
  const apiKey = Deno.env.get('GROQ_API_KEY')

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are the AI engine for Pickertime productivity app." },
        { role: "user", content: JSON.stringify({ action, payload }) }
      ],
      response_format: { type: "json_object" }
    }),
  })

  const data = await response.json()
  return new Response(JSON.stringify(data.choices[0].message.content), {
    headers: { "Content-Type": "application/json" }
  })
})
```

---

## 📂 Lokasi File Relevan
- **Frontend Logic:** `lib/gemini.ts` (Tempat aplikasi memanggil fungsi).
- **Backend Logic:** `supabase/functions/gemini-ai/index.ts` (Tempat API AI dipanggil).
- **Secrets:** Dikelola via CLI `supabase secrets`.
