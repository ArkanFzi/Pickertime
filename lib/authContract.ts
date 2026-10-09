// Kontrak permukaan auth PocketBase. Nilai di bawah hasil UKUR terhadap PocketBase 0.40.4
// (container uji lokal, 2026-10-09), bukan tebakan dari dokumentasi — dan modul ini murni
// (tanpa React, tanpa SDK) supaya tools/test/findings.mjs bisa menilainya di node.
//
// Yang terukur:
//   create Profiles duplikat  -> HTTP 400 "Failed to create record."
//                               data.data.email.code = "validation_not_unique" ("Value must be unique.")
//   login email TIDAK ADA     -> HTTP 400 "Failed to authenticate."  data = {}
//   login email ADA, PW salah -> HTTP 400 "Failed to authenticate."  data = {}   (body identik)
//   user verified=false       -> login BERHASIL (requireVerified mati; token duration 432000 = 5 hari)
//   requestPasswordReset      -> HTTP 200 true untuk email terdaftar MAUPUN tidak, dan pada
//                                instance ini smtp.enabled=false + 0 baris log mailer.

export type AuthFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(String(value ?? '').trim());
}

/** Kode yang benar-benar dikirim server untuk email yang sudah dipakai (terukur). */
export const PB_EMAIL_TAKEN_CODE = 'validation_not_unique';

export function isEmailAlreadyRegistered(error: any): boolean {
  const data = error?.response?.data?.data ?? error?.data?.data ?? error?.data ?? {};
  return data?.email?.code === PB_EMAIL_TAKEN_CODE;
}

/**
 * F-38: `requestPasswordReset` bilang `true` walaupun mailer server mati dan walaupun emailnya
 * tidak terdaftar (keduanya terukur). Jadi yang boleh dijanjikan cuma "permintaan diterima".
 */
export function passwordResetCopy(email: string): string {
  return `Permintaan reset untuk ${email} diterima server. Email benar-benar terkirim hanya kalau `
    + 'akun itu ada dan mailer server aktif — itu tidak bisa diperiksa dari aplikasi.';
}

/**
 * Kegagalan transport harus dibedakan dari "akun tidak ditemukan" (F-38).
 * status 0 = permintaan tidak pernah sampai (mati jaringan/VPN/URL salah).
 */
export function describeResetFailure(error: any): string {
  const status = Number(error?.status ?? 0);
  if (status === 0) return 'Permintaan tidak sampai ke server. Periksa koneksi lalu coba lagi.';
  return String(error?.message ?? `Server membalas HTTP ${status}.`);
}

/**
 * F-56: pesan untuk sesi yang habis. SDK membersihkan authStore sendiri saat token ditolak,
 * dan "email tidak dikenal" vs "password salah" tidak bisa dibedakan dari body (terukur
 * identik), jadi pesan login tidak boleh menyalah satu bidang tertentu.
 */
export const SIGN_IN_AMBIGUOUS_MESSAGE = 'Email atau password tidak cocok.';

export function describeSignInFailure(error: any): string {
  const status = Number(error?.status ?? 0);
  if (status === 0) return 'Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.';
  return SIGN_IN_AMBIGUOUS_MESSAGE;
}

export type SignUpForm = {
  name: string;
  email: string;
  password: string;
  role: string;
};

/**
 * Validasi sisi klien untuk form signup yang sebenarnya (nama, email, password, role —
 * layar ini tidak punya kolom konfirmasi password; `passwordConfirm` dikirim sama rata).
 * Ini bukan pengganti aturan server: terukur role di luar select ditolak
 * `validation_invalid_value`, dan password < 8 karakter ditolak `validation_min_length`.
 */
export function validateSignUp(form: SignUpForm): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!String(form.name ?? '').trim()) errors.name = 'Nama wajib diisi.';
  if (!isValidEmail(form.email)) errors.email = 'Format email belum benar.';
  if (String(form.password ?? '').length < 8) errors.password = 'Password minimal 8 karakter.';
  if (!String(form.role ?? '').trim()) errors.role = 'Pilih salah satu peran.';
  return errors;
}

/**
 * F-37: `Profiles.create` lalu `authWithPassword` itu dua langkah non-atomik. Kalau create
 * gagal karena email sudah dipakai, user sekarang punya jalan buntu (retry juga ditolak).
 * Yang bisa dilakukan klien: tawarkan "lanjutkan login" dengan password yang sama.
 *
 * Kedua hasil hanya bisa dibedakan lewat percobaan login, bukan lewat pesan — body error
 * login "email tidak ada" dan "password salah" identik (terukur).
 */
export function duplicateAccountMessage(loginWasTried: boolean): string {
  if (!loginWasTried) {
    return 'Akun dengan email itu sudah ada. Lanjutkan masuk dengan password ini?';
  }
  return 'Akun dengan email itu sudah ada, tapi password ini tidak cocok. Pakai "Forgot password?" untuk masuk.';
}
