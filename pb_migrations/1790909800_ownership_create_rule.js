/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // F-03: createRule cuma memeriksa "ada auth", jadi user A bisa menulis task,
  // sesi fokus, atau event atas nama user B — dan baris itu tidak bisa dibaca
  // maupun dibersihkan oleh pemilik yang benar (list/update/delete sudah terikat).
  // `user = @request.auth.id` terbukti menolak penulisan atas nama user lain DAN
  // menolak task tanpa pemilik pada PocketBase 0.40.4, sementara tulis atas nama
  // sendiri tetap jalan; varian `@request.data.user` ditolak saat simpan koleksi.
  const owned = ['Tasks', 'Focus_Sessions', 'Workspace_Events'];
  for (const name of owned) {
    const col = app.findCollectionByNameOrId(name);
    col.createRule = '@request.auth.id != "" && user = @request.auth.id';
    app.save(col);
  }
}, (app) => {
  const owned = ['Tasks', 'Focus_Sessions', 'Workspace_Events'];
  for (const name of owned) {
    const col = app.findCollectionByNameOrId(name);
    col.createRule = '@request.auth.id != ""';
    app.save(col);
  }
})
