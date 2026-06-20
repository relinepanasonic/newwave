export type Lang = 'id' | 'en'

export const t: Record<string, Record<Lang, string>> = {
  // Nav
  dashboard:     { id: 'Dashboard',       en: 'Dashboard' },
  recapschedule: { id: 'Recap Schedule', en: 'Recap Schedule' },
  schedule:      { id: 'Jadwal',          en: 'Schedule' },
  hosts:         { id: 'Host',            en: 'Hosts' },
  onboarding:    { id: 'Onboarding',      en: 'Onboarding' },
  payroll:       { id: 'Gaji',            en: 'Payroll' },
  rooms:         { id: 'Ruangan',         en: 'Rooms' },
  settings:      { id: 'Pengaturan',      en: 'Settings' },
  checkin:       { id: 'Absen',           en: 'Check In/Out' },
  myschedule:    { id: 'Jadwal Saya',     en: 'My Schedule' },
  livereport:    { id: 'Live Report',     en: 'Live Report' },
  clientschedule:{ id: 'Jadwal Live',     en: 'Live Schedule' },
  brandreport:   { id: 'Client',          en: 'Client' },
  clients:       { id: 'Clients',         en: 'Clients' },
  hrd:           { id: 'HRD',             en: 'HRD' },
  invoice:       { id: 'Invoice',         en: 'Invoice' },
  logout:        { id: 'Keluar',          en: 'Logout' },

  // Schedule
  session:       { id: 'Sesi',           en: 'Session' },
  time:          { id: 'Waktu',          en: 'Time' },
  host:          { id: 'Host',           en: 'Host' },
  brand:         { id: 'Brand',          en: 'Brand' },
  platform:      { id: 'Platform',       en: 'Platform' },
  konsep:        { id: 'Konsep',         en: 'Concept' },
  status:        { id: 'Status',         en: 'Status' },
  room:          { id: 'Ruangan',        en: 'Room' },
  date:          { id: 'Tanggal',        en: 'Date' },
  week:          { id: 'Minggu',         en: 'Week' },
  save:          { id: 'Simpan',         en: 'Save' },
  cancel:        { id: 'Batal',          en: 'Cancel' },
  edit:          { id: 'Edit',           en: 'Edit' },
  delete:        { id: 'Hapus',          en: 'Delete' },
  add:           { id: 'Tambah',         en: 'Add' },
  search:        { id: 'Cari',           en: 'Search' },
  export:        { id: 'Ekspor',         en: 'Export' },
  close:         { id: 'Tutup',          en: 'Close' },

  // Dashboard
  totalHosts:    { id: 'Total Host',     en: 'Total Hosts' },
  totalSessions: { id: 'Total Sesi',     en: 'Total Sessions' },
  totalHours:    { id: 'Total Jam',      en: 'Total Hours' },
  thisMonth:     { id: 'Bulan Ini',      en: 'This Month' },
  payPeriod:     { id: 'Periode Gaji',   en: 'Pay Period' },
  sessionToday:  { id: 'Sesi Hari Ini',  en: "Today's Sessions" },

  // Check-in
  clockIn:       { id: 'Mulai Kerja',    en: 'Clock In' },
  clockOut:      { id: 'Selesai Kerja',  en: 'Clock Out' },
  hoursWorked:   { id: 'Jam Kerja',      en: 'Hours Worked' },
  noSchedule:    { id: 'Tidak ada jadwal hari ini', en: 'No schedule today' },

  // Payroll
  hourlyRate:    { id: 'Tarif/Jam',      en: 'Hourly Rate' },
  totalSalary:   { id: 'Total Gaji',     en: 'Total Salary' },
  period:        { id: 'Periode',        en: 'Period' },
  downloadPDF:   { id: 'Unduh PDF',      en: 'Download PDF' },
  downloadExcel: { id: 'Unduh Excel',    en: 'Download Excel' },

  // Status
  scheduled:     { id: 'Dijadwalkan',    en: 'Scheduled' },
  live:          { id: 'Live',           en: 'Live' },
  done:          { id: 'Selesai',        en: 'Done' },
  cancelled:     { id: 'Dibatalkan',     en: 'Cancelled' },

  // Auth
  login:         { id: 'Masuk',          en: 'Login' },
  email:         { id: 'Email',          en: 'Email' },
  password:      { id: 'Kata Sandi',     en: 'Password' },
  welcomeBack:   { id: 'Selamat Datang', en: 'Welcome Back' },
  loginSubtitle: { id: 'New Wave Live Specialist', en: 'New Wave Live Specialist' },
}

export function tr(key: string, lang: Lang): string {
  return t[key]?.[lang] ?? key
}
