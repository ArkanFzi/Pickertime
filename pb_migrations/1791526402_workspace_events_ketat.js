/// <reference path="../pb_data/types.d.ts" />

// T-21 (CFG-15): `Workspace_Events` adalah prasyarat loop belajar, tapi sampai migrasi ini
// kolomnya tidak bisa diandalkan untuk menambang:
//   - `event_type` text bebas tanpa batasan. Satu-satunya penulisnya `app/focus.tsx:15`,
//     yang union TS-nya sudah berisi lima nilai tetap (START_FOCUS, STOP_FOCUS, PAUSE_FOCUS,
//     RESET_FOCUS, SESSION_COMPLETE) — skema tidak menegakkan apa yang sudah dijanjikan kode.
//   - waktu kejadian HANYA ada di dalam `payload.timestamp`. Kolom `created` adalah waktu
//     tulis, bukan waktu fokus; untuk penulis yang menjalankan pekerjaannya di luar jam
//     perangkat keduanya berbeda, dan filter per-hari tidak bisa dibangun di atas JSON.
//   - tidak ada indeks apa pun pada koleksi ini.
//
// Kenapa `pattern` dan bukan `select`: id field PocketBase dihitung dari tipe + crc32 nama
// (`text2467634050` -> `select2467634050`), dan `syncRecordTableSchema` membandingkan field
// BERDASARKAN id. Ganti tipe = field lama dianggap hilang = kolom di-DROP lalu dibuat ulang,
// jadi nilai baris yang sudah ada ikut musnah. `pattern` mengubah opsi tanpa mengubah id.
// (crc32 terukur dengan node:zlib: event_type = 2467634050, occurred_at = 2277522715 —
// keduanya identik dengan id yang dipakai migrasi ini, jadi tidak ada tabrakan id.)
//
// URUTAN LANGKAH ITU BAGIAN KONTRAKNYA, bukan kerapian. Terukur 2026-10-09 pada
// pocketbase:0.40.4 (kontainer uji, 3 baris legacy termasuk satu `event_type` di luar daftar):
//   - mengubah skema lewat API SAAT ada baris yang menabrak pattern -> HTTP 200 (diterima),
//   - menulis baris legacy yang sama SETELAH pattern terpasang -> HTTP 400
//     `{"event_type":{"code":"validation_invalid_format","message":"Invalid value format."}}`,
//     termasuk untuk mengubah `is_processed` — yang persis kebutuhan F-62 dan loop belajar.
// Draf pertama migrasi ini memasang pattern lebih dulu lalu menelusuri baris untuk backfill,
// dan mati di baris legacy: `failed to apply migration ... event_type: Invalid value format.`
// Karena satu migrasi = satu transaksi, kegagalan itu me-rollback seluruh perubahan (terukur:
// skema kembali tanpa pattern, 3 baris utuh) — jadi kegagalannya aman, tapi tidak selesai.
// Karena itu normalisasi baris terjadi di langkah 2, SEBELUM pattern dipasang di langkah 3.
migrate((app) => {
  const EVENTS = ['START_FOCUS', 'STOP_FOCUS', 'PAUSE_FOCUS', 'RESET_FOCUS', 'SESSION_COMPLETE'];
  // Nilai untuk baris lama yang `event_type`-nya tidak ada di daftar. Barisnya TIDAK dihapus
  // dan TIDAK dipaksakan jadi salah satu dari EVENTS: menebak perilaku dari teks yang tidak
  // dikenal sama dengan memalsukan data yang nanti ditambang. SENTINEL hanya boleh muncul pada
  // baris yang lewat migrasi ini — aplikasi tidak pernah menulisnya.
  const SENTINEL = 'UNKNOWN';
  const PAGE = 200;

  // 1. `occurred_at` dulu: menambah kolom date yang tidak wajib tidak bisa menabrak baris lama.
  //    `required: false` karena build aplikasi yang sudah terpasang di perangkat belum mengirim
  //    field ini — memaksanya akan membuat SEMUA penulisan event balikan 400 sampai aplikasi
  //    ikut di-update. Aplikasi mengirimnya mulai commit ini; baris lama diisi di langkah 2.
  const col = app.findCollectionByNameOrId('Workspace_Events');
  col.fields.add(new Field({
    help: '',
    hidden: false,
    id: 'date2277522715',
    max: '',
    min: '',
    name: 'occurred_at',
    presentable: false,
    required: false,
    system: false,
    type: 'date',
  }));
  app.save(col);

  // 2. Normalisasi + backfill per baris, sebelum pattern ada (lihat catatan urutan di atas).
  //    PENJAGA "kalau occurred_at masih kosong" SENGAJA tidak ada, dan alasannya terukur:
  //    pada JSVM pocketbase 0.40.4, `rec.get('occurred_at')` untuk kolom date yang baru
  //    dibuat mengembalikan nilai non-empty (lewat API nilainya `""`, tapi model Go memberi
  //    placeholder tanggal nol) sehingga `if (rec.get(...))` bernilai BENAR untuk semua baris — draf
  //    pertama migrasi ini karena itu mencetak `sudahAda=3` dan tidak mengisi satu apa pun.
  //    Kolomnya baru saja dibuat di langkah 1, jadi "semua baris belum punya occurred_at"
  //    adalah fakta struktur, bukan sesuatu yang perlu diperiksa per baris.
  let total = 0, dinormalisasi = 0, dariPayload = 0, fallbackCreated = 0, contohKosong = '(tidak diamati)';
  for (let ronde = 0; ronde < 500; ronde++) {
    const recs = app.findRecordsByFilter('Workspace_Events', 'id != ""', 'id', PAGE, ronde * PAGE);
    if (!recs || recs.length === 0) break;
    for (const rec of recs) {
      total++;

      const jenis = rec.get('event_type');
      if (!EVENTS.includes(jenis) && jenis !== SENTINEL) {
        rec.set('event_type', SENTINEL);
        dinormalisasi++;
      }

      // Diambil SEBELUM set(), hanya untuk mencatat bentuk "kosong" yang sebenarnya di log.
      if (total === 1) contohKosong = JSON.stringify(rec.get('occurred_at'));

      let ts = null;
      try {
        // `rec.get('payload')` TIDAK bisa dipakai langsung: pada pocketbase 0.40.4 field `json`
        // muncul di JSVM sebagai bungkus []byte (terukur: `typeof=object`, `ctor=Array`,
        // keys "0..n" + `marshalJSON,scan,string,unmarshalJSON,value`), sehingga
        // `raw.timestamp` = undefined dan `JSON.parse(raw)` tidak pernah dijalankan —
        // draf pertama migrasi ini karena itu mencetak dariPayload=0. `rec.getString()`
        // memberi teks JSON-nya (terukur: `"{\"catatan\":...}"`).
        const text = rec.getString('payload');
        const payload = text ? JSON.parse(text) : null;
        if (payload && payload.timestamp) ts = String(payload.timestamp);
      } catch { ts = null; }
      if (ts) {
        rec.set('occurred_at', ts);
        dariPayload++;
      } else {
        // Payload tidak bisa dipercaya -> pakai waktu tulis. Ini dugaan terbaik, bukan fakta,
        // dan ditandai di log supaya mudah ditelusuri kalau kebiasaan yang ditambang meleset.
        rec.set('occurred_at', rec.get('created'));
        fallbackCreated++;
      }
      app.save(rec);
    }
    if (recs.length < PAGE) break;
  }

  // 3. Baru sekarang pattern ditegakkan — semua baris sudah conform, jadi tidak ada yang
  //    terkunci dari penulisan berikutnya. `id` sengaja disamakan dengan snapshot supaya
  //    PocketBase memperlakukannya sebagai perubahan opsi, bukan hapus-tambah kolom.
  //    Bentuk objek ditulis eksplisit (bukan `{...field lama}`) karena objek field JSVM
  //    adalah bungkus Go — menyebarinya tidak menghasilkan JSON.
  const fresh = app.findCollectionByNameOrId('Workspace_Events');
  fresh.fields.removeById('text2467634050');
  fresh.fields.add(new Field({
    autogeneratePattern: '',
    help: '',
    hidden: false,
    id: 'text2467634050',
    max: 0,
    min: 0,
    name: 'event_type',
    pattern: '^(' + EVENTS.concat(SENTINEL).join('|') + ')$',
    presentable: false,
    primaryKey: false,
    required: true,
    system: false,
    type: 'text',
  }));
  app.save(fresh);

  // 4. Indeks jalur baca: per user, diurut/dibatasi per waktu kejadian.
  app.db().createIndex('Workspace_Events', 'idx_events_user_occurred', 'user', 'occurred_at').execute();

  console.log(`[T-21] baris=${total} dinormalisasi=${dinormalisasi} `
    + `occurred_at{dariPayload=${dariPayload} fallbackCreated=${fallbackCreated}} `
    + `kosongSebelumSet=${contohKosong} pattern=${EVENTS.length + 1} nilai indeks=idx_events_user_occurred`);
}, (app) => {
  // Rollback mengubah SKEMA, bukan DATA: nilai `UNKNOWN` hasil normalisasi tidak bisa
  // dikembalikan ke teks aslinya (teks itu sudah ditimpa di langkah 2). Sengaja tidak
  // dibuat "pintar" dengan menebak — kalau perlu nilai lama, pulihkan dari backup pb_data.
  const col = app.findCollectionByNameOrId('Workspace_Events');

  app.db().dropIndex('Workspace_Events', 'idx_events_user_occurred').execute();

  col.fields.removeByName('occurred_at');
  col.fields.removeById('text2467634050');
  col.fields.add(new Field({
    autogeneratePattern: '',
    help: '',
    hidden: false,
    id: 'text2467634050',
    max: 0,
    min: 0,
    name: 'event_type',
    pattern: '',
    presentable: false,
    primaryKey: false,
    required: true,
    system: false,
    type: 'text',
  }));

  app.save(col);
})
