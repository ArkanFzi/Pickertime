// Membedakan "sesi berakhir" dari "user logout sendiri" (F-56).
//
// Token auth PocketBase berumur 5 hari (snapshot Profiles.authToken.duration = 432000) dan
// aplikasi tidak punya authRefresh, jadi SDK menghapus authStore di respons 401 pertama.
// Tanpa penanda ini, user yang sedang di tengah fokus dilempar ke layar welcome tanpa pesan
// apa pun — terlihat seperti aplikasinya hangus, bukan sesi yang habis.
//
// Modul ini sengaja murni (tanpa React, tanpa PocketBase) supaya bisa dinilai di node.

export type SessionEndReason = 'expired' | 'logout'

let reason: SessionEndReason | null = null
let wasAuthenticated = false

/**
 * Dipanggil dari `pb.authStore.onChange`. SDK memanggil listener ini **segera** saat
 * dilangganan (terukur di `node_modules/pocketbase/dist/pocketbase.es.mjs`), jadi keadaan
 * "token kosong" pertama ketika aplikasi baru dibuka bukan bukti sesi berakhir.
 */
export function observeAuthChange(token: string | null, model: unknown): SessionEndReason | null {
  const authenticated = !!token && !!model
  if (authenticated) {
    wasAuthenticated = true
    reason = null
  } else if (wasAuthenticated) {
    wasAuthenticated = false
    if (!reason) reason = 'expired'
  }
  return reason
}

/** Dipanggil sebelum logout yang memang disengaja, supaya tidak dibaca sebagai kedaluwarsa. */
export function markIntentionalLogout(): void {
  reason = 'logout'
}

export function sessionEndReason(): SessionEndReason | null {
  return reason
}

export function clearSessionEndReason(): void {
  reason = null
}

/** Hanya untuk alat uji: mengembalikan keadaan modul ke awal. */
export function resetSessionState(): void {
  reason = null
  wasAuthenticated = false
}
