// F-02 diuji dengan kolektor tiruan supaya tidak butuh server: satu batch yang ditolak
// tidak boleh menyisakan satu baris pun, entah ditolak validasi klien atau oleh server
// di tengah jalan. node >= 22.18 dibutuhkan untuk membaca lib/taskContract.ts langsung.
import { createTaskBatch, taskPayloadError, TASK_CATEGORIES } from '../../lib/taskContract.ts'

const payload = (over = {}) => ({
  user: 'u1', title: 'T', category: 'Study', priority: 'Medium',
  start_time: '2026-10-07T10:00:00.000Z', end_time: '2026-10-07T11:00:00.000Z',
  duration_minutes: 60, ...over,
})

let bad = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'GREEN' : 'RED  '} ${name}${detail ? ` :: ${detail}` : ''}`)
  if (!ok) bad++
}

// 1) validasi klien menolak sebelum ada satu pun tulis
{
  let creates = 0
  const writer = {
    create: async () => { creates++; return { id: `r${creates}` } },
    remove: async () => {},
  }
  let message = null
  try {
    await createTaskBatch(writer, [payload(), payload({ title: 'Kategori haram', category: 'Creative' })])
  } catch (err) {
    message = err.message
  }
  check('F-02a kategori di luar select menolak tanpa menulis', creates === 0 && !!message, `creates=${creates} :: ${message}`)
}

// 2) server menolak di tengah batch -> yang sudah tertulis dibatalkan
{
  const written = []
  const removed = []
  const writer = {
    create: async (data) => {
      if (data.title === 'Rusak') throw new Error('server 400 validation_invalid_value')
      const id = `id${written.length + 1}`
      written.push(id)
      return { id }
    },
    remove: async (id) => { removed.push(id) },
  }
  let message = null
  try {
    await createTaskBatch(writer, [payload({ title: 'A' }), payload({ title: 'B' }), payload({ title: 'Rusak' })])
  } catch (err) {
    message = err.message
  }
  const sameSet = removed.slice().sort().join(',') === written.slice().sort().join(',')
  check('F-02b kegagalan di tengah batch menghapus baris yang tertulis', written.length === 2 && sameSet, `written=${written.join(',')} removed=${removed.join(',')} :: ${message}`)
}

// 3) rollback yang gagal dilaporkan sebagai sisa, bukan disembunyikan
{
  const writer = {
    create: async (data) => {
      if (data.title === 'Rusak') throw new Error('server 500')
      return { id: `id-${data.title}` }
    },
    remove: async () => { throw new Error('delete ditolak') },
  }
  let message = ''
  try {
    await createTaskBatch(writer, [payload({ title: 'A' }), payload({ title: 'Rusak' })])
  } catch (err) {
    message = err.message
  }
  check('F-02c baris yang gagal dihapus disebut di pesan error', message.includes('id-A'), message)
}

// 4) task tunggal lewat jalur yang sama tetap lolos
{
  const writer = { create: async () => ({ id: 'solo' }), remove: async () => {} }
  const created = await createTaskBatch(writer, [payload()])
  check('F-02d batch isi satu menulis seperti biasa', created.length === 1 && created[0].id === 'solo')
}

// 5) detail validasi
check('F-02e title kosong ditolak', taskPayloadError(payload({ title: '   ' })) === 'title wajib diisi')
check('F-02f priority di luar select ditolak', /priority/.test(taskPayloadError(payload({ priority: 'Urgent' })) ?? ''))
check('F-02g payload bersih tidak ditolak', taskPayloadError(payload()) === null)
check('F-02h daftar kategori tidak kosong', TASK_CATEGORIES.length > 0, TASK_CATEGORIES.join(', '))

console.log(bad ? `\n${bad} pemeriksaan F-02 gagal.` : '\nBatch tulis task tidak meninggalkan baris yatim.')
process.exit(bad ? 1 : 0)
