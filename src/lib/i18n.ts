export type Lang = 'id' | 'en'

export const t: Record<string, Record<Lang, string>> = {
  // Nav
  dashboard:     { id: 'Dashboard',       en: 'Dashboard' },
  recapschedule: { id: 'Recap Schedule', en: 'Schedule Recap' },
  schedule:      { id: 'Jadwal',          en: 'Schedule' },
  hosts:         { id: 'Host',            en: 'Hosts' },
  onboarding:    { id: 'Onboarding',      en: 'Onboarding' },
  payroll:       { id: 'Gaji',            en: 'Payroll' },
  rooms:         { id: 'Ruangan',         en: 'Rooms' },
  settings:      { id: 'Pengaturan',      en: 'Settings' },
  checkin:       { id: 'Absen',           en: 'Check In/Out' },
  myschedule:    { id: 'Jadwal Saya',     en: 'My Schedule' },
  pralive:       { id: 'Pra-Live',         en: 'Pre-Live' },
  livereport:    { id: 'Live Report',     en: 'Live Report' },
  kasbon:        { id: 'Kasbon',           en: 'Cash Advance' },
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

  // Page descriptions
  hrdDesc:         { id: 'Manajemen host & penggajian',              en: 'Host management & payroll' },
  hostsDesc:       { id: 'Kelola Host, Client & Ruangan',            en: 'Manage Hosts, Clients & Rooms' },
  praLiveDesc:     { id: 'Upload foto look sebelum mulai live',      en: 'Upload your look photo before going live' },
  liveReportDesc:  { id: 'Submit laporan setiap selesai live',       en: 'Submit your report after each live session' },
  recapDesc:       { id: 'Rekap jadwal live semua host per periode', en: 'Live schedule summary for all hosts' },
  clientsDesc:     { id: 'Manajemen client, jadwal live & invoice',  en: 'Manage clients, live schedule & invoices' },
  blackoutTitle:   { id: 'Jam Diblokir',                            en: 'Blocked Hours' },
  blackoutDesc:    { id: 'Waktu di mana client tidak bisa live',     en: 'Time windows when clients cannot go live' },
  scheduleDesc:    { id: 'Jadwal live mingguan',                     en: 'Weekly live schedule' },
  payrollDesc:     { id: 'Penggajian & slip gaji host',              en: 'Host salary & payslips' },
  roomsDesc:       { id: 'Kelola ruangan live',                      en: 'Manage live rooms' },
  checkinDesc:     { id: 'Absen masuk & keluar kerja',               en: 'Clock in & out for your shift' },
  myScheduleDesc:  { id: 'Jadwal live kamu',                         en: 'Your live schedule' },
  clientScheduleDesc: { id: 'Jadwal live brand kamu',                en: 'Your brand live schedule' },
  brandReportDesc: { id: 'Statistik & laporan live',                 en: 'Live statistics & reports' },
  invoiceDesc:     { id: 'Kelola invoice client',                    en: 'Manage client invoices' },

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
