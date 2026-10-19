/**
 * Invoice Application Main Logic
 * Supports:
 * - Dynamic rows addition / deletion
 * - Live math calculation (Subtotal, Tax, Total)
 * - Indonesian Terbilang generator
 * - Image logo upload (base64 storage)
 * - Export to clean PDF & browser print
 * - Auto-save & profile management
 */

// Default Currency Formatters
const CURRENCY_CONFIG = {
  IDR: { locale: 'id-ID', currency: 'IDR', prefix: 'Rp ', fractionDigits: 0 },
  USD: { locale: 'en-US', currency: 'USD', prefix: '$', fractionDigits: 2 },
  SGD: { locale: 'en-SG', currency: 'SGD', prefix: 'S$', fractionDigits: 2 },
  EUR: { locale: 'de-DE', currency: 'EUR', prefix: '€', fractionDigits: 2 }
};

// Indonesian Terbilang Helper
function angkaKeTerbilang(nilai) {
  nilai = Math.floor(Math.abs(Number(nilai) || 0));
  const huruf = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  if (nilai < 12) {
    return huruf[nilai];
  } else if (nilai < 20) {
    return angkaKeTerbilang(nilai - 10) + ' Belas';
  } else if (nilai < 100) {
    return angkaKeTerbilang(Math.floor(nilai / 10)) + ' Puluh ' + huruf[nilai % 10];
  } else if (nilai < 200) {
    return 'Seratus ' + angkaKeTerbilang(nilai - 100);
  } else if (nilai < 1000) {
    return angkaKeTerbilang(Math.floor(nilai / 100)) + ' Ratus ' + angkaKeTerbilang(nilai % 100);
  } else if (nilai < 2000) {
    return 'Seribu ' + angkaKeTerbilang(nilai - 1000);
  } else if (nilai < 1000000) {
    return angkaKeTerbilang(Math.floor(nilai / 1000)) + ' Ribu ' + angkaKeTerbilang(nilai % 1000);
  } else if (nilai < 1000000000) {
    return angkaKeTerbilang(Math.floor(nilai / 1000000)) + ' Juta ' + angkaKeTerbilang(nilai % 1000000);
  } else if (nilai < 1000000000000) {
    return angkaKeTerbilang(Math.floor(nilai / 1000000000)) + ' Miliar ' + angkaKeTerbilang(nilai % 1000000000);
  } else {
    return angkaKeTerbilang(Math.floor(nilai / 1000000000000)) + ' Triliun ' + angkaKeTerbilang(nilai % 1000000000000);
  }
}

// English Number to Words Helper
function numberToWordsEnglish(amount, currency = 'IDR') {
  amount = Math.floor(Math.abs(Number(amount) || 0));
  if (amount === 0) return currency === 'IDR' ? 'Zero Rupiah' : 'Zero';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

  function convertGroup(n) {
    let s = '';
    if (n >= 100) {
      s += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      s += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + units[n % 10] : '') + ' ';
    } else if (n > 0) {
      s += units[n] + ' ';
    }
    return s.trim();
  }

  let words = [];
  let scaleIdx = 0;
  let num = amount;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk !== 0) {
      const chunkStr = convertGroup(chunk);
      const scaleStr = scales[scaleIdx];
      words.unshift((chunkStr + (scaleStr ? ' ' + scaleStr : '')).trim());
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }

  const result = words.join(' ').trim();
  if (currency === 'IDR') {
    return `${result} Rupiah`;
  } else if (currency === 'USD') {
    return `${result} US Dollars`;
  } else if (currency === 'SGD') {
    return `${result} Singapore Dollars`;
  } else if (currency === 'EUR') {
    return `${result} Euros`;
  }
  return result;
}

// Date Format Helpers (DD/MM/YYYY - Hari/Bulan/Tahun)
function formatToDMY(dateInput) {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const d = String(dateInput.getDate()).padStart(2, '0');
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const y = dateInput.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const str = String(dateInput).trim();
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  // YYYY-MM-DD (ISO standard from native <input type="date">)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  // D/M/YYYY or DD/MM/YY
  const slashParts = str.split('/');
  if (slashParts.length === 3 && slashParts[0] && slashParts[1] && slashParts[2]) {
    const d = slashParts[0].padStart(2, '0');
    const m = slashParts[1].padStart(2, '0');
    let y = slashParts[2];
    if (y.length === 2) y = '20' + y;
    if (y.length === 4) return `${d}/${m}/${y}`;
  }
  // DD-MM-YYYY or YYYY-MM-DD
  const dashParts = str.split('-');
  if (dashParts.length === 3 && dashParts[0] && dashParts[1] && dashParts[2]) {
    if (dashParts[0].length === 4) {
      return `${dashParts[2].padStart(2, '0')}/${dashParts[1].padStart(2, '0')}/${dashParts[0]}`;
    } else {
      let y = dashParts[2];
      if (y.length === 2) y = '20' + y;
      if (y.length === 4) return `${dashParts[0].padStart(2, '0')}/${dashParts[1].padStart(2, '0')}/${y}`;
    }
  }
  // Incomplete string like "21", "21/", "21/09"
  if (/^[\d/]+$/.test(str) && str.length < 10) {
    return str;
  }
  // Fallback Date object parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return str;
}

function formatToISO(dmyStr) {
  if (!dmyStr) return '';
  const str = String(dmyStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return '';
}

// Vendor Presets for Video, Photo & Photobooth (Indonesian)
const VENDOR_PRESETS_ID = {
  video: {
    name: 'Paket Video Dokumentasi Event',
    description: 'Layanan Video Dokumentasi Profesional:\n- 1-2 Videografer Standby Full Day Event\n- 1 Video Cinematic Highlight (Durasi 1-3 Menit, Resolusi 4K / Full HD)\n- 1 Video Dokumentasi Lengkap Acara (Full Dokumenter)\n- 1 Video Teaser / Reels / TikTok (Format Vertikal 9:16, 30-60 Detik)\n- Pengambilan Gambar Drone Aerial (Opsional jika area mendukung)\n- Audio Mastering & Color Grading Profesional\n- Seluruh File Master Video Diserahkan via Google Drive',
    qty: 1,
    price: 2500000,
    tax: 0
  },
  photo: {
    name: 'Paket Foto Dokumentasi Event',
    description: 'Layanan Fotografi Profesional:\n- 1-2 Fotografer Standby Full Day Event\n- Unlimited Shoots selama acara berlangsung\n- 50-100 Foto Pilihan Diedit (Color Correction & Retouch High-Res)\n- Seluruh File Foto Original (JPEG High Quality)\n- Penyerahan File via Link Cloud Google Drive (Aktif 3 Bulan)',
    qty: 1,
    price: 1700000,
    tax: 0
  },
  photobooth: {
    name: 'Paket Photobooth Unlimited (3 Jam)',
    description: 'Layanan Photobooth Instan Premium:\n- Durasi Operasional 3 Jam Cetak Unlimited (Ukuran 4R / Strip 2x6)\n- Mesin Cetak Cepat Thermal Printer High Speed (Cetak 11 Detik)\n- Custom Desain Frame / Template Overlay Sesuai Tema Event / Logo Klien\n- Studio Lighting & Perlengkapan Fun Props (Aksesoris Lucu & Properti)\n- 2 Orang Crew Standby (1 Fotografer + 1 Operator Cetak)\n- QR Code Scan Instan untuk Unduh Foto Softcopy Langsung di Tempat\n- Seluruh File Foto Master Softcopy Diserahkan via Google Drive',
    qty: 1,
    price: 2200000,
    tax: 0
  },
  combo: {
    name: 'Paket Bundling All-In (Foto + Video + Photobooth)',
    description: 'Paket Dokumentasi Komplit & Photobooth Spesial:\n- 2 Fotografer + 2 Videografer Standby Full Day Event\n- 1 Video Cinematic Highlight (1-3 Menit) + 1 Teaser Reels (60 Detik) + Full Documenter\n- Unlimited Photo Shoots + 100 Edited High-Res Photos\n- Photobooth Unlimited 3 Jam (Frame Custom, Lighting Studio, Fun Props, Operator)\n- Instant QR Code Download Softcopy untuk Tamu / Undangan\n- Penyerahan Seluruh Master File Foto & Video via Google Drive (Aktif 3 Bulan)',
    qty: 1,
    price: 5800000,
    tax: 0
  }
};

// Vendor Presets for Video, Photo & Photobooth (English)
const VENDOR_PRESETS_EN = {
  video: {
    name: 'Event Video Documentation Package',
    description: 'Professional Video Documentation Services:\n- 1-2 Professional Videographers on standby full-day event\n- 1 Cinematic Highlight Video (1-3 Minutes, 4K / Full HD Resolution)\n- 1 Full Event Documentation Video (Full Length Documentary)\n- 1 Social Media Teaser / Reels / TikTok (Vertical 9:16 format, 30-60 sec)\n- Aerial Drone Footage (Optional subject to venue clearance)\n- Professional Audio Mastering & Color Grading\n- All Master Video Files delivered via private Google Drive link',
    qty: 1,
    price: 2500000,
    tax: 0
  },
  photo: {
    name: 'Event Photography Documentation Package',
    description: 'Professional Photography Services:\n- 1-2 Professional Photographers on standby full-day event\n- Unlimited high-resolution photo shoots during the event\n- 50-100 Selected & Edited High-Res Photos (Color Correction & Retouch)\n- All Original Photos delivered (High Quality JPEG)\n- Delivery via private Google Drive Cloud Link (Active for 3 months)',
    qty: 1,
    price: 1700000,
    tax: 0
  },
  photobooth: {
    name: 'Unlimited Photobooth Package (3 Hours)',
    description: 'Premium Instant Photobooth Service:\n- 3-Hour operational duration with Unlimited Instant Prints (4R / 2x6 Strip)\n- High-Speed Thermal Sublimation Printer (Prints in 11 seconds)\n- Custom Frame Overlay Template tailored to event theme & brand logo\n- Studio Lighting & Fun Props Collection\n- 2 Dedicated Crew on standby (1 Photographer + 1 Print Operator)\n- Instant QR Code Scan for on-the-spot digital softcopy download\n- Full Master Photo Softcopies delivered via Google Drive',
    qty: 1,
    price: 2200000,
    tax: 0
  },
  combo: {
    name: 'All-In Bundling Package (Photo + Video + Photobooth)',
    description: 'Complete Documentation & Photobooth Experience:\n- 2 Photographers + 2 Videographers on standby full-day event\n- 1 Cinematic Highlight Video (1-3 Min) + 1 Teaser Reels (60s) + Full Event Documentary\n- Unlimited Photo Shoots + 100 Edited High-Res Photos\n- 3 Hours Unlimited Photobooth (Custom Template, Studio Lighting, Fun Props, 2 Crew)\n- Instant QR Code Softcopy Download for guests\n- Full Master Photo & Video Files delivered via Google Drive (3-Month Cloud Storage)',
    qty: 1,
    price: 5800000,
    tax: 0
  }
};

const VENDOR_PRESETS = VENDOR_PRESETS_ID;

const DEFAULT_QUOTATION_TERMS_ID = `1. Pembayaran Uang Muka (DP) sebesar 30% - 50% untuk penguncian tanggal dan jadwal tim (Booking Date).
2. Pelunasan pembayaran dilakukan paling lambat H-1 sebelum acara atau maksimal setelah acara selesai saat penyerahan draft/preview.
3. Estimasi waktu pengerjaan: Preview foto 1-2 hari kerja, Full edit foto 5-7 hari kerja, Editing video cinematic 7-14 hari kerja.
4. Seluruh hasil karya foto & video akan diserahkan via tautan Google Drive dengan masa aktif penyimpanan selama 3 bulan.
5. Kebutuhan operasional Photobooth: Lokasi acara mohon menyediakan daya listrik minimal 800 Watt dan area kerja bersih minimal 2.5 x 2.5 meter.
6. Penawaran harga ini berlaku hingga tanggal masa berlaku yang tertera pada dokumen penawaran ini.
7. Pembayaran dapat ditransfer melalui:
   BCA : 2582749371
   Mandiri : 1420016275926
   a/n Johan Habibie`;

const DEFAULT_QUOTATION_TERMS_EN = `1. Down Payment (DP) of 30% - 50% is required upon confirmation to secure the booking date and crew schedule.
2. Final balance payment is due 1 day prior to the event date or upon handover of the initial preview drafts.
3. Turnaround time: Photo preview 1-2 business days, Full photo editing 5-7 business days, Cinematic video editing 7-14 business days.
4. All final photo & video deliverables will be accessible via Google Drive link (active for 3 months).
5. Photobooth technical setup: Venue must provide minimum 800W electrical outlet and a clean space of at least 2.5 x 2.5 meters.
6. This quotation remains valid until the expiration date stated on this document.
7. Payment transfer details:
   BCA : 2582749371
   Mandiri : 1420016275926
   Beneficiary: Johan Habibie`;

const DEFAULT_QUOTATION_TERMS = DEFAULT_QUOTATION_TERMS_ID;

const DEFAULT_INVOICE_NOTES_ID = `Transfer ke rekening bank setelah acara\nBCA : 2582749371\nMandiri : 1420016275926\na/n Johan Habibie`;

const DEFAULT_INVOICE_NOTES_EN = `Please transfer payment to our bank account:\nBCA : 2582749371\nMandiri : 1420016275926\nBeneficiary: Johan Habibie`;

const DEFAULT_INVOICE_NOTES = DEFAULT_INVOICE_NOTES_ID;

const DEFAULT_GREETING_QUOTATION_ID = `Dengan hormat,\nSehubungan dengan rencana kegiatan / event yang akan diselenggarakan oleh Bapak/Ibu, bersama surat ini kami dari Bluudz Creative bermaksud mengajukan penawaran harga untuk paket jasa Dokumentasi Video, Foto, dan Photobooth dengan rincian layanan sebagai berikut:`;

const DEFAULT_GREETING_QUOTATION_EN = `Dear Sir / Madam,\nWith reference to the upcoming event / project to be hosted by your esteemed company, we at Bluudz Creative are pleased to submit our formal quotation for Video Documentation, Photography, and Photobooth services with the details outlined below:`;

const DEFAULT_GREETING_INVOICE_ID = `Dengan hormat,\nTerima kasih atas kepercayaan Bapak/Ibu telah menggunakan layanan jasa kreatif kami. Bersama surat ini, kami sampaikan rincian tagihan invoice atas pekerjaan yang telah diselesaikan sebagai berikut:`;

const DEFAULT_GREETING_INVOICE_EN = `Dear Sir / Madam,\nThank you for choosing our creative services. Please find below the invoice billing summary for the completed documentation services:`;

// Translations Dictionary
const TRANSLATIONS = {
  id: {
    docTypeInvoice: 'Dokumen: Invoice',
    docTypeQuotation: 'Dokumen: Quotation Letter',
    docLangId: 'Bahasa: Indonesia',
    docLangEn: 'Language: English',
    paperA4: 'Kertas: A4',
    paperLetter: 'Kertas: Letter',
    btnSave: 'Simpan',
    btnPrint: 'Cetak',
    btnDownloadPdf: 'Unduh PDF',

    titleInvoice: 'INVOICE',
    titleQuotation: 'SURAT PENAWARAN HARGA',
    topInvoicePlaceholder: 'Beri nama invoice...',
    topQuotationPlaceholder: 'Beri nama penawaran...',
    subtitlePlaceholder: 'Ketik keterangan sub-judul di sini (opsional)...',

    subjectLabel: 'Perihal:',
    defaultSubjectQuotation: 'Penawaran Jasa Dokumentasi Video, Photo & Photobooth',
    defaultSubjectInvoice: 'Tagihan Pembayaran Jasa Dokumentasi',
    metaPrefixInvoice: '#',
    metaPrefixQuotation: 'No:',
    dateLabel1Invoice: 'Issue date:',
    dateLabel1Quotation: 'Tanggal:',
    dateLabel2Invoice: 'Due date:',
    dateLabel2Quotation: 'Berlaku hingga:',

    partyFromInvoice: 'From',
    partyFromQuotation: 'Dari (Vendor)',
    partyToInvoice: 'To',
    partyToQuotation: 'Kepada Yth',

    fromCompanyPlaceholder: 'Nama Bisnis / Perusahaan Anda',
    fromNamePlaceholder: 'Nama Anda (Penanggung Jawab)',
    fromAddressPlaceholder: 'Kota / Alamat (misal: Surabaya - Indonesia)',
    fromEmailPlaceholder: 'Email',
    fromPhonePlaceholder: 'Nomor Telepon / WhatsApp',

    toCompanyPlaceholder: 'Nama Klien / Perusahaan Tujuan',
    toNamePlaceholder: 'Nama Kontak / PIC',
    toAddressPlaceholder: 'Kota / Alamat Klien (misal: Surabaya - Indonesia)',
    toEmailPlaceholder: 'Email Klien',
    toPhonePlaceholder: 'Nomor Telepon Klien',

    greetingTitleQuotation: 'Surat Pengantar / Pembuka Penawaran:',
    greetingTitleInvoice: 'Surat Pengantar / Catatan Pembuka:',
    greetingToggleVisible: 'Tampil di Dokumen',
    greetingToggleHidden: 'Sembunyi di Dokumen',
    greetingPlaceholder: 'Tulis salam pembuka surat...',

    presetsHeader: 'Preset Paket Vendor (1-Klik Tambah):',
    presetVideo: '+ Paket Video',
    presetPhoto: '+ Paket Foto',
    presetPhotobooth: '+ Paket Photobooth',
    presetCombo: '+ Paket Bundling All-In',

    thName: 'Name',
    thQty: 'Qty',
    thPrice: 'Unit price',
    thTax: 'Tax (%)',
    thSubtotal: 'Subtotal',
    btnAddItemInvoice: 'Add new Invoice Item',
    btnAddItemQuotation: 'Tambah Baris Penawaran',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnUndoTitle: 'Urungkan / Undo (Ctrl+Z)',
    btnRedoTitle: 'Ulangi / Redo (Ctrl+Y)',
    btnTaxWithTax: 'Tipe: Dengan Pajak',
    btnTaxNonTax: 'Tipe: Tanpa Pajak',

    notesTitleInvoice: 'Keterangan :',
    notesTitleQuotation: 'Syarat & Ketentuan Penawaran :',
    notesPlaceholder: 'Tulis rincian keterangan, no rekening BCA, Mandiri, instruksi transfer, atau catatan lainnya...',

    summaryTitleInvoice: 'Invoice summary',
    summaryTitleQuotation: 'Ringkasan Penawaran',
    summarySubtotal: 'Subtotal',
    summaryTax: 'Tax',
    summaryTotal: 'Total',
    terbilangLabel: 'Terbilang:',

    sigVendorTitle: 'Hormat Kami,',
    sigClientTitle: 'Disetujui & Dikonfirmasi Oleh,'
  },
  en: {
    docTypeInvoice: 'Document: Invoice',
    docTypeQuotation: 'Document: Quotation Letter',
    docLangId: 'Language: Indonesian',
    docLangEn: 'Language: English',
    paperA4: 'Paper: A4',
    paperLetter: 'Paper: Letter',
    btnSave: 'Save',
    btnPrint: 'Print',
    btnDownloadPdf: 'Download PDF',

    titleInvoice: 'INVOICE',
    titleQuotation: 'QUOTATION LETTER',
    topInvoicePlaceholder: 'Name this invoice...',
    topQuotationPlaceholder: 'Name this quotation...',
    subtitlePlaceholder: 'Enter document subtitle / description (optional)...',

    subjectLabel: 'Subject:',
    defaultSubjectQuotation: 'Quotation for Video, Photography & Photobooth Services',
    defaultSubjectInvoice: 'Invoice for Professional Documentation Services',
    metaPrefixInvoice: '#',
    metaPrefixQuotation: 'Quote #:',
    dateLabel1Invoice: 'Issue Date:',
    dateLabel1Quotation: 'Date:',
    dateLabel2Invoice: 'Due Date:',
    dateLabel2Quotation: 'Valid Until:',

    partyFromInvoice: 'From',
    partyFromQuotation: 'From (Vendor)',
    partyToInvoice: 'Bill To',
    partyToQuotation: 'Prepared For',

    fromCompanyPlaceholder: 'Your Business / Company Name',
    fromNamePlaceholder: 'Your Name (Representative)',
    fromAddressPlaceholder: 'City / Address (e.g. Surabaya - Indonesia)',
    fromEmailPlaceholder: 'Email Address',
    fromPhonePlaceholder: 'Phone Number / WhatsApp',

    toCompanyPlaceholder: 'Client / Company Name',
    toNamePlaceholder: 'Contact Person / Attention',
    toAddressPlaceholder: 'Client City / Address (e.g. Surabaya - Indonesia)',
    toEmailPlaceholder: 'Client Email Address',
    toPhonePlaceholder: 'Client Phone Number',

    greetingTitleQuotation: 'Cover Letter / Opening Greeting:',
    greetingTitleInvoice: 'Cover Note / Opening Greeting:',
    greetingToggleVisible: 'Show on Document',
    greetingToggleHidden: 'Hidden from Document',
    greetingPlaceholder: 'Write cover greeting note...',

    presetsHeader: 'Vendor Package Presets (1-Click Add):',
    presetVideo: '+ Video Package',
    presetPhoto: '+ Photo Package',
    presetPhotobooth: '+ Photobooth Package',
    presetCombo: '+ All-In Bundle Package',

    thName: 'Item / Description',
    thQty: 'Qty',
    thPrice: 'Unit Price',
    thTax: 'Tax (%)',
    thSubtotal: 'Subtotal',
    btnAddItemInvoice: 'Add new Invoice Item',
    btnAddItemQuotation: 'Add Quotation Item',
    btnUndo: 'Undo',
    btnRedo: 'Redo',
    btnUndoTitle: 'Undo (Ctrl+Z)',
    btnRedoTitle: 'Redo (Ctrl+Y)',
    btnTaxWithTax: 'Type: Taxable (VAT)',
    btnTaxNonTax: 'Type: Non-Tax (0%)',

    notesTitleInvoice: 'Payment Notes :',
    notesTitleQuotation: 'Terms & Conditions :',
    notesPlaceholder: 'Write payment instructions, BCA / Mandiri bank accounts, or other terms...',

    summaryTitleInvoice: 'Invoice Summary',
    summaryTitleQuotation: 'Quotation Summary',
    summarySubtotal: 'Subtotal',
    summaryTax: 'Tax',
    summaryTotal: 'Total',
    terbilangLabel: 'In Words:',

    sigVendorTitle: 'Sincerely / Issued By,',
    sigClientTitle: 'Approved & Accepted By,'
  }
};

function generateDefaultQuotationNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100 + Math.random() * 900);
  return `Q-${day}${month}${year}-${rand}`;
}

// Global State
let invoiceState = {
  id: 'inv-' + Date.now(),
  invoiceName: '',
  subtitle: '',
  title: 'INVOICE',
  logo: '',
  docType: 'invoice', // 'invoice' | 'quotation'
  docLang: 'id', // 'id' | 'en'
  subject: 'Penawaran Jasa Dokumentasi Video, Photo & Photobooth',
  greetingText: 'Dengan hormat,\nSehubungan dengan rencana kegiatan / event yang akan diselenggarakan oleh Bapak/Ibu, bersama surat ini kami dari Bluudz Creative bermaksud mengajukan penawaran harga untuk paket jasa Dokumentasi Video, Foto, dan Photobooth dengan rincian layanan sebagai berikut:',
  showGreeting: true,
  invoiceNumber: '190720260109',
  issueDate: '',
  dueDate: '',
  from: {
    company: 'Bluudz Creative',
    name: 'Johan Habibie',
    address: 'Surabaya - Indonesia',
    email: 'johanhabibie12@gmail.com',
    phone: '+6285854321667'
  },
  to: {
    company: 'PT Paragon Technology and Innovation',
    name: 'Pak Candra Kisaditiyanto',
    address: 'Surabaya - Indonesia',
    email: 'xxxxxxx@gmail.com',
    phone: '+6281334696952'
  },
  items: [
    {
      id: 'item-1',
      name: 'Dokumentasi',
      description: '1 Day, Output :- Foto dokumentasi- 1 Video ( 1 menit )- All file In Google Drive',
      qty: 1,
      price: 1700000,
      tax: 0
    }
  ],
  currency: 'IDR',
  paperSize: 'a4',
  taxMode: 'with_tax',
  paymentNotes: DEFAULT_INVOICE_NOTES,
  paymentNotesFontSize: '14px',
  customNotes: ''
};

// DOM References
const DOM = {
  // Document Config Selectors
  docTypeSelect: document.getElementById('doc-type-select'),
  docTypePicker: document.querySelector('.doc-type-picker'),
  docLangSelect: document.getElementById('doc-lang-select'),
  docLangPicker: document.querySelector('.doc-lang-picker'),
  paperSizeSelect: document.getElementById('paper-size-select'),
  invoiceTypeSelect: document.getElementById('invoice-type-select'),
  btnToggleTaxMode: document.getElementById('btn-toggle-tax-mode'),
  toggleTaxBtnLabel: document.getElementById('toggle-tax-btn-label'),

  // Logo
  logoContainer: document.getElementById('logo-container'),
  logoPreviewWrapper: document.getElementById('logo-preview-wrapper'),
  logoInput: document.getElementById('logo-input'),
  logoImg: document.getElementById('logo-img'),
  logoPlaceholder: document.getElementById('logo-placeholder'),
  logoActions: document.getElementById('logo-actions'),
  btnChangeLogo: document.getElementById('btn-change-logo'),
  btnRemoveLogo: document.getElementById('btn-remove-logo'),

  // Doc Meta
  invoiceTitleInput: document.getElementById('invoice-title-input'),
  docType: document.getElementById('invoice-title-input'),
  invoiceNumber: document.getElementById('invoice-number'),
  metaNumPrefix: document.getElementById('meta-num-prefix'),
  metaDateLabel1: document.getElementById('meta-date-label-1'),
  metaDateLabel2: document.getElementById('meta-date-label-2'),
  issueDate: document.getElementById('issue-date'),
  issueDateNative: document.getElementById('issue-date-native'),
  btnIssueDateTrigger: document.getElementById('btn-issue-date-trigger'),
  dueDate: document.getElementById('due-date'),
  dueDateNative: document.getElementById('due-date-native'),
  btnDueDateTrigger: document.getElementById('btn-due-date-trigger'),
  docSubjectWrap: document.getElementById('doc-subject-wrap'),
  subjectLabel: document.getElementById('subject-label'),
  docSubjectInput: document.getElementById('doc-subject-input'),

  // Parties
  partyFromBadge: document.getElementById('party-from-badge'),
  partyToBadge: document.getElementById('party-to-badge'),
  fromCompany: document.getElementById('from-company'),
  fromName: document.getElementById('from-name'),
  fromAddress: document.getElementById('from-address'),
  fromEmail: document.getElementById('from-email'),
  fromPhone: document.getElementById('from-phone'),

  toCompany: document.getElementById('to-company'),
  toName: document.getElementById('to-name'),
  toAddress: document.getElementById('to-address'),
  toEmail: document.getElementById('to-email'),
  toPhone: document.getElementById('to-phone'),

  // Quotation & Invoice Greeting Section
  quotationGreetingSection: document.getElementById('quotation-greeting-section'),
  greetingHeaderTitle: document.getElementById('greeting-header-title'),
  greetingContent: document.getElementById('greeting-content'),
  greetingFormatToolbar: document.getElementById('greeting-format-toolbar'),
  greetingFontSizeSelect: document.getElementById('greeting-font-size-select'),
  btnGreetingBold: document.getElementById('btn-greeting-bold'),
  btnGreetingItalic: document.getElementById('btn-greeting-italic'),
  btnGreetingClear: document.getElementById('btn-greeting-clear'),
  btnToggleGreeting: document.getElementById('btn-toggle-greeting'),
  iconToggleGreeting: document.getElementById('icon-toggle-greeting'),
  labelToggleGreeting: document.getElementById('label-toggle-greeting'),

  // Vendor Quick Presets Toolbar
  vendorPresetsToolbar: document.getElementById('vendor-presets-toolbar'),
  presetsHeaderTitle: document.getElementById('presets-header-title'),
  presetBtnVideo: document.getElementById('preset-btn-video'),
  presetLabelVideo: document.getElementById('preset-label-video'),
  presetBtnPhoto: document.getElementById('preset-btn-photo'),
  presetLabelPhoto: document.getElementById('preset-label-photo'),
  presetBtnPhotobooth: document.getElementById('preset-btn-photobooth'),
  presetLabelPhotobooth: document.getElementById('preset-label-photobooth'),
  presetBtnCombo: document.getElementById('preset-btn-combo'),
  presetLabelCombo: document.getElementById('preset-label-combo'),

  // Items
  itemsList: document.getElementById('items-list'),
  thName: document.getElementById('th-name'),
  thQty: document.getElementById('th-qty'),
  thPrice: document.getElementById('th-price'),
  thTax: document.getElementById('th-tax'),
  thSubtotal: document.getElementById('th-subtotal'),
  btnAddItem: document.getElementById('btn-add-item'),
  btnAddItemLabel: document.getElementById('btn-add-item-label'),
  btnUndoItem: document.getElementById('btn-undo-item'),
  btnRedoItem: document.getElementById('btn-redo-item'),
  btnUndoLabel: document.getElementById('btn-undo-label'),
  btnRedoLabel: document.getElementById('btn-redo-label'),

  // Summary
  currencySelect: document.getElementById('currency-select'),
  summaryTitleLabel: document.getElementById('summary-title-label'),
  summarySubtotal: document.getElementById('summary-subtotal'),
  summarySubtotalLabel: document.getElementById('summary-subtotal-label'),
  summaryTaxRow: document.getElementById('summary-tax-row'),
  summaryTaxLabel: document.getElementById('summary-tax-label'),
  summaryTax: document.getElementById('summary-tax'),
  summaryTotal: document.getElementById('summary-total'),
  summaryTotalLabel: document.getElementById('summary-total-label'),
  terbilangLabel: document.getElementById('terbilang-label'),
  terbilangText: document.getElementById('terbilang-text'),
  terbilangContainer: document.getElementById('terbilang-container'),

  // Payment Notes & Formatting Toolbar
  paymentNotesTitleLabel: document.getElementById('payment-notes-title-label'),
  paymentNotes: document.getElementById('payment-notes'),
  notesFormatToolbar: document.getElementById('notes-format-toolbar'),
  notesFontSizeSelect: document.getElementById('notes-font-size-select'),
  btnFormatBold: document.getElementById('btn-format-bold'),
  btnFormatItalic: document.getElementById('btn-format-italic'),
  btnFormatStrike: document.getElementById('btn-format-strike'),
  btnFormatClear: document.getElementById('btn-format-clear'),

  // Signatures Section (Quotation Mode)
  quotationSignaturesSection: document.getElementById('quotation-signatures-section'),
  sigVendorTitle: document.getElementById('sig-vendor-title'),
  sigVendorCompany: document.getElementById('sig-vendor-company'),
  sigVendorName: document.getElementById('sig-vendor-name'),
  sigClientTitle: document.getElementById('sig-client-title'),
  sigClientCompany: document.getElementById('sig-client-company'),
  sigClientName: document.getElementById('sig-client-name'),

  // Actions
  btnSaveProfile: document.getElementById('btn-save-profile'),
  btnFillSample: document.getElementById('btn-fill-sample'),
  btnNew: document.getElementById('btn-new'),
  btnPrint: document.getElementById('btn-print'),
  btnDownloadPdf: document.getElementById('btn-download-pdf'),
  toast: document.getElementById('toast'),
  invoiceSheet: document.getElementById('invoice-sheet'),
  
  // Title & Header Elements
  invoiceTitleInput: document.getElementById('invoice-title-input'),
  topInvoiceTitleInput: document.getElementById('top-invoice-title-input'),
  titleSyncBadge: document.getElementById('title-sync-badge'),
  invoiceSubtitleInput: document.getElementById('invoice-subtitle-input'),
  invoiceProjectTitleWrap: document.getElementById('invoice-project-title-wrap'),

  // Invoices Manager Panel Elements
  invoicesManagerPanel: document.getElementById('invoices-manager-panel'),
  btnSaveCurrent: document.getElementById('btn-save-current'),
  btnPanelNewInv: document.getElementById('btn-panel-new-inv'),
  btnPanelNewQuo: document.getElementById('btn-panel-new-quo'),
  savedInvoicesList: document.getElementById('saved-invoices-list'),
  invoicesCount: document.getElementById('invoices-count'),
  invoiceSearchInput: document.getElementById('invoice-search-input'),
  autoSaveBadge: document.getElementById('auto-save-badge'),

  // Sidebar Elements
  appSidebar: document.getElementById('app-sidebar'),
  sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
  mobileMenuBtn: document.getElementById('mobile-menu-btn'),
  navEditor: document.getElementById('nav-editor'),
  navNewInv: document.getElementById('nav-new-inv'),
  navSaveProfile: document.getElementById('nav-save-profile'),
  navFillSample: document.getElementById('nav-fill-sample'),
  navPrint: document.getElementById('nav-print'),
  navDownloadPdf: document.getElementById('nav-download-pdf')
};

// Show Toast Notification
function showToast(message, type = 'success') {
  DOM.toast.textContent = message;
  DOM.toast.className = `toast ${type}`;
  setTimeout(() => {
    DOM.toast.className = 'toast hidden';
  }, 3200);
}

// Format Currency Utility
function formatCurrency(amount, currencyCode = 'IDR') {
  const config = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR;
  const num = Number(amount) || 0;
  
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: config.fractionDigits,
    maximumFractionDigits: config.fractionDigits
  }).format(num);
}

// Generate Unique ID
function generateId() {
  return 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
}

// Generate Invoice Number based on current date
function generateDefaultInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${day}${month}${year}${rand}`;
}

// Set Dates Default (Hari/Bulan/Tahun - DD/MM/YYYY)
function initDates() {
  const today = new Date();
  const issueStr = formatToDMY(today);
  
  // Default due date: +14 days
  const dueDateObj = new Date();
  dueDateObj.setDate(today.getDate() + 14);
  const dueStr = formatToDMY(dueDateObj);

  if (DOM.issueDate) DOM.issueDate.value = issueStr;
  if (DOM.dueDate) DOM.dueDate.value = dueStr;
  if (DOM.issueDateNative) DOM.issueDateNative.value = formatToISO(issueStr);
  if (DOM.dueDateNative) DOM.dueDateNative.value = formatToISO(dueStr);
  invoiceState.issueDate = issueStr;
  invoiceState.dueDate = dueStr;
}

// Setup Date Pickers with Hari/Bulan/Tahun (DD/MM/YYYY) format and calendar picker sync
function setupDatePickers() {
  const dateConfigs = [
    {
      textInput: DOM.issueDate,
      nativeInput: DOM.issueDateNative,
      triggerBtn: DOM.btnIssueDateTrigger,
      stateKey: 'issueDate'
    },
    {
      textInput: DOM.dueDate,
      nativeInput: DOM.dueDateNative,
      triggerBtn: DOM.btnDueDateTrigger,
      stateKey: 'dueDate'
    }
  ];

  dateConfigs.forEach(({ textInput, nativeInput, triggerBtn, stateKey }) => {
    if (!textInput) return;

    // Trigger native calendar popup
    if (triggerBtn && nativeInput) {
      triggerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        nativeInput.value = formatToISO(textInput.value);
        if (typeof nativeInput.showPicker === 'function') {
          try {
            nativeInput.showPicker();
          } catch (err) {
            nativeInput.focus();
            nativeInput.click();
          }
        } else {
          nativeInput.focus();
          nativeInput.click();
        }
      });
    }

    // Sync when date chosen from native calendar picker
    if (nativeInput) {
      const handleNativeChange = () => {
        if (nativeInput.value) {
          const dmy = formatToDMY(nativeInput.value);
          textInput.value = dmy;
          invoiceState[stateKey] = dmy;
          triggerAutoSave();
        }
      };
      nativeInput.addEventListener('change', handleNativeChange);
      nativeInput.addEventListener('input', handleNativeChange);
    }

    // Format typing in text input (e.g. DD/MM/YYYY)
    textInput.addEventListener('input', (e) => {
      let val = textInput.value.replace(/[^\d/]/g, '');
      if (e.inputType !== 'deleteContentBackward') {
        if (/^\d+$/.test(val)) {
          if (val.length > 4) {
            val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4, 8)}`;
          } else if (val.length > 2) {
            val = `${val.slice(0, 2)}/${val.slice(2, 4)}`;
          }
        }
      }
      textInput.value = val.slice(0, 10);

      // If full date entered, sync native and state
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(textInput.value)) {
        if (nativeInput) nativeInput.value = formatToISO(textInput.value);
        invoiceState[stateKey] = textInput.value;
        triggerAutoSave();
      }
    });

    // On blur, normalize value to DD/MM/YYYY
    textInput.addEventListener('blur', () => {
      if (textInput.value.trim()) {
        const formatted = formatToDMY(textInput.value);
        textInput.value = formatted;
        if (nativeInput) nativeInput.value = formatToISO(formatted);
        invoiceState[stateKey] = formatted;
        triggerAutoSave();
      }
    });
  });
}

// Format payment notes to safe HTML for rich-text editor
function formatNotesToHtml(notes) {
  if (!notes) return '';
  if (/<[a-z][\s\S]*>/i.test(notes)) {
    return notes;
  }
  return notes.replace(/\r\n|\r|\n/g, '<br>');
}

// Sanitize greeting HTML: remove foreign style attributes, black backgrounds, font tags, and code blocks
function sanitizeGreetingHtml(html) {
  if (!html) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.replace(/\r\n|\r|\n/g, '<br>');
  }
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Strip all style, face, color, bgcolor, size, class attributes from all elements
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    el.removeAttribute('style');
    el.removeAttribute('face');
    el.removeAttribute('color');
    el.removeAttribute('bgcolor');
    el.removeAttribute('size');
    el.removeAttribute('class');

    // Replace code, pre, or font tags with clean spans
    if (['CODE', 'PRE', 'FONT', 'TT', 'KBD', 'SAMP'].includes(el.tagName)) {
      const span = document.createElement('span');
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    }
  });

  return temp.innerHTML;
}

// Auto-resize helper for textareas
function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}

// Auto-resize helper for text inputs to hug content snugly (zero gap, zero cut-off)
function autoResizeInput(input) {
  if (!input) return;
  const val = input.value || input.placeholder || '';
  const canvas = autoResizeInput.canvas || (autoResizeInput.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  const style = window.getComputedStyle(input);
  context.font = `${style.fontWeight || '700'} ${style.fontSize || '16px'} ${style.fontFamily || 'sans-serif'}`;
  if ('letterSpacing' in context && style.letterSpacing) {
    context.letterSpacing = style.letterSpacing;
  }
  const metrics = context.measureText(val);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  // Extra buffer to ensure no character is ever clipped
  const width = Math.ceil(metrics.width) + paddingLeft + paddingRight + 28;
  let finalWidth = Math.max(width, 48);
  if (input.id === 'invoice-number' || input.classList.contains('doc-number-input')) {
    finalWidth = Math.min(finalWidth, 200);
  }
  input.style.width = `${finalWidth}px`;
}

// Render Line Items
function renderItems() {
  DOM.itemsList.innerHTML = '';

  invoiceState.items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.id = item.id;

    const subtotal = (Number(item.qty) || 0) * (Number(item.price) || 0);

    row.innerHTML = `
      <div class="item-name-cell col-name">
        <input type="text" class="input-item-name" placeholder="Nama item / layanan" value="${escapeHtml(item.name || '')}" data-field="name">
        <textarea class="input-item-desc" placeholder="Rincian / deskripsi item..." rows="1" data-field="description">${escapeHtml(item.description || '')}</textarea>
      </div>
      <div class="col-qty">
        <input type="number" min="0" step="any" class="input-qty" placeholder="1" value="${item.qty}" data-field="qty">
      </div>
      <div class="col-price">
        <input type="number" min="0" step="any" class="input-price" placeholder="0" value="${item.price}" data-field="price">
      </div>
      <div class="col-tax">
        <div class="tax-input-wrap">
          <input type="number" min="0" max="100" step="any" class="input-tax" placeholder="0" value="${item.tax !== undefined && item.tax !== null && item.tax !== '' ? item.tax : ''}" data-field="tax">
          <span class="tax-unit-badge">%</span>
        </div>
      </div>
      <div class="col-subtotal item-subtotal-val" data-subtotal>
        ${formatCurrency(subtotal, invoiceState.currency)}
      </div>
      <div class="col-action no-print">
        <button type="button" class="btn-delete-row" title="Hapus Baris Ini" data-action="delete">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    DOM.itemsList.appendChild(row);

    const descTextarea = row.querySelector('.input-item-desc');
    if (descTextarea) {
      setTimeout(() => autoResize(descTextarea), 0);
      descTextarea.addEventListener('input', () => autoResize(descTextarea));
    }
  });

  // Re-initialize dynamic Lucide icons in newly created elements
  lucide.createIcons();
  calculateTotals();
  updateUndoRedoButtons();
}

// ==========================================================================
// Full-Page History Manager (Undo / Redo Stack)
// Captures entire invoiceState so Ctrl+Z/Y works for ALL changes,
// not just item additions/deletions.
// ==========================================================================
const MAX_ITEM_HISTORY = 50;
let itemUndoStack = [];
let itemRedoStack = [];
let _historyDebounceTimer = null;
let _isRestoringHistory = false;
let _lastKnownBaseline = null;

function _snapshotState() {
  readInputsToState();
  const snap = JSON.parse(JSON.stringify(invoiceState));
  delete snap.id;
  return snap;
}

function _restoreSnapshot(snap) {
  const currentId = invoiceState.id;
  const restored = JSON.parse(JSON.stringify(snap));
  Object.assign(invoiceState, restored);
  invoiceState.id = currentId;
  syncInputsWithState();
  renderItems();
}

function _updateBaseline() {
  _lastKnownBaseline = _snapshotState();
}

// Immediate push: saves current state BEFORE the caller mutates invoiceState
function pushHistoryState(actionLabel = '') {
  if (!invoiceState || _isRestoringHistory) return;

  if (_historyDebounceTimer) {
    clearTimeout(_historyDebounceTimer);
    _historyDebounceTimer = null;
  }

  const snapshot = _snapshotState();
  itemUndoStack.push({ state: snapshot, actionLabel: actionLabel });

  if (itemUndoStack.length > MAX_ITEM_HISTORY) {
    itemUndoStack.shift();
  }

  itemRedoStack = [];
  updateUndoRedoButtons();
  _lastKnownBaseline = null;
}

// Debounced: pushes the BASELINE (pre-edit) to undo stack, then updates baseline
function pushHistoryStateDebounced(actionLabel = '') {
  if (!invoiceState || _isRestoringHistory) return;

  if (_historyDebounceTimer) {
    clearTimeout(_historyDebounceTimer);
  }
  _historyDebounceTimer = setTimeout(() => {
    _historyDebounceTimer = null;

    const currentSnapshot = _snapshotState();

    if (_lastKnownBaseline) {
      if (JSON.stringify(_lastKnownBaseline) === JSON.stringify(currentSnapshot)) return;

      itemUndoStack.push({ state: JSON.parse(JSON.stringify(_lastKnownBaseline)), actionLabel: actionLabel });
      if (itemUndoStack.length > MAX_ITEM_HISTORY) {
        itemUndoStack.shift();
      }
      itemRedoStack = [];
      updateUndoRedoButtons();

      // Sync focusedVal so next Ctrl+Z uses full-page undo instead of native text undo
      const ae = document.activeElement;
      if (ae && ae.dataset.focusedVal !== undefined) {
        ae.dataset.focusedVal = ae.value !== undefined ? ae.value : (ae.textContent || '');
      }
    }

    _lastKnownBaseline = currentSnapshot;
  }, 800);
}

function clearHistoryStacks() {
  itemUndoStack = [];
  itemRedoStack = [];
  if (_historyDebounceTimer) {
    clearTimeout(_historyDebounceTimer);
    _historyDebounceTimer = null;
  }
  _lastKnownBaseline = null;
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  if (DOM.btnUndoItem) {
    DOM.btnUndoItem.disabled = itemUndoStack.length === 0;
  }
  if (DOM.btnRedoItem) {
    DOM.btnRedoItem.disabled = itemRedoStack.length === 0;
  }
}

function undoItemAction() {
  if (itemUndoStack.length === 0) return;

  // Cancel pending debounced push
  if (_historyDebounceTimer) {
    clearTimeout(_historyDebounceTimer);
    _historyDebounceTimer = null;
  }

  const currentSnapshot = _snapshotState();
  const prevEntry = itemUndoStack.pop();

  itemRedoStack.push({
    state: currentSnapshot,
    actionLabel: prevEntry.actionLabel
  });

  _isRestoringHistory = true;
  _restoreSnapshot(prevEntry.state);
  _isRestoringHistory = false;

  _lastKnownBaseline = JSON.parse(JSON.stringify(prevEntry.state));
  saveDraftToStorage();
  updateUndoRedoButtons();

  const isEn = invoiceState.docLang === 'en';
  const label = prevEntry.actionLabel || (isEn ? 'Action undone' : 'Aksi dibatalkan');
  showToast(isEn ? `Undone: ${label}` : `Berhasil di-undo: ${label}`, 'info');
}

function redoItemAction() {
  if (itemRedoStack.length === 0) return;

  if (_historyDebounceTimer) {
    clearTimeout(_historyDebounceTimer);
    _historyDebounceTimer = null;
  }

  const currentSnapshot = _snapshotState();
  const nextEntry = itemRedoStack.pop();

  itemUndoStack.push({
    state: currentSnapshot,
    actionLabel: nextEntry.actionLabel
  });

  _isRestoringHistory = true;
  _restoreSnapshot(nextEntry.state);
  _isRestoringHistory = false;

  _lastKnownBaseline = JSON.parse(JSON.stringify(nextEntry.state));
  saveDraftToStorage();
  updateUndoRedoButtons();

  const isEn = invoiceState.docLang === 'en';
  const label = nextEntry.actionLabel || (isEn ? 'Action redone' : 'Aksi diulang');
  showToast(isEn ? `Redone: ${label}` : `Berhasil di-redo: ${label}`, 'info');
}

// Add Item
function addItem() {
  const isEn = invoiceState.docLang === 'en';
  pushHistoryState(isEn ? 'Add Item' : 'Tambah Item');

  invoiceState.items.push({
    id: generateId(),
    name: '',
    description: '',
    qty: 1,
    price: 0,
    tax: 0
  });
  renderItems();
  saveDraftToStorage();

  // Auto-focus new item input
  const lastRow = DOM.itemsList.lastElementChild;
  if (lastRow) {
    const nameInput = lastRow.querySelector('.input-item-name');
    if (nameInput) {
      nameInput.dataset.focusedVal = '';
      nameInput.focus();
    }
  }
}

// Delete Item
function deleteItem(itemId) {
  if (invoiceState.items.length <= 1) {
    showToast('Minimal harus ada 1 item di invoice', 'danger');
    return;
  }

  const isEn = invoiceState.docLang === 'en';
  const itemToDelete = invoiceState.items.find(item => item.id === itemId);
  const itemName = itemToDelete && itemToDelete.name.trim() ? itemToDelete.name.trim() : (isEn ? 'Item' : 'Baris Item');
  pushHistoryState(isEn ? `Delete "${itemName}"` : `Hapus "${itemName}"`);

  invoiceState.items = invoiceState.items.filter(item => item.id !== itemId);
  renderItems();
  saveDraftToStorage();
}

// Calculate Totals
function calculateTotals() {
  let subtotal = 0;
  let totalTax = 0;
  const isNoTax = invoiceState.taxMode === 'no_tax';

  invoiceState.items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const taxPercent = Number(item.tax) || 0;

    const lineTotal = qty * price;
    const lineTax = isNoTax ? 0 : lineTotal * (taxPercent / 100);

    subtotal += lineTotal;
    totalTax += lineTax;
  });

  const grandTotal = subtotal + totalTax;

  // Update Summary DOM
  DOM.summarySubtotal.textContent = formatCurrency(subtotal, invoiceState.currency);
  DOM.summaryTax.textContent = formatCurrency(totalTax, invoiceState.currency);
  DOM.summaryTotal.textContent = formatCurrency(grandTotal, invoiceState.currency);

  // Update Summary Tax Row visibility
  if (DOM.summaryTaxRow) {
    DOM.summaryTaxRow.style.display = isNoTax ? 'none' : 'flex';
  }

  // Update Summary Tax Label dynamically with percentage
  if (DOM.summaryTaxLabel && !isNoTax) {
    const nonZeroItems = invoiceState.items.filter(it => (Number(it.qty) || 0) * (Number(it.price) || 0) > 0);
    const targetItems = nonZeroItems.length > 0 ? nonZeroItems : invoiceState.items;
    const taxRates = targetItems.map(it => Number(it.tax) || 0);
    const allSameRate = taxRates.length > 0 && taxRates.every(r => r === taxRates[0]);

    if (totalTax > 0 && allSameRate && taxRates[0] > 0) {
      DOM.summaryTaxLabel.textContent = `Tax (${taxRates[0]}%)`;
    } else if (allSameRate && taxRates.length > 0 && taxRates[0] > 0) {
      DOM.summaryTaxLabel.textContent = `Tax (${taxRates[0]}%)`;
    } else {
      DOM.summaryTaxLabel.textContent = `Tax`;
    }
  }

  // Update Terbilang / In Words
  const isEn = invoiceState.docLang === 'en';
  if (DOM.terbilangLabel) {
    DOM.terbilangLabel.textContent = isEn ? 'In Words:' : 'Terbilang:';
  }
  if (grandTotal > 0) {
    DOM.terbilangContainer.classList.remove('hidden');
    if (isEn) {
      DOM.terbilangText.textContent = numberToWordsEnglish(grandTotal, invoiceState.currency);
    } else {
      if (invoiceState.currency === 'IDR') {
        const terbilangStr = angkaKeTerbilang(grandTotal).trim();
        DOM.terbilangText.textContent = `${terbilangStr} Rupiah`;
      } else {
        DOM.terbilangText.textContent = `${formatCurrency(grandTotal, invoiceState.currency)}`;
      }
    }
  } else {
    DOM.terbilangContainer.classList.add('hidden');
  }
}

// Handle Line Item Inputs
function handleItemInput(e) {
  const target = e.target;
  const field = target.dataset.field;
  if (!field) return;

  const row = target.closest('.item-row');
  if (!row) return;

  const itemId = row.dataset.id;
  const item = invoiceState.items.find(i => i.id === itemId);
  if (!item) return;

  item[field] = target.value;

  // Live update the line item's subtotal column
  if (field === 'qty' || field === 'price') {
    const lineSubtotal = (Number(item.qty) || 0) * (Number(item.price) || 0);
    const subtotalEl = row.querySelector('[data-subtotal]');
    if (subtotalEl) {
      subtotalEl.textContent = formatCurrency(lineSubtotal, invoiceState.currency);
    }
  }

  calculateTotals();
  saveDraftToStorage();
}

// Handle Item Row Delete Action
function handleItemClick(e) {
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    const row = deleteBtn.closest('.item-row');
    if (row) {
      deleteItem(row.dataset.id);
    }
  }
}

// Logo Handling
function setupLogoUploader() {
  DOM.logoPreviewWrapper.addEventListener('click', () => {
    DOM.logoInput.click();
  });

  DOM.btnChangeLogo.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.logoInput.click();
  });

  DOM.btnRemoveLogo.addEventListener('click', (e) => {
    e.stopPropagation();
    removeLogo();
  });

  DOM.logoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Mohon pilih file gambar', 'danger');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogo(event.target.result);
        saveDraftToStorage();
        showToast('Logo berhasil diunggah!');
      };
      reader.readAsDataURL(file);
    }
  });

  // Drag & drop support
  ['dragenter', 'dragover'].forEach(eventName => {
    DOM.logoPreviewWrapper.addEventListener(eventName, (e) => {
      e.preventDefault();
      DOM.logoPreviewWrapper.style.borderColor = 'var(--primary)';
      DOM.logoPreviewWrapper.style.background = '#eef6ff';
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    DOM.logoPreviewWrapper.addEventListener(eventName, (e) => {
      e.preventDefault();
      DOM.logoPreviewWrapper.style.borderColor = '';
      DOM.logoPreviewWrapper.style.background = '';
    });
  });

  DOM.logoPreviewWrapper.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogo(event.target.result);
        saveDraftToStorage();
        showToast('Logo berhasil diunggah!');
      };
      reader.readAsDataURL(files[0]);
    }
  });
}

function setLogo(src) {
  const isEn = invoiceState.docLang === 'en';
  pushHistoryState(isEn ? 'Change logo' : 'Ubah logo');
  invoiceState.logo = src;
  if (src) {
    DOM.logoImg.src = src;
    DOM.logoImg.classList.remove('hidden');
    DOM.logoPlaceholder.classList.add('hidden');
    DOM.logoActions.classList.remove('hidden');
    if (DOM.logoPreviewWrapper) DOM.logoPreviewWrapper.classList.add('has-logo');
  } else {
    removeLogo();
  }
}

function removeLogo() {
  const isEn = invoiceState.docLang === 'en';
  pushHistoryState(isEn ? 'Remove logo' : 'Hapus logo');
  invoiceState.logo = '';
  DOM.logoImg.src = '';
  DOM.logoImg.classList.add('hidden');
  DOM.logoPlaceholder.classList.remove('hidden');
  DOM.logoActions.classList.add('hidden');
  if (DOM.logoPreviewWrapper) DOM.logoPreviewWrapper.classList.remove('has-logo');
  DOM.logoInput.value = '';
  saveDraftToStorage();
}

// Synchronize DOM inputs with invoiceState
// Synchronize DOM inputs with invoiceState
function syncInputsWithState() {
  if (DOM.invoiceTitleInput) {
    DOM.invoiceTitleInput.value = invoiceState.title || (invoiceState.docType === 'quotation' ? 'SURAT PENAWARAN HARGA' : 'INVOICE');
    setTimeout(() => autoResizeInput(DOM.invoiceTitleInput), 0);
  }
  if (DOM.topInvoiceTitleInput) {
    DOM.topInvoiceTitleInput.value = invoiceState.invoiceName || '';
    DOM.topInvoiceTitleInput.title = invoiceState.invoiceName ? `Klik untuk mengedit judul: ${invoiceState.invoiceName}` : (invoiceState.docType === 'quotation' ? 'Beri nama penawaran...' : 'Beri nama invoice...');
    setTimeout(() => {
      if (DOM.topInvoiceTitleInput) {
        DOM.topInvoiceTitleInput.scrollLeft = 0;
      }
    }, 10);
  }
  if (DOM.invoiceSubtitleInput) {
    DOM.invoiceSubtitleInput.value = invoiceState.subtitle || '';
    if (DOM.invoiceProjectTitleWrap) {
      DOM.invoiceProjectTitleWrap.classList.toggle('is-empty', !(invoiceState.subtitle || '').trim());
    }
  }
  if (DOM.docSubjectInput) {
    DOM.docSubjectInput.value = invoiceState.subject || 'Penawaran Jasa Dokumentasi Video, Photo & Photobooth';
  }
  if (DOM.invoiceNumber) {
    DOM.invoiceNumber.value = invoiceState.invoiceNumber || '';
    setTimeout(() => autoResizeInput(DOM.invoiceNumber), 0);
  }
  if (DOM.issueDate) {
    DOM.issueDate.value = formatToDMY(invoiceState.issueDate) || '';
    if (DOM.issueDateNative) DOM.issueDateNative.value = formatToISO(DOM.issueDate.value);
  }
  if (DOM.dueDate) {
    DOM.dueDate.value = formatToDMY(invoiceState.dueDate) || '';
    if (DOM.dueDateNative) DOM.dueDateNative.value = formatToISO(DOM.dueDate.value);
  }

  // From
  if (DOM.fromCompany) DOM.fromCompany.value = invoiceState.from ? (invoiceState.from.company || '') : '';
  if (DOM.fromName) DOM.fromName.value = invoiceState.from ? (invoiceState.from.name || '') : '';
  if (DOM.fromAddress) {
    let addr = invoiceState.from ? (invoiceState.from.address || '') : '';
    const country = invoiceState.from ? (invoiceState.from.country || '') : '';
    if (country && !addr.includes(country)) {
      addr = addr ? `${addr} - ${country}` : country;
      if (invoiceState.from) invoiceState.from.address = addr;
    }
    DOM.fromAddress.value = addr;
  }
  if (DOM.fromEmail) DOM.fromEmail.value = invoiceState.from ? (invoiceState.from.email || '') : '';
  if (DOM.fromPhone) DOM.fromPhone.value = invoiceState.from ? (invoiceState.from.phone || '') : '';

  // To
  if (DOM.toCompany) DOM.toCompany.value = invoiceState.to ? (invoiceState.to.company || '') : '';
  if (DOM.toName) DOM.toName.value = invoiceState.to ? (invoiceState.to.name || '') : '';
  if (DOM.toAddress) {
    let addr = invoiceState.to ? (invoiceState.to.address || '') : '';
    const country = invoiceState.to ? (invoiceState.to.country || '') : '';
    if (country && !addr.includes(country)) {
      addr = addr ? `${addr} - ${country}` : country;
      if (invoiceState.to) invoiceState.to.address = addr;
    }
    DOM.toAddress.value = addr;
  }
  if (DOM.toEmail) DOM.toEmail.value = invoiceState.to ? (invoiceState.to.email || '') : '';
  if (DOM.toPhone) DOM.toPhone.value = invoiceState.to ? (invoiceState.to.phone || '') : '';

  // Quotation Greeting
  if (DOM.greetingContent) {
    const rawGreeting = invoiceState.greetingText || '';
    const cleanGreeting = sanitizeGreetingHtml(rawGreeting);
    invoiceState.greetingText = cleanGreeting;
    DOM.greetingContent.innerHTML = formatNotesToHtml(cleanGreeting);

    const savedGreetingSize = invoiceState.greetingFontSize || '14px';
    DOM.greetingContent.style.fontSize = savedGreetingSize;
    if (DOM.greetingFontSizeSelect) {
      DOM.greetingFontSizeSelect.value = savedGreetingSize;
    }
  }
  updateGreetingToggleState();

  // Currency & Notes
  if (DOM.currencySelect) DOM.currencySelect.value = invoiceState.currency || 'IDR';
  if (DOM.paymentNotes) {
    let cleanNotes = invoiceState.paymentNotes || '';
    cleanNotes = cleanNotes.replace(/^(?:<[^>]+>)*\s*(?:Metode Pembayaran|Keterangan|Syarat & Ketentuan Penawaran)\s*:\s*(?:<\/?(?:br|p|div)[^>]*>|\n)*/i, '');
    invoiceState.paymentNotes = cleanNotes;
    
    if (DOM.paymentNotes.tagName === 'TEXTAREA') {
      DOM.paymentNotes.value = cleanNotes;
      setTimeout(() => autoResize(DOM.paymentNotes), 0);
    } else {
      DOM.paymentNotes.innerHTML = formatNotesToHtml(cleanNotes);
    }

    const savedSize = invoiceState.paymentNotesFontSize || '14px';
    DOM.paymentNotes.style.fontSize = savedSize;
    if (DOM.notesFontSizeSelect) {
      DOM.notesFontSizeSelect.value = savedSize;
    }
  }

  // Sync Language
  setDocumentLanguage(invoiceState.docLang || 'id', true);

  // Sync Document Type (Invoice vs Quotation)
  setDocumentType(invoiceState.docType || 'invoice', true);

  // Sync Tax Mode
  setTaxMode(invoiceState.taxMode || 'with_tax', true);

  // Sync Live Signatures
  updateSignaturesView();

  if (invoiceState.logo) {
    setLogo(invoiceState.logo);
  } else {
    removeLogo();
  }
}

// Update State from Form Inputs
function readInputsToState() {
  if (DOM.docLangSelect) {
    invoiceState.docLang = DOM.docLangSelect.value;
  }
  if (DOM.docTypeSelect) {
    invoiceState.docType = DOM.docTypeSelect.value;
  }
  if (DOM.docSubjectInput) {
    invoiceState.subject = DOM.docSubjectInput.value.trim();
  }
  if (DOM.greetingContent) {
    let cleanGreeting = DOM.greetingContent.innerHTML ? sanitizeGreetingHtml(DOM.greetingContent.innerHTML) : '';
    if (cleanGreeting === '<br>' || !DOM.greetingContent.textContent.trim()) {
      cleanGreeting = '';
    }
    invoiceState.greetingText = cleanGreeting;
    invoiceState.greetingFontSize = DOM.greetingFontSizeSelect ? DOM.greetingFontSizeSelect.value : (invoiceState.greetingFontSize || '14px');
  }
  if (DOM.invoiceTypeSelect) {
    invoiceState.taxMode = DOM.invoiceTypeSelect.value;
  }
  if (DOM.invoiceTitleInput) {
    invoiceState.title = DOM.invoiceTitleInput.value.trim() || (invoiceState.docType === 'quotation' ? 'SURAT PENAWARAN HARGA' : 'INVOICE');
  }
  if (DOM.topInvoiceTitleInput) {
    invoiceState.invoiceName = DOM.topInvoiceTitleInput.value.trim();
  }
  if (DOM.invoiceSubtitleInput) {
    invoiceState.subtitle = DOM.invoiceSubtitleInput.value.trim();
  }
  if (DOM.invoiceNumber) {
    invoiceState.invoiceNumber = DOM.invoiceNumber.value;
  }
  if (DOM.issueDate) {
    invoiceState.issueDate = formatToDMY(DOM.issueDate.value);
  }
  if (DOM.dueDate) {
    invoiceState.dueDate = formatToDMY(DOM.dueDate.value);
  }

  invoiceState.from = {
    company: DOM.fromCompany ? DOM.fromCompany.value : '',
    name: DOM.fromName ? DOM.fromName.value : '',
    address: DOM.fromAddress ? DOM.fromAddress.value : '',
    email: DOM.fromEmail ? DOM.fromEmail.value : '',
    phone: DOM.fromPhone ? DOM.fromPhone.value : ''
  };

  invoiceState.to = {
    company: DOM.toCompany ? DOM.toCompany.value : '',
    name: DOM.toName ? DOM.toName.value : '',
    address: DOM.toAddress ? DOM.toAddress.value : '',
    email: DOM.toEmail ? DOM.toEmail.value : '',
    phone: DOM.toPhone ? DOM.toPhone.value : ''
  };

  if (DOM.currencySelect) invoiceState.currency = DOM.currencySelect.value;
  if (DOM.paymentNotes) {
    let cleanNotes = DOM.paymentNotes.tagName === 'TEXTAREA' ? (DOM.paymentNotes.value || '') : (DOM.paymentNotes.innerHTML || '');
    if (cleanNotes === '<br>' || !DOM.paymentNotes.textContent.trim()) {
      cleanNotes = '';
    }
    cleanNotes = cleanNotes.replace(/^(?:<[^>]+>)*\s*(?:Metode Pembayaran|Keterangan|Syarat & Ketentuan Penawaran)\s*:\s*(?:<\/?(?:br|p|div)[^>]*>|\n)*/i, '');
    invoiceState.paymentNotes = cleanNotes;
    invoiceState.paymentNotesFontSize = DOM.notesFontSizeSelect ? DOM.notesFontSizeSelect.value : (invoiceState.paymentNotesFontSize || '14px');
  }

  updateSignaturesView();
}

// Update specific active card in left panel without stealing focus or resetting inputs
function updateCardInListWithoutDisruptingFocus() {
  if (!DOM.savedInvoicesList) return;
  const activeCard = DOM.savedInvoicesList.querySelector(`.invoice-card-item[data-id="${invoiceState.id}"]`);
  if (activeCard && !activeCard.querySelector('.card-inline-edit')) {
    const total = calculateInvoiceTotal(invoiceState);
    const clientName = (invoiceState.to && (invoiceState.to.company || invoiceState.to.name)) || 'Tanpa Klien';
    const invoiceTitle = invoiceState.invoiceName ? invoiceState.invoiceName : clientName;

    const titleEl = activeCard.querySelector('.card-invoice-title');
    const clientSpan = activeCard.querySelector('.card-client span');
    const totalEl = activeCard.querySelector('.card-total');
    const numEl = activeCard.querySelector('.card-number');
    const dateEl = activeCard.querySelector('.card-date');

    const titleTextEl = activeCard.querySelector('.card-invoice-title-text');
    if (titleTextEl) {
      titleTextEl.textContent = invoiceTitle;
      activeCard.querySelector('.card-invoice-title').title = `Klik untuk edit judul: ${invoiceTitle}`;
    } else if (titleEl) {
      titleEl.textContent = invoiceTitle;
      titleEl.title = invoiceTitle;
    }
    if (clientSpan) {
      clientSpan.textContent = clientName;
      const clientRow = activeCard.querySelector('.card-client');
      if (clientRow) clientRow.title = `Klien: ${clientName}`;
    }
    if (totalEl) totalEl.textContent = formatCurrency(total, invoiceState.currency || 'IDR');
    if (numEl) numEl.textContent = `#${invoiceState.invoiceNumber || 'Draft'}`;
    if (dateEl) dateEl.textContent = formatToDMY(invoiceState.issueDate) || 'Draft';
  } else if (!activeCard) {
    renderSavedInvoicesList(DOM.invoiceSearchInput ? DOM.invoiceSearchInput.value.trim().toLowerCase() : '');
  }
}

// Save Current State to LocalStorage (debounced auto-save)
let saveTimeout;
function saveDraftToStorage() {
  if (DOM.autoSaveBadge) {
    DOM.autoSaveBadge.classList.add('saving');
    const span = DOM.autoSaveBadge.querySelector('span');
    if (span) span.textContent = 'Menyimpan...';
  }

  // Record a debounced undo snapshot for field-level edits
  if (!_isRestoringHistory) {
    const isEn = invoiceState.docLang === 'en';
    pushHistoryStateDebounced(isEn ? 'Edit field' : 'Edit kolom');
  }

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    readInputsToState();
    StorageManager.saveDraft(invoiceState);
    
    // Auto-save active invoice to saved invoices list ONLY if it already exists in the saved list
    if (invoiceState.id) {
      const invoices = StorageManager.getSavedInvoices();
      if (invoices.some(inv => inv.id === invoiceState.id)) {
        StorageManager.saveInvoice(invoiceState);
        updateCardInListWithoutDisruptingFocus();
      }
    }

    if (DOM.autoSaveBadge) {
      DOM.autoSaveBadge.classList.remove('saving');
      const span = DOM.autoSaveBadge.querySelector('span');
      if (span) span.textContent = 'Tersimpan';
    }
  }, 350);
}

// Alias for triggerAutoSave (used by date pickers, rich text toolbars, etc.)
const triggerAutoSave = saveDraftToStorage;

// Setup Rich Text Toolbar for Payment Notes (Keterangan)
function setupNotesToolbar() {
  if (!DOM.paymentNotes) return;

  function updateToolbarActiveState() {
    if (!DOM.paymentNotes) return;
    try {
      const isBold = document.queryCommandState('bold');
      const isItalic = document.queryCommandState('italic');
      const isStrike = document.queryCommandState('strikeThrough');

      if (DOM.btnFormatBold) DOM.btnFormatBold.classList.toggle('active', !!isBold);
      if (DOM.btnFormatItalic) DOM.btnFormatItalic.classList.toggle('active', !!isItalic);
      if (DOM.btnFormatStrike) DOM.btnFormatStrike.classList.toggle('active', !!isStrike);
    } catch (e) {}
  }

  function executeFormat(command, value = null) {
    DOM.paymentNotes.focus();
    document.execCommand(command, false, value);
    updateToolbarActiveState();
    readInputsToState();
    saveDraftToStorage();
    triggerAutoSave();
  }

  // Prevent toolbar buttons from stealing focus / losing text selection on mousedown
  if (DOM.notesFormatToolbar) {
    const buttons = DOM.notesFormatToolbar.querySelectorAll('.format-btn');
    buttons.forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
    });
  }

  // Format button click listeners
  if (DOM.btnFormatBold) {
    DOM.btnFormatBold.addEventListener('click', () => executeFormat('bold'));
  }

  if (DOM.btnFormatItalic) {
    DOM.btnFormatItalic.addEventListener('click', () => executeFormat('italic'));
  }

  if (DOM.btnFormatStrike) {
    DOM.btnFormatStrike.addEventListener('click', () => executeFormat('strikeThrough'));
  }

  if (DOM.btnFormatClear) {
    DOM.btnFormatClear.addEventListener('click', () => {
      DOM.paymentNotes.focus();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // Nothing selected: select all and strip formatting
        document.execCommand('selectAll', false, null);
        document.execCommand('removeFormat', false, null);
        // Clean any residual strike tags
        DOM.paymentNotes.querySelectorAll('s, strike, del').forEach(s => {
          const textNode = document.createTextNode(s.textContent);
          s.parentNode.replaceChild(textNode, s);
        });
        sel.collapseToEnd();
      } else {
        document.execCommand('removeFormat', false, null);
        try {
          const range = sel.getRangeAt(0);
          let parent = range.commonAncestorContainer;
          if (parent && parent.nodeType === 3) parent = parent.parentNode;
          const strikeEl = parent ? parent.closest('s, strike, del') : null;
          if (strikeEl) {
            const textNode = document.createTextNode(strikeEl.textContent);
            strikeEl.parentNode.replaceChild(textNode, strikeEl);
          }
        } catch (e) {}
      }
      updateToolbarActiveState();
      readInputsToState();
      saveDraftToStorage();
      triggerAutoSave();
    });
  }

  // Font size selector
  if (DOM.notesFontSizeSelect) {
    DOM.notesFontSizeSelect.addEventListener('change', () => {
      const size = DOM.notesFontSizeSelect.value;
      DOM.paymentNotes.style.fontSize = size;
      invoiceState.paymentNotesFontSize = size;
      readInputsToState();
      saveDraftToStorage();
      triggerAutoSave();
    });
  }

  // Active state listeners on selection / caret movement
  DOM.paymentNotes.addEventListener('keyup', updateToolbarActiveState);
  DOM.paymentNotes.addEventListener('mouseup', updateToolbarActiveState);
  DOM.paymentNotes.addEventListener('input', () => {
    updateToolbarActiveState();
    if (DOM.paymentNotes.innerHTML === '<br>' || !DOM.paymentNotes.textContent.trim()) {
      DOM.paymentNotes.innerHTML = '';
    }
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === DOM.paymentNotes) {
      updateToolbarActiveState();
    }
  });

  // Paste handler: insert clean text to avoid foreign HTML styles
  DOM.paymentNotes.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // Keyboard shortcut handler for bold/italic updates and strikethrough (Ctrl+Shift+X or Alt+Shift+5)
  DOM.paymentNotes.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      setTimeout(updateToolbarActiveState, 0);
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      setTimeout(updateToolbarActiveState, 0);
    }
    if (((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'x' || e.key === 'X')) ||
        (e.altKey && e.shiftKey && e.key === '5')) {
      e.preventDefault();
      executeFormat('strikeThrough');
    }
  });
}

// Setup Rich Text Toolbar & Sanitation for Quotation Greeting (Surat Pengantar)
function setupGreetingToolbar() {
  if (!DOM.greetingContent) return;

  function updateGreetingToolbarActiveState() {
    if (!DOM.greetingContent) return;
    try {
      const isBold = document.queryCommandState('bold');
      const isItalic = document.queryCommandState('italic');

      if (DOM.btnGreetingBold) DOM.btnGreetingBold.classList.toggle('active', !!isBold);
      if (DOM.btnGreetingItalic) DOM.btnGreetingItalic.classList.toggle('active', !!isItalic);
    } catch (e) {}
  }

  function executeGreetingFormat(command, value = null) {
    DOM.greetingContent.focus();
    document.execCommand(command, false, value);
    updateGreetingToolbarActiveState();
    readInputsToState();
    saveDraftToStorage();
    triggerAutoSave();
  }

  // Prevent toolbar buttons from stealing focus / losing text selection
  if (DOM.greetingFormatToolbar) {
    const buttons = DOM.greetingFormatToolbar.querySelectorAll('.format-btn');
    buttons.forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
    });
  }

  if (DOM.btnGreetingBold) {
    DOM.btnGreetingBold.addEventListener('click', () => executeGreetingFormat('bold'));
  }

  if (DOM.btnGreetingItalic) {
    DOM.btnGreetingItalic.addEventListener('click', () => executeGreetingFormat('italic'));
  }

  if (DOM.btnGreetingClear) {
    DOM.btnGreetingClear.addEventListener('click', () => {
      DOM.greetingContent.focus();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        document.execCommand('selectAll', false, null);
        document.execCommand('removeFormat', false, null);
        sel.collapseToEnd();
      } else {
        document.execCommand('removeFormat', false, null);
      }
      DOM.greetingContent.innerHTML = sanitizeGreetingHtml(DOM.greetingContent.innerHTML);
      updateGreetingToolbarActiveState();
      readInputsToState();
      saveDraftToStorage();
      triggerAutoSave();
      showToast('Format surat pengantar dinormalkan!', 'info');
    });
  }

  // Font size selector for greeting
  if (DOM.greetingFontSizeSelect) {
    DOM.greetingFontSizeSelect.addEventListener('change', () => {
      const size = DOM.greetingFontSizeSelect.value;
      DOM.greetingContent.style.fontSize = size;
      invoiceState.greetingFontSize = size;
      readInputsToState();
      saveDraftToStorage();
      triggerAutoSave();
    });
  }

  // Active state listeners on selection / caret movement
  DOM.greetingContent.addEventListener('keyup', updateGreetingToolbarActiveState);
  DOM.greetingContent.addEventListener('mouseup', updateGreetingToolbarActiveState);
  DOM.greetingContent.addEventListener('input', () => {
    updateGreetingToolbarActiveState();
    if (DOM.greetingContent.innerHTML === '<br>' || !DOM.greetingContent.textContent.trim()) {
      DOM.greetingContent.innerHTML = '';
    }
    readInputsToState();
    saveDraftToStorage();
    triggerAutoSave();
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === DOM.greetingContent) {
      updateGreetingToolbarActiveState();
    }
  });

  // Paste handler: enforce clean plain text to prevent foreign black box background and monospace styling
  DOM.greetingContent.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    readInputsToState();
    saveDraftToStorage();
    triggerAutoSave();
  });
}

// Attach Event Listeners to static inputs
function attachInputListeners() {
  const inputs = [
    DOM.invoiceTitleInput, DOM.topInvoiceTitleInput, DOM.invoiceSubtitleInput, DOM.invoiceNumber, DOM.issueDate, DOM.dueDate,
    DOM.fromCompany, DOM.fromName, DOM.fromAddress, DOM.fromEmail, DOM.fromPhone,
    DOM.toCompany, DOM.toName, DOM.toAddress, DOM.toEmail, DOM.toPhone,
    DOM.paymentNotes
  ].filter(Boolean);

  inputs.forEach(input => {
    input.addEventListener('input', () => {
      if (input.tagName === 'TEXTAREA') {
        autoResize(input);
      }
      if (input === DOM.invoiceTitleInput || input === DOM.invoiceNumber) {
        autoResizeInput(input);
      }
      if (input === DOM.invoiceSubtitleInput && DOM.invoiceProjectTitleWrap) {
        DOM.invoiceProjectTitleWrap.classList.toggle('is-empty', !input.value.trim());
      }
      if (input === DOM.topInvoiceTitleInput) {
        const val = input.value.trim();
        invoiceState.invoiceName = val;
        
        // Update active card title in left panel live
        const activeCard = DOM.savedInvoicesList ? DOM.savedInvoicesList.querySelector(`.invoice-card-item[data-id="${invoiceState.id}"]`) : null;
        if (activeCard) {
          const titleTextEl = activeCard.querySelector('.card-invoice-title-text');
          const titleEl = activeCard.querySelector('.card-invoice-title');
          const clientName = (invoiceState.to && (invoiceState.to.company || invoiceState.to.name)) || 'Tanpa Klien';
          if (titleTextEl) {
            titleTextEl.textContent = val || clientName;
          } else if (titleEl) {
            titleEl.textContent = val || clientName;
          }
          if (titleEl) {
            titleEl.title = `Klik untuk edit judul: ${val || clientName}`;
          }
        }
      }
      saveDraftToStorage();
    });
  });

  if (DOM.topInvoiceTitleInput) {
    DOM.topInvoiceTitleInput.addEventListener('change', () => {
      readInputsToState();
      StorageManager.saveDraft(invoiceState);
      if (invoiceState.id) {
        const invoices = StorageManager.getSavedInvoices();
        if (invoices.some(inv => inv.id === invoiceState.id)) {
          StorageManager.saveInvoice(invoiceState);
          updateCardInListWithoutDisruptingFocus();
        }
      }
    });

    DOM.topInvoiceTitleInput.addEventListener('blur', () => {
      DOM.topInvoiceTitleInput.scrollLeft = 0;
    });
  }

  DOM.currencySelect.addEventListener('change', () => {
    const isEn = invoiceState.docLang === 'en';
    pushHistoryState(isEn ? 'Change currency' : 'Ubah mata uang');
    invoiceState.currency = DOM.currencySelect.value;
    renderItems();
    saveDraftToStorage();
  });

  DOM.itemsList.addEventListener('input', handleItemInput);
  DOM.itemsList.addEventListener('click', handleItemClick);
  DOM.itemsList.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      e.target.dataset.focusedVal = e.target.value;
    }
  });

  // Track focus snapshot for ALL inputs/textareas (enables smart native vs page undo)
  const invoiceSheet = document.getElementById('invoice-sheet') || document.querySelector('.invoice-editor');
  if (invoiceSheet) {
    invoiceSheet.addEventListener('focusin', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        e.target.dataset.focusedVal = e.target.value;
      }
      if (e.target && e.target.isContentEditable) {
        e.target.dataset.focusedVal = e.target.textContent || '';
      }
    });
  }

  DOM.btnAddItem.addEventListener('click', addItem);

  if (DOM.btnUndoItem) {
    DOM.btnUndoItem.addEventListener('click', undoItemAction);
  }
  if (DOM.btnRedoItem) {
    DOM.btnRedoItem.addEventListener('click', redoItemAction);
  }

  // Global Keyboard Shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  // Now works for ALL page changes, not just item rows.
  window.addEventListener('keydown', (e) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    if (!isCmdOrCtrl) return;

    const key = e.key ? e.key.toLowerCase() : '';
    if (key !== 'z' && key !== 'y') return;

    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      (activeEl.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'file'].includes(activeEl.type)) ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );

    // When inside a text input, let the browser handle native undo first
    // if the field has unsaved local edits (value differs from focus snapshot).
    // Otherwise intercept and use our full-page undo/redo.
    if (isTextInput) {
      const focusedVal = activeEl.dataset.focusedVal;
      const currentVal = activeEl.value !== undefined ? activeEl.value : (activeEl.textContent || '');
      if (focusedVal !== undefined && currentVal !== focusedVal) {
        // Let browser handle native text undo/redo for this keystroke
        return;
      }
    }

    e.preventDefault();

    // Undo: Ctrl+Z (without Shift)
    if (key === 'z' && !e.shiftKey) {
      if (itemUndoStack.length > 0) {
        undoItemAction();
      } else {
        const isEn = invoiceState.docLang === 'en';
        showToast(isEn ? 'Nothing to undo' : 'Tidak ada perubahan untuk di-undo', 'info');
      }
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z
    else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (itemRedoStack.length > 0) {
        redoItemAction();
      } else {
        const isEn = invoiceState.docLang === 'en';
        showToast(isEn ? 'Nothing to redo' : 'Tidak ada perubahan untuk di-redo', 'info');
      }
    }
  });

  // Save Sender Profile
  DOM.btnSaveProfile.addEventListener('click', () => {
    readInputsToState();
    const profile = {
      from: invoiceState.from,
      paymentNotes: invoiceState.paymentNotes,
      paymentNotesFontSize: invoiceState.paymentNotesFontSize || '14px',
      logo: invoiceState.logo
    };
    StorageManager.saveSenderProfile(profile);
    showToast('Data profil bisnis & rekening berhasil disimpan!');
  });

  // Save Current Invoice to Invoices List
  DOM.btnSaveCurrent.addEventListener('click', () => {
    readInputsToState();
    const isQuo = invoiceState.docType === 'quotation';
    if (!invoiceState.id) {
      invoiceState.id = (isQuo ? 'quo-' : 'inv-') + Date.now();
    }
    const success = StorageManager.saveInvoice(invoiceState);
    const docLabel = isQuo ? 'Quotation' : 'Invoice';
    if (success) {
      renderSavedInvoicesList();
      showToast(`${docLabel} #${invoiceState.invoiceNumber} berhasil disimpan!`);
    } else {
      showToast(`Gagal menyimpan ${docLabel.toLowerCase()}`, 'danger');
    }
  });

  // Search Invoices Filter
  if (DOM.invoiceSearchInput) {
    DOM.invoiceSearchInput.addEventListener('input', (e) => {
      renderSavedInvoicesList(e.target.value.trim().toLowerCase());
    });
  }

  // Panel New Invoice Button (+ Invoice Baru di dalam daftar)
  if (DOM.btnPanelNewInv) {
    DOM.btnPanelNewInv.addEventListener('click', () => {
      createNewBlankInvoice();
    });
  }

  // Panel New Quotation Button (+ Quotation Baru di dalam daftar)
  if (DOM.btnPanelNewQuo) {
    DOM.btnPanelNewQuo.addEventListener('click', () => {
      createNewBlankQuotation();
    });
  }

  // Quotation Subject Input Listener
  if (DOM.docSubjectInput) {
    DOM.docSubjectInput.addEventListener('input', () => {
      invoiceState.subject = DOM.docSubjectInput.value.trim();
      saveDraftToStorage();
    });
  }

  // Live update signature box whenever sender or recipient names/companies change
  [DOM.fromCompany, DOM.fromName, DOM.toCompany, DOM.toName].filter(Boolean).forEach(inputEl => {
    inputEl.addEventListener('input', updateSignaturesView);
  });

  // Invoice Title Input Listener
  if (DOM.invoiceTitleInput) {
    DOM.invoiceTitleInput.addEventListener('input', saveDraftToStorage);
  }

  // Print Action
  function triggerPrint() {
    window.focus();
    try {
      window.print();
    } catch (e) {
      console.warn('Direct window.print() failed, alerting parent window:', e);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'PRINT_INVOICE_REQUEST' }, '*');
      }
    }
  }

  DOM.btnPrint.addEventListener('click', triggerPrint);

  // Download High Quality PDF
  DOM.btnDownloadPdf.addEventListener('click', downloadPDF);

  // Sidebar Actions Synchronization
  if (DOM.navSaveProfile) {
    DOM.navSaveProfile.addEventListener('click', () => DOM.btnSaveProfile.click());
  }
  if (DOM.navPrint) {
    DOM.navPrint.addEventListener('click', () => DOM.btnPrint.click());
  }
  if (DOM.navDownloadPdf) {
    DOM.navDownloadPdf.addEventListener('click', () => DOM.btnDownloadPdf.click());
  }
  if (DOM.navEditor) {
    DOM.navEditor.addEventListener('click', () => {
      DOM.invoiceSheet.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (DOM.btnNew) {
    DOM.btnNew.addEventListener('click', () => createNewBlankInvoice());
  }
  if (DOM.navNewInv) {
    DOM.navNewInv.addEventListener('click', () => createNewBlankInvoice());
  }
}

// Function to create a clean new blank invoice (user triggered)
function createNewBlankInvoice() {
  resetToNewBlankDocument('invoice', false, true);
}

// Function to create a clean new blank quotation tailored for vendor video, photo & photobooth
function createNewBlankQuotation() {
  resetToNewBlankDocument('quotation', false, true);
}

// Internal function to reset editor state to a blank document (invoice or quotation)
function resetToNewBlankDocument(type = 'invoice', askConfirm = false, autoSaveCurrent = false) {
  const isQuo = type === 'quotation';
  const label = isQuo ? 'quotation letter (surat penawaran)' : 'invoice';

  if (askConfirm) {
    if (!confirm(`Buka lembaran ${label} baru? Dokumen saat ini akan tersimpan otomatis.`)) {
      return;
    }
  }

  clearTimeout(saveTimeout);

  // Auto-save current invoice ONLY if requested AND it exists in saved list
  if (autoSaveCurrent && invoiceState.id) {
    const invoices = StorageManager.getSavedInvoices();
    if (invoices.some(inv => inv.id === invoiceState.id)) {
      readInputsToState();
      StorageManager.saveInvoice(invoiceState);
    }
  }

  clearHistoryStacks();
  const savedProfile = StorageManager.loadSenderProfile();
  
  const currentLang = invoiceState.docLang || 'id';
  const isEn = currentLang === 'en';
  const t = TRANSLATIONS[currentLang];
  const presetVideo = isEn ? VENDOR_PRESETS_EN.video : VENDOR_PRESETS_ID.video;

  invoiceState = {
    id: (isQuo ? 'quo-' : 'inv-') + Date.now(),
    invoiceName: isQuo ? (isEn ? 'Quotation - Video & Photo' : 'Penawaran Video & Foto') : '',
    subtitle: '',
    title: isQuo ? t.titleQuotation : t.titleInvoice,
    logo: savedProfile ? savedProfile.logo : '',
    docType: type,
    docLang: currentLang,
    subject: isQuo ? t.defaultSubjectQuotation : t.defaultSubjectInvoice,
    greetingText: isQuo
      ? (isEn ? DEFAULT_GREETING_QUOTATION_EN : DEFAULT_GREETING_QUOTATION_ID)
      : (isEn ? DEFAULT_GREETING_INVOICE_EN : DEFAULT_GREETING_INVOICE_ID),
    showGreeting: true,
    invoiceNumber: isQuo ? generateDefaultQuotationNumber() : generateDefaultInvoiceNumber(),
    issueDate: '',
    dueDate: '',
    from: savedProfile ? savedProfile.from : {
      company: 'Bluudz Creative',
      name: 'Johan Habibie',
      address: 'Surabaya - Indonesia',
      email: 'johanhabibie12@gmail.com',
      phone: '+6285854321667'
    },
    to: {
      company: '',
      name: '',
      address: '',
      email: '',
      phone: ''
    },
    items: isQuo ? [
      {
        id: generateId(),
        name: presetVideo.name,
        description: presetVideo.description,
        qty: presetVideo.qty,
        price: presetVideo.price,
        tax: presetVideo.tax
      }
    ] : [
      {
        id: generateId(),
        name: '',
        description: '',
        qty: 1,
        price: 0,
        tax: 0
      }
    ],
    currency: 'IDR',
    taxMode: isQuo ? 'no_tax' : (invoiceState.taxMode || 'with_tax'),
    paymentNotes: isQuo ? (isEn ? DEFAULT_QUOTATION_TERMS_EN : DEFAULT_QUOTATION_TERMS_ID) : (savedProfile ? savedProfile.paymentNotes : (isEn ? DEFAULT_INVOICE_NOTES_EN : DEFAULT_INVOICE_NOTES_ID)),
    paymentNotesFontSize: savedProfile && savedProfile.paymentNotesFontSize ? savedProfile.paymentNotesFontSize : '14px',
    customNotes: ''
  };

  StorageManager.setActiveInvoiceId(invoiceState.id);
  initDates();
  syncInputsWithState();
  renderItems();
  StorageManager.saveDraft(invoiceState);
  renderSavedInvoicesList();

  showToast(isQuo ? 'Lembaran Surat Penawaran baru siap digunakan!' : 'Lembaran Invoice baru kosong siap digunakan!');

  // Smooth scroll to top of invoice sheet
  if (DOM.invoiceSheet) {
    DOM.invoiceSheet.scrollIntoView({ behavior: 'smooth' });
  }
}

// Collapsible Sidebar Setup
function setupSidebar() {
  const isCollapsed = StorageManager.loadSidebarCollapsed();
  if (isCollapsed) {
    document.body.classList.remove('sidebar-expanded');
    document.body.classList.add('sidebar-collapsed');
  } else {
    document.body.classList.add('sidebar-expanded');
    document.body.classList.remove('sidebar-collapsed');
  }

  function toggleSidebar() {
    const currentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    if (currentlyCollapsed) {
      document.body.classList.remove('sidebar-collapsed');
      document.body.classList.add('sidebar-expanded');
      StorageManager.saveSidebarCollapsed(false);
    } else {
      document.body.classList.remove('sidebar-expanded');
      document.body.classList.add('sidebar-collapsed');
      StorageManager.saveSidebarCollapsed(true);
    }
  }

  if (DOM.sidebarToggleBtn) {
    DOM.sidebarToggleBtn.addEventListener('click', toggleSidebar);
  }

  if (DOM.mobileMenuBtn) {
    DOM.mobileMenuBtn.addEventListener('click', toggleSidebar);
  }
}

// Download High-Resolution PDF Function using direct html2canvas + jsPDF
async function downloadPDF() {
  const sheet = DOM.invoiceSheet;
  if (!sheet) {
    showToast('Elemen invoice tidak ditemukan', 'danger');
    return;
  }

  // Ensure state is completely up-to-date from all live inputs
  readInputsToState();

  // Helper to sanitize text for safe cross-platform filenames
  const sanitizeForFilename = (str, fallback = '') => {
    if (!str) return fallback;
    const cleaned = String(str)
      .replace(/[\r\n]+/g, ' ')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  };

  // 1. Nomor Invoice
  const rawInvNum = (DOM.invoiceNumber ? DOM.invoiceNumber.value.trim() : '') || invoiceState.invoiceNumber || 'Document';
  const invNumber = sanitizeForFilename(rawInvNum.replace(/^#/, ''), 'Document');

  // 2. Nama judul invoice (yang ada di panel kiri & panel judul di atas)
  let rawTitle = (DOM.topInvoiceTitleInput ? DOM.topInvoiceTitleInput.value.trim() : '') || invoiceState.invoiceName || '';
  if (!rawTitle) {
    // Check if active card in the left panel has a title
    const activeCardTitle = DOM.savedInvoicesList ? DOM.savedInvoicesList.querySelector('.invoice-card-item.active .card-invoice-title') : null;
    if (activeCardTitle && activeCardTitle.textContent.trim()) {
      rawTitle = activeCardTitle.textContent.trim();
    }
  }
  if (!rawTitle) {
    // Fallback to client company or client name
    const clientName = ((DOM.toCompany ? DOM.toCompany.value.trim() : '') || 
                        (DOM.toName ? DOM.toName.value.trim() : '') || 
                        (invoiceState.to && (invoiceState.to.company || invoiceState.to.name)) || '').trim();
    rawTitle = clientName || 'Invoice';
  }
  const invoiceTitle = sanitizeForFilename(rawTitle, 'Invoice');

  // 3. Due Date
  const rawDueDate = (DOM.dueDate ? DOM.dueDate.value.trim() : '') || invoiceState.dueDate || '';
  const dueDate = sanitizeForFilename(rawDueDate, 'NoDueDate');

  // Format: Invoice_nomor / Quotation_nomor
  const isQuotation = invoiceState.docType === 'quotation';
  const prefix = isQuotation ? 'Quotation' : 'Invoice';
  const filename = `${prefix}_${invNumber}_${invoiceTitle}_${dueDate}.pdf`;

  console.log('Generating PDF with filename:', filename);
  showToast(`Memproses ${filename}...`);

  // Blur active element so caret/focus outline is removed
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  // Apply exporting-pdf styling temporarily
  document.body.classList.add('exporting-pdf');

  try {
    // Wait for web fonts and CSS layout update
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise(r => setTimeout(r, 120));

    const html2canvasFn = window.html2canvas;
    if (!html2canvasFn) {
      throw new Error('html2canvas library tidak ditemukan');
    }

    // Capture the live visible invoice sheet with transformed text elements in onclone
    const canvas = await html2canvasFn(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        const clonedSheet = clonedDoc.getElementById('invoice-sheet');
        if (!clonedSheet) return;
        clonedSheet.style.boxShadow = 'none';
        clonedSheet.style.border = 'none';
        clonedSheet.style.margin = '0 auto';

        // Remove interactive vendor presets toolbar from PDF
        const clonedPresets = clonedSheet.querySelector('#vendor-presets-toolbar');
        if (clonedPresets) clonedPresets.remove();

        // Handle greeting section in PDF (both Quotation and Invoice)
        const clonedGreeting = clonedSheet.querySelector('#quotation-greeting-section');
        if (clonedGreeting) {
          if (invoiceState.showGreeting === false || clonedGreeting.classList.contains('is-hidden-in-doc') || clonedGreeting.classList.contains('hidden')) {
            clonedGreeting.remove();
          } else {
            const header = clonedGreeting.querySelector('.greeting-header');
            if (header) header.remove();
            const content = clonedGreeting.querySelector('#greeting-content');
            if (content) {
              content.removeAttribute('contenteditable');
              content.style.whiteSpace = 'pre-wrap';
              content.style.wordBreak = 'break-word';
              content.style.fontSize = invoiceState.greetingFontSize || '14px';
              content.style.lineHeight = '1.7';
              content.style.color = '#334155';
              content.style.fontFamily = 'var(--font-family)';
              content.style.background = 'transparent';
              content.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style');
                el.removeAttribute('face');
                el.removeAttribute('color');
                el.removeAttribute('bgcolor');
              });
            }
          }
        }

        // Handle quotation signatures section in PDF
        const clonedSigs = clonedSheet.querySelector('#quotation-signatures-section');
        if (clonedSigs) {
          if (!isQuotation || clonedSigs.classList.contains('hidden')) {
            clonedSigs.remove();
          } else {
            clonedSigs.style.display = 'grid';
            clonedSigs.style.gridTemplateColumns = '1fr 1fr';
            clonedSigs.style.gap = '36px';
            clonedSigs.style.marginTop = '24px';
            clonedSigs.style.paddingTop = '14px';
          }
        }

        // If not quotation, remove subject wrap from PDF
        if (!isQuotation) {
          const clonedSubjectWrap = clonedSheet.querySelector('#doc-subject-wrap');
          if (clonedSubjectWrap) clonedSubjectWrap.remove();
        }

        // 1. Convert all textareas to clean wrapping text divs (Fixes description clipping!)
        const textareas = clonedSheet.querySelectorAll('textarea');
        textareas.forEach(textarea => {
          const val = textarea.value || '';
          if (textarea.classList.contains('input-item-desc') && !val.trim()) {
            textarea.remove();
            return;
          }
          const textDiv = clonedDoc.createElement('div');
          textDiv.textContent = val;
          textDiv.className = textarea.className;
          
          textDiv.style.fontFamily = 'inherit';
          textDiv.style.fontSize = '0.84rem';
          textDiv.style.lineHeight = '1.5';
          textDiv.style.color = '#475569';
          textDiv.style.whiteSpace = 'pre-wrap';
          textDiv.style.wordBreak = 'break-word';
          textDiv.style.overflow = 'visible';
          textDiv.style.width = '100%';
          textDiv.style.boxSizing = 'border-box';
          textDiv.style.padding = '2px 0';
          textDiv.style.border = 'none';
          textDiv.style.background = 'transparent';

          textarea.parentNode.replaceChild(textDiv, textarea);
        });

        // 1b. Format Payment Notes in Cloned Document for PDF
        const clonedPaymentNotes = clonedSheet.querySelector('#payment-notes');
        if (clonedPaymentNotes) {
          clonedPaymentNotes.removeAttribute('contenteditable');
          clonedPaymentNotes.style.fontFamily = 'inherit';
          clonedPaymentNotes.style.fontSize = invoiceState.paymentNotesFontSize || '14px';
          clonedPaymentNotes.style.lineHeight = '1.6';
          clonedPaymentNotes.style.color = '#1e293b';
          clonedPaymentNotes.style.whiteSpace = 'pre-wrap';
          clonedPaymentNotes.style.wordBreak = 'break-word';
          clonedPaymentNotes.style.overflow = 'visible';
          clonedPaymentNotes.style.width = '100%';
          clonedPaymentNotes.style.boxSizing = 'border-box';
          clonedPaymentNotes.style.padding = '2px 0';
          clonedPaymentNotes.style.border = 'none';
          clonedPaymentNotes.style.background = 'transparent';
          clonedPaymentNotes.style.boxShadow = 'none';
          clonedPaymentNotes.style.outline = 'none';

          // Ensure strikethrough lines render distinctly in PDF
          clonedPaymentNotes.querySelectorAll('s, strike, del').forEach(el => {
            el.style.textDecoration = 'line-through';
          });
        }

        // 1c. Remove formatting toolbar, date buttons, hidden native inputs, and tax badges from cloned document
        const clonedToolbar = clonedSheet.querySelector('#notes-format-toolbar');
        if (clonedToolbar) clonedToolbar.remove();

        const taxBadges = clonedSheet.querySelectorAll('.tax-unit-badge');
        taxBadges.forEach(b => b.remove());

        // Remove calendar trigger buttons and hidden native date pickers from print/PDF
        clonedSheet.querySelectorAll('.btn-date-trigger, .native-date-hidden, .no-print').forEach(el => el.remove());

        // 1d. Adjust table column widths for PDF (remove action column)
        const header = clonedSheet.querySelector('.items-table-header');
        if (invoiceState.taxMode === 'no_tax') {
          clonedSheet.classList.add('no-tax-mode');
          clonedSheet.querySelectorAll('.col-tax, #summary-tax-row').forEach(el => el.remove());
          if (header) header.style.gridTemplateColumns = '1fr 48px 120px 155px';
          clonedSheet.querySelectorAll('.item-row').forEach(row => {
            row.style.gridTemplateColumns = '1fr 48px 120px 155px';
          });
        } else {
          if (header) header.style.gridTemplateColumns = '1fr 45px 115px 75px 155px';
          clonedSheet.querySelectorAll('.item-row').forEach(row => {
            row.style.gridTemplateColumns = '1fr 45px 115px 75px 155px';
          });
        }

        // 2. Convert all inputs to clean text divs (Fixes "nvo c" title and "0" number glitches!)
        const inputs = clonedSheet.querySelectorAll('input');
        inputs.forEach(input => {
          if (input.classList.contains('native-date-hidden')) {
            input.remove();
            return;
          }
          let val = input.value || '';
          
          // Format date if applicable
          if (input.classList.contains('input-date') || input.type === 'date') {
            val = formatToDMY(val);
          }

          const textDiv = clonedDoc.createElement('div');
          textDiv.textContent = val;
          textDiv.className = input.className;
          textDiv.style.fontFamily = 'inherit';
          textDiv.style.border = 'none';
          textDiv.style.background = 'transparent';
          textDiv.style.boxSizing = 'border-box';
          textDiv.style.overflow = 'visible';
          textDiv.style.width = '100%';

          if (input.id === 'invoice-title-input') {
            textDiv.style.fontSize = '1.95rem';
            textDiv.style.fontWeight = '800';
            textDiv.style.letterSpacing = 'normal'; // Fix html2canvas letter-spacing overlap ("nvo c")!
            textDiv.style.textAlign = 'center';
            textDiv.style.textTransform = 'uppercase';
            textDiv.style.color = '#0f172a';
            textDiv.style.lineHeight = '1.2';
            textDiv.style.padding = '0';
          } else if (input.id === 'invoice-subtitle-input') {
            if (!val.trim()) {
              textDiv.style.display = 'none';
            } else {
              textDiv.style.fontSize = '0.9rem';
              textDiv.style.fontWeight = '600';
              textDiv.style.textAlign = 'center';
              textDiv.style.color = '#475569';
              textDiv.style.padding = '2px 0';
            }
          } else if (input.id === 'doc-subject-input') {
            if (!isQuotation || !val.trim()) {
              textDiv.style.display = 'none';
            } else {
              textDiv.style.fontSize = '0.88rem';
              textDiv.style.fontWeight = '600';
              textDiv.style.textAlign = 'center';
              textDiv.style.color = '#1e293b';
              textDiv.style.padding = '2px 0';
            }
          } else if (input.id === 'invoice-number') {
            textDiv.style.fontSize = '1.15rem';
            textDiv.style.fontWeight = '700';
            textDiv.style.textAlign = 'right';
            textDiv.style.color = '#0f172a';
            textDiv.style.padding = '0';
          } else if (input.classList.contains('input-date')) {
            textDiv.style.fontSize = '0.78rem';
            textDiv.style.fontWeight = '500';
            textDiv.style.textAlign = 'right';
            textDiv.style.color = '#1e293b';
            textDiv.style.padding = '0';
          } else if (input.classList.contains('party-company')) {
            textDiv.style.fontSize = '1.05rem';
            textDiv.style.fontWeight = '800';
            textDiv.style.color = '#0f172a';
            textDiv.style.padding = '2px 0';
          } else if (input.classList.contains('party-input')) {
            textDiv.style.fontSize = '0.88rem';
            textDiv.style.color = '#374151';
            textDiv.style.padding = '1px 0';
          } else if (input.classList.contains('input-item-name')) {
            textDiv.style.fontSize = '0.95rem';
            textDiv.style.fontWeight = '700';
            textDiv.style.color = '#0f172a';
            textDiv.style.padding = '2px 0';
          } else if (input.classList.contains('input-qty')) {
            textDiv.style.fontSize = '0.9rem';
            textDiv.style.fontWeight = '600';
            textDiv.style.textAlign = 'center';
            textDiv.style.color = '#1e293b';
            textDiv.style.padding = '0';
          } else if (input.classList.contains('input-price')) {
            textDiv.style.fontSize = '0.9rem';
            textDiv.style.fontWeight = '600';
            textDiv.style.textAlign = 'right';
            textDiv.style.color = '#1e293b';
            textDiv.style.paddingRight = '4px';
          } else if (input.classList.contains('input-tax')) {
            const taxNum = parseFloat(val);
            if (!isNaN(taxNum) && taxNum > 0) {
              textDiv.textContent = `${taxNum}%`;
            } else if (val === '0' || taxNum === 0) {
              textDiv.textContent = '0%';
            } else {
              textDiv.textContent = val ? `${val}%` : '0%';
            }
            textDiv.style.fontSize = '0.9rem';
            textDiv.style.fontWeight = '500';
            textDiv.style.textAlign = 'center';
            textDiv.style.color = '#1e293b';
            textDiv.style.padding = '0';
          } else {
            textDiv.style.fontSize = '0.9rem';
            textDiv.style.color = '#1e293b';
          }

          input.parentNode.replaceChild(textDiv, input);
        });

        // 3. Convert select elements (Currency selector)
        const selects = clonedSheet.querySelectorAll('select');
        selects.forEach(select => {
          const text = select.options[select.selectedIndex]?.text || select.value;
          const textSpan = clonedDoc.createElement('span');
          textSpan.textContent = text;
          textSpan.style.fontWeight = '700';
          textSpan.style.fontSize = '0.85rem';
          textSpan.style.color = '#0f172a';
          select.parentNode.replaceChild(textSpan, select);
        });

        // 4. Remove any empty optional elements in cloned output
        const emptyProjectTitle = clonedSheet.querySelector('#invoice-project-title-wrap');
        if (emptyProjectTitle && !emptyProjectTitle.textContent.trim()) {
          emptyProjectTitle.remove();
        }
      }
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas render kosong');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const jsPdfClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPdfClass) {
      throw new Error('jsPDF library tidak ditemukan');
    }

    const isLetter = invoiceState.paperSize === 'letter';
    const pdf = new jsPdfClass({
      orientation: 'portrait',
      unit: 'mm',
      format: isLetter ? 'letter' : 'a4'
    });

    const pageWidth = isLetter ? 215.9 : 210;
    const pageHeight = isLetter ? 279.4 : 297;
    const margin = 8; // 8mm
    const printWidth = pageWidth - (margin * 2);
    const printHeight = (canvas.height * printWidth) / canvas.width;

    if (printHeight <= pageHeight - (margin * 2)) {
      pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, printHeight);
    } else {
      let heightLeft = printHeight;
      let position = margin;
      const usableHeight = pageHeight - (margin * 2);

      pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
      heightLeft -= usableHeight;

      while (heightLeft > 0) {
        position = position - usableHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
        heightLeft -= usableHeight;
      }
    }

    console.log('PDF Canvas exported successfully:', canvas.width, 'x', canvas.height, 'Data length:', imgData.length);
    try {
      fetch('/api/save-preview', { method: 'POST', body: imgData });
    } catch (e) {}
    pdf.save(filename);
    showToast(`Berhasil diunduh: ${filename}`);
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Gagal memproses PDF, membuka dialog cetak...', 'danger');
    window.print();
  } finally {
    document.body.classList.remove('exporting-pdf');
  }
}

// Setup Paper Size Selector (A4 & Letter)
function setupPaperSizeSelector() {
  const savedSize = StorageManager.loadPaperSize();
  setPaperSize(savedSize);

  if (DOM.paperSizeSelect) {
    DOM.paperSizeSelect.value = savedSize;
    DOM.paperSizeSelect.addEventListener('change', (e) => {
      setPaperSize(e.target.value);
      showToast(`Ukuran kertas diatur ke: ${e.target.value.toUpperCase()}`);
    });
  }
}

function setPaperSize(size) {
  invoiceState.paperSize = size || 'a4';
  StorageManager.savePaperSize(invoiceState.paperSize);
  if (DOM.paperSizeSelect) {
    DOM.paperSizeSelect.value = invoiceState.paperSize;
  }
  if (invoiceState.paperSize === 'letter') {
    DOM.invoiceSheet.classList.add('paper-letter');
    document.body.classList.add('paper-letter-mode');
  } else {
    DOM.invoiceSheet.classList.remove('paper-letter');
    document.body.classList.remove('paper-letter-mode');
  }
}

// Setup Invoice Type Selector & Quick Toggle Button
function setupInvoiceTypeSelector() {
  if (DOM.invoiceTypeSelect) {
    DOM.invoiceTypeSelect.addEventListener('change', (e) => {
      setTaxMode(e.target.value);
    });
  }

  if (DOM.btnToggleTaxMode) {
    DOM.btnToggleTaxMode.addEventListener('click', () => {
      const newMode = (invoiceState.taxMode === 'no_tax') ? 'with_tax' : 'no_tax';
      setTaxMode(newMode);
    });
  }
}

function setTaxMode(mode, silent = false) {
  if (!silent) {
    const isEn = invoiceState.docLang === 'en';
    pushHistoryState(isEn ? 'Change tax mode' : 'Ubah tipe pajak');
  }
  invoiceState.taxMode = (mode === 'no_tax') ? 'no_tax' : 'with_tax';
  const isNoTax = invoiceState.taxMode === 'no_tax';
  const isEn = invoiceState.docLang === 'en';

  if (DOM.invoiceTypeSelect) {
    DOM.invoiceTypeSelect.value = invoiceState.taxMode;
  }
  if (DOM.toggleTaxBtnLabel) {
    DOM.toggleTaxBtnLabel.textContent = isNoTax 
      ? (isEn ? 'Type: Non-Tax (0%)' : 'Tipe: Tanpa Pajak') 
      : (isEn ? 'Type: Taxable (VAT)' : 'Tipe: Dengan Pajak');
  }
  if (DOM.btnToggleTaxMode) {
    DOM.btnToggleTaxMode.classList.toggle('is-no-tax', isNoTax);
  }

  if (DOM.invoiceSheet) {
    DOM.invoiceSheet.classList.toggle('no-tax-mode', isNoTax);
  }
  document.body.classList.toggle('invoice-no-tax-mode', isNoTax);

  calculateTotals();
  if (!silent) {
    saveDraftToStorage();
    showToast(isNoTax 
      ? (isEn ? 'Document set to Non-Tax (0%)' : 'Tipe Invoice diubah: Tanpa Pajak (Non-Tax)') 
      : (isEn ? 'Document set to Taxable (VAT)' : 'Tipe Invoice diubah: Dengan Pajak (PPN)'));
  }
}

// Setup Document Type Selector (Invoice / Quotation Letter)
function setupDocTypeSelector() {
  if (DOM.docTypeSelect) {
    DOM.docTypeSelect.addEventListener('change', (e) => {
      setDocumentType(e.target.value);
    });
  }
}

// Setup Document Language Selector (Bahasa Indonesia / English)
function setupDocLanguageSelector() {
  if (DOM.docLangSelect) {
    DOM.docLangSelect.addEventListener('change', (e) => {
      setDocumentLanguage(e.target.value);
    });
  }
}

function setDocumentLanguage(lang, silent = false) {
  if (!silent) {
    pushHistoryState(invoiceState.docLang === 'en' ? 'Change language' : 'Ubah bahasa');
  }
  invoiceState.docLang = (lang === 'en') ? 'en' : 'id';
  const isEn = invoiceState.docLang === 'en';
  const isQuotation = invoiceState.docType === 'quotation';
  const t = TRANSLATIONS[invoiceState.docLang || 'id'];

  if (DOM.docLangSelect) {
    DOM.docLangSelect.value = invoiceState.docLang;
  }
  if (DOM.docLangPicker) {
    DOM.docLangPicker.classList.toggle('is-en', isEn);
  }

  // Update docType selector options text
  if (DOM.docTypeSelect) {
    const optInvoice = DOM.docTypeSelect.querySelector('option[value="invoice"]');
    const optQuotation = DOM.docTypeSelect.querySelector('option[value="quotation"]');
    if (optInvoice) optInvoice.textContent = t.docTypeInvoice;
    if (optQuotation) optQuotation.textContent = t.docTypeQuotation;
  }

  // Update paper size selector options text
  if (DOM.paperSizeSelect) {
    const optA4 = DOM.paperSizeSelect.querySelector('option[value="a4"]');
    const optLetter = DOM.paperSizeSelect.querySelector('option[value="letter"]');
    if (optA4) optA4.textContent = t.paperA4;
    if (optLetter) optLetter.textContent = t.paperLetter;
  }

  // Update top action buttons text
  if (DOM.btnSaveProfile) {
    const span = DOM.btnSaveProfile.querySelector('span');
    if (span) span.textContent = t.btnSave;
  }
  if (DOM.btnPrint) {
    const span = DOM.btnPrint.querySelector('span');
    if (span) span.textContent = t.btnPrint;
  }
  if (DOM.btnDownloadPdf) {
    const span = DOM.btnDownloadPdf.querySelector('span');
    if (span) span.textContent = t.btnDownloadPdf;
  }

  // Document Title
  if (isQuotation) {
    if (!invoiceState.title || invoiceState.title === 'SURAT PENAWARAN HARGA' || invoiceState.title === 'QUOTATION LETTER' || invoiceState.title === 'INVOICE') {
      invoiceState.title = t.titleQuotation;
      if (DOM.invoiceTitleInput) DOM.invoiceTitleInput.value = t.titleQuotation;
    }
  } else {
    if (!invoiceState.title || invoiceState.title === 'INVOICE' || invoiceState.title === 'SURAT PENAWARAN HARGA' || invoiceState.title === 'QUOTATION LETTER') {
      invoiceState.title = t.titleInvoice;
      if (DOM.invoiceTitleInput) DOM.invoiceTitleInput.value = t.titleInvoice;
    }
  }

  // Subject (Perihal)
  if (DOM.subjectLabel) {
    DOM.subjectLabel.textContent = t.subjectLabel;
  }
  if (DOM.docSubjectInput) {
    if (invoiceState.subject === TRANSLATIONS.id.defaultSubjectQuotation && isEn) {
      invoiceState.subject = TRANSLATIONS.en.defaultSubjectQuotation;
      DOM.docSubjectInput.value = invoiceState.subject;
    } else if (invoiceState.subject === TRANSLATIONS.en.defaultSubjectQuotation && !isEn) {
      invoiceState.subject = TRANSLATIONS.id.defaultSubjectQuotation;
      DOM.docSubjectInput.value = invoiceState.subject;
    }
  }

  // Greeting (Surat Pengantar / Catatan Pembuka)
  if (DOM.greetingHeaderTitle) {
    DOM.greetingHeaderTitle.textContent = isQuotation ? t.greetingTitleQuotation : t.greetingTitleInvoice;
  }
  updateGreetingToggleState();

  if (DOM.greetingContent) {
    const curGreeting = DOM.greetingContent.innerText ? DOM.greetingContent.innerText.trim() : '';
    const isDefaultQuo = curGreeting.includes('Sehubungan dengan rencana kegiatan') || curGreeting.includes('upcoming event / project');
    const isDefaultInv = curGreeting.includes('Terima kasih atas kepercayaan') || curGreeting.includes('Thank you for choosing our creative services');

    if (isDefaultQuo) {
      const newGreeting = isEn ? DEFAULT_GREETING_QUOTATION_EN : DEFAULT_GREETING_QUOTATION_ID;
      invoiceState.greetingText = newGreeting;
      DOM.greetingContent.innerHTML = formatNotesToHtml(newGreeting);
    } else if (isDefaultInv) {
      const newGreeting = isEn ? DEFAULT_GREETING_INVOICE_EN : DEFAULT_GREETING_INVOICE_ID;
      invoiceState.greetingText = newGreeting;
      DOM.greetingContent.innerHTML = formatNotesToHtml(newGreeting);
    }
  }

  // Quick Presets Toolbar
  if (DOM.presetsHeaderTitle) DOM.presetsHeaderTitle.textContent = t.presetsHeader;
  if (DOM.presetLabelVideo) DOM.presetLabelVideo.textContent = t.presetVideo;
  if (DOM.presetLabelPhoto) DOM.presetLabelPhoto.textContent = t.presetPhoto;
  if (DOM.presetLabelPhotobooth) DOM.presetLabelPhotobooth.textContent = t.presetPhotobooth;
  if (DOM.presetLabelCombo) DOM.presetLabelCombo.textContent = t.presetCombo;

  // Items Table Headers
  if (DOM.thName) DOM.thName.textContent = t.thName;
  if (DOM.thQty) DOM.thQty.textContent = t.thQty;
  if (DOM.thPrice) DOM.thPrice.textContent = t.thPrice;
  if (DOM.thTax) DOM.thTax.textContent = t.thTax;
  if (DOM.thSubtotal) DOM.thSubtotal.textContent = t.thSubtotal;

  // Add Item & Tax Toggle Buttons
  if (DOM.btnAddItemLabel) {
    DOM.btnAddItemLabel.textContent = isQuotation ? t.btnAddItemQuotation : t.btnAddItemInvoice;
  }
  if (DOM.btnUndoLabel) DOM.btnUndoLabel.textContent = t.btnUndo || 'Undo';
  if (DOM.btnRedoLabel) DOM.btnRedoLabel.textContent = t.btnRedo || 'Redo';
  if (DOM.btnUndoItem) DOM.btnUndoItem.title = t.btnUndoTitle || 'Urungkan / Undo (Ctrl+Z)';
  if (DOM.btnRedoItem) DOM.btnRedoItem.title = t.btnRedoTitle || 'Ulangi / Redo (Ctrl+Y)';
  if (DOM.toggleTaxBtnLabel) {
    const isNoTax = invoiceState.taxMode === 'no_tax';
    DOM.toggleTaxBtnLabel.textContent = isNoTax ? t.btnTaxNonTax : t.btnTaxWithTax;
  }

  // Meta Row Labels
  if (DOM.metaNumPrefix) {
    DOM.metaNumPrefix.textContent = isQuotation ? t.metaPrefixQuotation : t.metaPrefixInvoice;
  }
  if (DOM.metaDateLabel1) {
    DOM.metaDateLabel1.textContent = isQuotation ? t.dateLabel1Quotation : t.dateLabel1Invoice;
  }
  if (DOM.metaDateLabel2) {
    DOM.metaDateLabel2.textContent = isQuotation ? t.dateLabel2Quotation : t.dateLabel2Invoice;
  }

  // Parties Badges
  if (DOM.partyFromBadge) {
    DOM.partyFromBadge.textContent = isQuotation ? t.partyFromQuotation : t.partyFromInvoice;
  }
  if (DOM.partyToBadge) {
    DOM.partyToBadge.textContent = isQuotation ? t.partyToQuotation : t.partyToInvoice;
  }

  // Input Placeholders
  if (DOM.fromCompany) DOM.fromCompany.placeholder = t.fromCompanyPlaceholder;
  if (DOM.fromName) DOM.fromName.placeholder = t.fromNamePlaceholder;
  if (DOM.fromAddress) DOM.fromAddress.placeholder = t.fromAddressPlaceholder;
  if (DOM.fromEmail) DOM.fromEmail.placeholder = t.fromEmailPlaceholder;
  if (DOM.fromPhone) DOM.fromPhone.placeholder = t.fromPhonePlaceholder;

  if (DOM.toCompany) DOM.toCompany.placeholder = t.toCompanyPlaceholder;
  if (DOM.toName) DOM.toName.placeholder = t.toNamePlaceholder;
  if (DOM.toAddress) DOM.toAddress.placeholder = t.toAddressPlaceholder;
  if (DOM.toEmail) DOM.toEmail.placeholder = t.toEmailPlaceholder;
  if (DOM.toPhone) DOM.toPhone.placeholder = t.toPhonePlaceholder;

  if (DOM.topInvoiceTitleInput) {
    DOM.topInvoiceTitleInput.placeholder = isQuotation ? t.topQuotationPlaceholder : t.topInvoicePlaceholder;
  }
  if (DOM.invoiceSubtitleInput) {
    DOM.invoiceSubtitleInput.placeholder = t.subtitlePlaceholder;
  }

  // Notes Title & Default Notes Translation
  if (DOM.paymentNotesTitleLabel) {
    DOM.paymentNotesTitleLabel.textContent = isQuotation ? t.notesTitleQuotation : t.notesTitleInvoice;
  }
  if (DOM.paymentNotes) {
    const curNotes = DOM.paymentNotes.innerText ? DOM.paymentNotes.innerText.trim() : '';
    const isDefaultQuoTerms = curNotes.includes('Pembayaran Uang Muka (DP)') || curNotes.includes('Down Payment (DP)');
    const isDefaultInvNotes = curNotes.includes('Transfer ke rekening bank') || curNotes.includes('Please transfer payment');

    if (isDefaultQuoTerms && isQuotation) {
      const newTerms = isEn ? DEFAULT_QUOTATION_TERMS_EN : DEFAULT_QUOTATION_TERMS_ID;
      invoiceState.paymentNotes = newTerms;
      DOM.paymentNotes.innerHTML = formatNotesToHtml(newTerms);
    } else if (isDefaultInvNotes && !isQuotation) {
      const newNotes = isEn ? DEFAULT_INVOICE_NOTES_EN : DEFAULT_INVOICE_NOTES_ID;
      invoiceState.paymentNotes = newNotes;
      DOM.paymentNotes.innerHTML = formatNotesToHtml(newNotes);
    }
  }

  // Summary Titles
  if (DOM.summaryTitleLabel) {
    DOM.summaryTitleLabel.textContent = isQuotation ? t.summaryTitleQuotation : t.summaryTitleInvoice;
  }
  if (DOM.summarySubtotalLabel) DOM.summarySubtotalLabel.textContent = t.summarySubtotal;
  if (DOM.summaryTotalLabel) DOM.summaryTotalLabel.textContent = t.summaryTotal;
  if (DOM.terbilangLabel) DOM.terbilangLabel.textContent = t.terbilangLabel;

  // Signatures Titles
  if (DOM.sigVendorTitle) DOM.sigVendorTitle.textContent = t.sigVendorTitle;
  if (DOM.sigClientTitle) DOM.sigClientTitle.textContent = t.sigClientTitle;

  // Recalculate totals (updates in words / terbilang)
  calculateTotals();

  if (DOM.invoiceTitleInput) setTimeout(() => autoResizeInput(DOM.invoiceTitleInput), 0);
  if (DOM.invoiceNumber) setTimeout(() => autoResizeInput(DOM.invoiceNumber), 0);

  if (!silent) {
    saveDraftToStorage();
    showToast(isEn ? 'Language switched to English' : 'Bahasa dokumen: Bahasa Indonesia');
  }
}

function setDocumentType(type, silent = false) {
  if (!silent) {
    const isEn = invoiceState.docLang === 'en';
    pushHistoryState(isEn ? 'Change document type' : 'Ubah tipe dokumen');
  }
  invoiceState.docType = (type === 'quotation') ? 'quotation' : 'invoice';
  const isQuotation = invoiceState.docType === 'quotation';
  const isEn = invoiceState.docLang === 'en';
  const t = TRANSLATIONS[invoiceState.docLang || 'id'];

  if (DOM.docTypeSelect) {
    DOM.docTypeSelect.value = invoiceState.docType;
  }
  if (DOM.docTypePicker) {
    DOM.docTypePicker.classList.toggle('is-quotation', isQuotation);
  }
  if (DOM.invoiceSheet) {
    DOM.invoiceSheet.classList.toggle('doc-quotation-mode', isQuotation);
  }
  document.body.classList.toggle('doc-quotation-mode', isQuotation);

  // Vendor Presets & Greeting Section: Available in BOTH Invoice and Quotation
  if (DOM.vendorPresetsToolbar) {
    DOM.vendorPresetsToolbar.classList.remove('hidden');
  }
  if (DOM.quotationGreetingSection) {
    DOM.quotationGreetingSection.classList.remove('hidden');
  }
  if (DOM.greetingHeaderTitle) {
    DOM.greetingHeaderTitle.textContent = isQuotation ? t.greetingTitleQuotation : t.greetingTitleInvoice;
  }
  if (DOM.docSubjectWrap) {
    DOM.docSubjectWrap.classList.toggle('hidden', !isQuotation);
  }
  if (DOM.quotationSignaturesSection) {
    DOM.quotationSignaturesSection.classList.toggle('hidden', !isQuotation);
  }

  // Adaptive Labels & Text
  if (DOM.metaNumPrefix) {
    DOM.metaNumPrefix.textContent = isQuotation ? t.metaPrefixQuotation : t.metaPrefixInvoice;
  }
  if (DOM.metaDateLabel1) {
    DOM.metaDateLabel1.textContent = isQuotation ? t.dateLabel1Quotation : t.dateLabel1Invoice;
  }
  if (DOM.metaDateLabel2) {
    DOM.metaDateLabel2.textContent = isQuotation ? t.dateLabel2Quotation : t.dateLabel2Invoice;
  }
  if (DOM.partyFromBadge) {
    DOM.partyFromBadge.textContent = isQuotation ? t.partyFromQuotation : t.partyFromInvoice;
  }
  if (DOM.partyToBadge) {
    DOM.partyToBadge.textContent = isQuotation ? t.partyToQuotation : t.partyToInvoice;
  }
  if (DOM.paymentNotesTitleLabel) {
    DOM.paymentNotesTitleLabel.textContent = isQuotation ? t.notesTitleQuotation : t.notesTitleInvoice;
  }
  if (DOM.summaryTitleLabel) {
    DOM.summaryTitleLabel.textContent = isQuotation ? t.summaryTitleQuotation : t.summaryTitleInvoice;
  }
  if (DOM.btnAddItemLabel) {
    DOM.btnAddItemLabel.textContent = isQuotation ? t.btnAddItemQuotation : t.btnAddItemInvoice;
  }
  if (DOM.topInvoiceTitleInput) {
    DOM.topInvoiceTitleInput.placeholder = isQuotation ? t.topQuotationPlaceholder : t.topInvoicePlaceholder;
  }

  // Title default adjustment
  if (isQuotation) {
    if (!invoiceState.title || invoiceState.title === 'INVOICE' || invoiceState.title === 'Invoice' || invoiceState.title === 'SURAT PENAWARAN HARGA' || invoiceState.title === 'QUOTATION LETTER') {
      invoiceState.title = t.titleQuotation;
      if (DOM.invoiceTitleInput) DOM.invoiceTitleInput.value = t.titleQuotation;
    }
    // Set quotation number if empty or numeric without prefix
    if (!invoiceState.invoiceNumber || !invoiceState.invoiceNumber.startsWith('Q-')) {
      invoiceState.invoiceNumber = generateDefaultQuotationNumber();
      if (DOM.invoiceNumber) DOM.invoiceNumber.value = invoiceState.invoiceNumber;
    }
  } else {
    if (invoiceState.title === 'SURAT PENAWARAN HARGA' || invoiceState.title === 'QUOTATION LETTER') {
      invoiceState.title = t.titleInvoice;
      if (DOM.invoiceTitleInput) DOM.invoiceTitleInput.value = t.titleInvoice;
    }
  }

  if (DOM.invoiceTitleInput) {
    setTimeout(() => autoResizeInput(DOM.invoiceTitleInput), 0);
  }
  if (DOM.invoiceNumber) {
    setTimeout(() => autoResizeInput(DOM.invoiceNumber), 0);
  }

  updateSignaturesView();
  updateGreetingToggleState();

  if (!silent) {
    saveDraftToStorage();
    showToast(isQuotation
      ? (isEn ? 'Document type: Quotation Letter' : 'Tipe dokumen diubah: Quotation Letter')
      : (isEn ? 'Document type: Invoice' : 'Tipe dokumen diubah: Invoice'));
  }
}

// Live update signatures content
function updateSignaturesView() {
  const vendorComp = (DOM.fromCompany ? DOM.fromCompany.value.trim() : '') || (invoiceState.from && invoiceState.from.company) || 'Bluudz Creative';
  const vendorName = (DOM.fromName ? DOM.fromName.value.trim() : '') || (invoiceState.from && invoiceState.from.name) || 'Johan Habibie';
  const clientComp = (DOM.toCompany ? DOM.toCompany.value.trim() : '') || (invoiceState.to && invoiceState.to.company) || 'PT Paragon Technology and Innovation';
  const clientName = (DOM.toName ? DOM.toName.value.trim() : '') || (invoiceState.to && invoiceState.to.name) || 'Pak Candra Kisaditiyanto';

  if (DOM.sigVendorCompany) DOM.sigVendorCompany.textContent = vendorComp;
  if (DOM.sigVendorName) DOM.sigVendorName.textContent = `( ${vendorName} )`;
  if (DOM.sigClientCompany) DOM.sigClientCompany.textContent = clientComp;
  if (DOM.sigClientName) DOM.sigClientName.textContent = `( ${clientName} )`;
}

// Setup Vendor Quick Presets Toolbar
function setupVendorPresets() {
  if (DOM.presetBtnVideo) {
    DOM.presetBtnVideo.addEventListener('click', () => applyVendorPreset('video'));
  }
  if (DOM.presetBtnPhoto) {
    DOM.presetBtnPhoto.addEventListener('click', () => applyVendorPreset('photo'));
  }
  if (DOM.presetBtnPhotobooth) {
    DOM.presetBtnPhotobooth.addEventListener('click', () => applyVendorPreset('photobooth'));
  }
  if (DOM.presetBtnCombo) {
    DOM.presetBtnCombo.addEventListener('click', () => applyVendorPreset('combo'));
  }
}

function applyVendorPreset(presetKey) {
  const presetsMap = (invoiceState.docLang === 'en') ? VENDOR_PRESETS_EN : VENDOR_PRESETS_ID;
  const preset = presetsMap[presetKey] || VENDOR_PRESETS_ID[presetKey];
  if (!preset) return;

  const isEn = invoiceState.docLang === 'en';
  pushHistoryState(isEn ? `Add ${preset.name}` : `Tambah ${preset.name}`);

  const isFirstEmpty = invoiceState.items.length === 1 &&
                       !invoiceState.items[0].name.trim() &&
                       !invoiceState.items[0].description.trim() &&
                       (Number(invoiceState.items[0].price) === 0);

  const newItem = {
    id: generateId(),
    name: preset.name,
    description: preset.description,
    qty: preset.qty,
    price: preset.price,
    tax: preset.tax
  };

  if (isFirstEmpty) {
    invoiceState.items = [newItem];
  } else {
    invoiceState.items.push(newItem);
  }

  renderItems();
  saveDraftToStorage();
  showToast(isEn ? `${preset.name} added successfully!` : `${preset.name} berhasil ditambahkan!`);

  const lastRow = DOM.itemsList.lastElementChild;
  if (lastRow) {
    lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Setup Greeting Toggle in PDF/Print
function setupGreetingToggle() {
  if (!DOM.btnToggleGreeting) return;

  DOM.btnToggleGreeting.addEventListener('click', () => {
    invoiceState.showGreeting = !invoiceState.showGreeting;
    updateGreetingToggleState();
    saveDraftToStorage();
    const isEn = invoiceState.docLang === 'en';
    if (isEn) {
      showToast(invoiceState.showGreeting ? 'Cover greeting visible in PDF/Print' : 'Cover greeting hidden from PDF/Print');
    } else {
      showToast(invoiceState.showGreeting ? 'Surat pengantar ditampilkan di PDF' : 'Surat pengantar disembunyikan dari cetak & PDF');
    }
  });
}

function updateGreetingToggleState() {
  const show = invoiceState.showGreeting !== false;
  const isEn = invoiceState.docLang === 'en';
  const t = TRANSLATIONS[invoiceState.docLang || 'id'];

  if (DOM.quotationGreetingSection) {
    DOM.quotationGreetingSection.classList.toggle('is-hidden-in-doc', !show);
  }
  if (DOM.btnToggleGreeting) {
    DOM.btnToggleGreeting.classList.toggle('is-hidden', !show);
  }
  if (DOM.labelToggleGreeting) {
    DOM.labelToggleGreeting.textContent = show ? t.greetingToggleVisible : t.greetingToggleHidden;
  }
  if (DOM.iconToggleGreeting) {
    DOM.iconToggleGreeting.setAttribute('data-lucide', show ? 'eye' : 'eye-off');
    lucide.createIcons();
  }
}

// ==========================================================================
// Saved Invoices Manager Panel Logic (List, Switch, Duplicate, Delete)
// ==========================================================================

function calculateInvoiceTotal(inv) {
  let subtotal = 0;
  let tax = 0;
  const isNoTax = inv.taxMode === 'no_tax';
  if (inv.items && Array.isArray(inv.items)) {
    inv.items.forEach(item => {
      const q = Number(item.qty) || 0;
      const p = Number(item.price) || 0;
      const t = Number(item.tax) || 0;
      const rowTot = q * p;
      subtotal += rowTot;
      if (!isNoTax) {
        tax += rowTot * (t / 100);
      }
    });
  }
  return subtotal + (isNoTax ? 0 : tax);
}

// HTML entity escaper helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSavedInvoicesList(searchQuery = '') {
  if (!DOM.savedInvoicesList) return;

  const invoices = StorageManager.getSavedInvoices();
  const activeId = invoiceState.id;

  // Filter based on search query (checks invoiceNumber, invoiceName, client, customNotes)
  const filtered = invoices.filter(inv => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const num = (inv.invoiceNumber || '').toLowerCase();
    const name = (inv.invoiceName || '').toLowerCase();
    const client = ((inv.to && (inv.to.company || inv.to.name)) || '').toLowerCase();
    const notes = (inv.customNotes || '').toLowerCase();
    const subj = (inv.subject || '').toLowerCase();
    const docType = (inv.docType || '').toLowerCase();
    return num.includes(q) || name.includes(q) || client.includes(q) || notes.includes(q) || subj.includes(q) || docType.includes(q);
  });

  // Update counter
  if (DOM.invoicesCount) {
    DOM.invoicesCount.textContent = `${invoices.length} dokumen tersimpan`;
  }

  // If empty list
  if (filtered.length === 0) {
    if (invoices.length === 0) {
      DOM.savedInvoicesList.innerHTML = `
        <div class="empty-invoices-state">
          <i data-lucide="folder-plus"></i>
          <p>Belum ada dokumen tersimpan</p>
          <small>Klik tombol <strong>"Simpan"</strong> di atas untuk menyimpan dokumen saat ini ke daftar ini.</small>
        </div>
      `;
    } else {
      DOM.savedInvoicesList.innerHTML = `
        <div class="empty-invoices-state">
          <i data-lucide="search-x"></i>
          <p>Tidak ditemukan</p>
          <small>Tidak ada dokumen yang cocok dengan kata kunci pencarian.</small>
        </div>
      `;
    }
    lucide.createIcons();
    return;
  }

  DOM.savedInvoicesList.innerHTML = '';

  filtered.forEach(inv => {
    const card = document.createElement('div');
    const isActive = inv.id === activeId;
    card.className = `invoice-card-item ${isActive ? 'active' : ''}`;
    card.dataset.id = inv.id;

    const total = calculateInvoiceTotal(inv);
    const clientName = (inv.to && (inv.to.company || inv.to.name)) || 'Tanpa Klien';
    const invoiceTitle = inv.invoiceName ? inv.invoiceName : clientName;
    const dateStr = formatToDMY(inv.issueDate) || 'Draft';
    const hasCustomNotes = Boolean(inv.customNotes && inv.customNotes.trim());
    const isQuo = inv.docType === 'quotation';

    card.innerHTML = `
      <div class="card-top">
        <span class="card-number">${isQuo ? '' : '#'}${inv.invoiceNumber || 'Draft'}</span>
        <div class="card-badges">
          <span class="card-doc-badge ${isQuo ? 'quotation' : 'invoice'}">${isQuo ? 'Quotation' : 'Invoice'}</span>
          <span class="card-date">${dateStr}</span>
        </div>
      </div>
      <div class="card-invoice-title" title="Klik untuk edit judul (${escapeHtml(invoiceTitle)})">
        <span class="card-invoice-title-text">${escapeHtml(invoiceTitle)}</span>
        <i data-lucide="edit-3" class="card-title-quick-edit-icon" title="Edit judul invoice"></i>
      </div>
      <div class="card-client" title="Klien: ${escapeHtml(clientName)}">
        <i data-lucide="user-check" style="width: 12px; height: 12px; flex-shrink: 0; color: #94a3b8;"></i>
        <span>${escapeHtml(clientName)}</span>
      </div>
      ${hasCustomNotes ? `
        <div class="card-notes-snippet" title="${escapeHtml(inv.customNotes)}">
          <i data-lucide="sticky-note"></i>
          <span>${escapeHtml(inv.customNotes)}</span>
        </div>
      ` : ''}
      <div class="card-bottom">
        <span class="card-total">${formatCurrency(total, inv.currency || 'IDR')}</span>
        <div class="card-actions no-print">
          <button type="button" class="btn-card-action" data-action="edit" title="Edit Nama & Catatan Invoice">
            <i data-lucide="pencil"></i>
          </button>
          <button type="button" class="btn-card-action" data-action="duplicate" title="Duplikasi Invoice">
            <i data-lucide="copy"></i>
          </button>
          <button type="button" class="btn-card-action danger" data-action="delete" title="Hapus Invoice">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;

    // Click on title text to switch to this invoice & focus top title input for instant editing
    const titleClickEl = card.querySelector('.card-invoice-title');
    if (titleClickEl) {
      titleClickEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inv.id !== invoiceState.id) {
          loadInvoiceIntoEditor(inv.id);
        }
        if (DOM.topInvoiceTitleInput) {
          DOM.topInvoiceTitleInput.focus();
          DOM.topInvoiceTitleInput.select();
        }
      });
    }

    // Click card to switch to this invoice
    card.addEventListener('click', (e) => {
      // Don't switch if action button clicked or inside inline edit
      if (e.target.closest('[data-action]') || e.target.closest('.card-inline-edit')) return;
      loadInvoiceIntoEditor(inv.id);
    });

    // Edit Action (Open inline editor)
    const editBtn = card.querySelector('[data-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInlineEditForInvoice(card, inv);
      });
    }

    // Duplicate Action
    const dupBtn = card.querySelector('[data-action="duplicate"]');
    if (dupBtn) {
      dupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateInvoice(inv.id);
      });
    }

    // Delete Action
    const delBtn = card.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSavedInvoice(inv.id, inv.invoiceNumber);
      });
    }

    DOM.savedInvoicesList.appendChild(card);
  });

  lucide.createIcons();
}

// Function to handle inline editing of invoice name & custom notes on a card
function openInlineEditForInvoice(card, inv) {
  card.innerHTML = `
    <div class="card-top">
      <span class="card-number">#${inv.invoiceNumber || 'Draft'}</span>
      <span class="card-date">Edit Nama & Catatan</span>
    </div>
    <div class="card-inline-edit" onclick="event.stopPropagation()">
      <div class="inline-edit-field">
        <label class="inline-edit-label">Nama / Judul Invoice:</label>
        <input type="text" class="inline-edit-input inline-name-input" value="${escapeHtml(inv.invoiceName || '')}" placeholder="Misal: Dokumentasi Event PT ABC">
      </div>
      <div class="inline-edit-field">
        <label class="inline-edit-label">Keterangan / Catatan Custom:</label>
        <textarea class="inline-edit-textarea inline-notes-input" rows="2" placeholder="Catatan khusus atau keterangan invoice ini...">${escapeHtml(inv.customNotes || '')}</textarea>
      </div>
      <div class="inline-edit-actions">
        <button type="button" class="btn-inline-save" data-action="save-edit">
          <i data-lucide="check"></i> Simpan
        </button>
        <button type="button" class="btn-inline-cancel" data-action="cancel-edit">
          Batal
        </button>
      </div>
    </div>
  `;
  lucide.createIcons();

  const nameInput = card.querySelector('.inline-name-input');
  const notesInput = card.querySelector('.inline-notes-input');
  const saveBtn = card.querySelector('[data-action="save-edit"]');
  const cancelBtn = card.querySelector('[data-action="cancel-edit"]');

  if (nameInput) {
    nameInput.focus();
    nameInput.select();
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }

  if (notesInput) {
    notesInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newName = nameInput.value.trim();
    const newNotes = notesInput.value.trim();

    // Update in saved invoices array
    const invoices = StorageManager.getSavedInvoices();
    const targetIdx = invoices.findIndex(item => item.id === inv.id);
    if (targetIdx >= 0) {
      invoices[targetIdx].invoiceName = newName;
      invoices[targetIdx].customNotes = newNotes;
      invoices[targetIdx].updatedAt = new Date().toISOString();
      StorageManager.saveAllInvoices(invoices);
    }

    // If active invoice in editor is this invoice, update live state & DOM inputs
    if (invoiceState.id === inv.id) {
      invoiceState.invoiceName = newName;
      invoiceState.customNotes = newNotes;
      if (DOM.topInvoiceTitleInput) {
        DOM.topInvoiceTitleInput.value = newName;
      }
      if (DOM.customNotes) {
        DOM.customNotes.value = newNotes;
        autoResize(DOM.customNotes);
        if (DOM.customNotesSection) {
          DOM.customNotesSection.classList.toggle('is-empty', !newNotes);
        }
      }
      StorageManager.saveDraft(invoiceState);
    }

    showToast('Nama & keterangan invoice berhasil diperbarui!');
    renderSavedInvoicesList(DOM.invoiceSearchInput ? DOM.invoiceSearchInput.value.trim().toLowerCase() : '');
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderSavedInvoicesList(DOM.invoiceSearchInput ? DOM.invoiceSearchInput.value.trim().toLowerCase() : '');
  });
}

// Switch/Load an invoice into the editor
function loadInvoiceIntoEditor(invoiceId, skipAutoSave = false) {
  const invoices = StorageManager.getSavedInvoices();
  const found = invoices.find(inv => inv.id === invoiceId);
  if (!found) return;

  clearTimeout(saveTimeout);

  // Auto-save currently active invoice before switching (ONLY if not skipped and it exists in saved list)
  if (!skipAutoSave && invoiceState.id && invoiceState.id !== invoiceId) {
    if (invoices.some(inv => inv.id === invoiceState.id)) {
      readInputsToState();
      StorageManager.saveInvoice(invoiceState);
    }
  }

  // Load selected invoice
  invoiceState = JSON.parse(JSON.stringify(found));
  StorageManager.setActiveInvoiceId(invoiceState.id);
  clearHistoryStacks();
  
  syncInputsWithState();
  renderItems();
  StorageManager.saveDraft(invoiceState);
  renderSavedInvoicesList();

  const docTypeLabel = invoiceState.docType === 'quotation' ? 'Quotation' : 'Invoice';
  showToast(`Beralih ke ${docTypeLabel} #${invoiceState.invoiceNumber}`);
}

// Duplicate an existing invoice or quotation
function duplicateInvoice(invoiceId) {
  const invoices = StorageManager.getSavedInvoices();
  const source = invoices.find(inv => inv.id === invoiceId);
  if (!source) return;

  const isQuo = source.docType === 'quotation';
  const duplicated = JSON.parse(JSON.stringify(source));
  duplicated.id = (isQuo ? 'quo-' : 'inv-') + Date.now();
  duplicated.invoiceNumber = isQuo ? generateDefaultQuotationNumber() : generateDefaultInvoiceNumber();
  duplicated.invoiceName = source.invoiceName ? `${source.invoiceName} (Copy)` : '';
  duplicated.issueDate = formatToDMY(new Date());
  if (duplicated.dueDate) duplicated.dueDate = formatToDMY(duplicated.dueDate);

  StorageManager.saveInvoice(duplicated);
  renderSavedInvoicesList();
  showToast(`Berhasil menduplikasi ${isQuo ? 'quotation' : 'invoice'} #${duplicated.invoiceNumber}!`);

  // Optionally load the duplicated invoice immediately
  loadInvoiceIntoEditor(duplicated.id, true);
}

// Delete an invoice or quotation from the list
function deleteSavedInvoice(invoiceId, invoiceNumber) {
  const invoices = StorageManager.getSavedInvoices();
  const target = invoices.find(inv => inv.id === invoiceId);
  const docLabel = (target && target.docType === 'quotation') ? 'Quotation' : 'Invoice';

  if (confirm(`Apakah Anda yakin ingin menghapus ${docLabel.toLowerCase()} #${invoiceNumber || 'ini'}?`)) {
    clearTimeout(saveTimeout);
    StorageManager.deleteInvoice(invoiceId);
    
    // If the deleted invoice was the active one in the editor
    if (invoiceState.id === invoiceId) {
      const remaining = StorageManager.getSavedInvoices();
      if (remaining.length > 0) {
        // Load the next invoice, skipping auto-saving the deleted invoice
        loadInvoiceIntoEditor(remaining[0].id, true);
      } else {
        // Reset editor to blank without asking confirm and without auto-saving
        resetToNewBlankDocument('invoice', false, false);
      }
    } else {
      renderSavedInvoicesList();
    }
    showToast(`${docLabel} telah dihapus`, 'danger');
  }
}

// Application Initialization
function initApp() {
  setupSidebar();
  lucide.createIcons();
  setupLogoUploader();
  setupPaperSizeSelector();
  setupInvoiceTypeSelector();
  setupDocTypeSelector();
  setupDocLanguageSelector();
  setupVendorPresets();
  setupGreetingToggle();
  setupNotesToolbar();
  setupGreetingToolbar();
  setupDatePickers();
  attachInputListeners();

  // Load from draft or load profile or fallback to defaults
  const draft = StorageManager.loadDraft();
  if (draft && draft.items && draft.items.length > 0) {
    invoiceState = draft;
    if (invoiceState.issueDate) invoiceState.issueDate = formatToDMY(invoiceState.issueDate);
    if (invoiceState.dueDate) invoiceState.dueDate = formatToDMY(invoiceState.dueDate);
  } else {
    const profile = StorageManager.loadSenderProfile();
    if (profile) {
      invoiceState.from = profile.from;
      invoiceState.paymentNotes = profile.paymentNotes;
      if (profile.paymentNotesFontSize) {
        invoiceState.paymentNotesFontSize = profile.paymentNotesFontSize;
      }
      invoiceState.logo = profile.logo;
    }
    initDates();
  }

  // Cleanup any legacy duplicate "Metode Pembayaran :" or "Keterangan :" in stored data
  try {
    const existingInvoices = StorageManager.getSavedInvoices();
    let mod = false;
    // Migrate and merge address + country
    existingInvoices.forEach(inv => {
      if (inv.from) {
        if (inv.from.address && inv.from.country && !inv.from.address.includes(inv.from.country)) {
          inv.from.address = `${inv.from.address} - ${inv.from.country}`;
          delete inv.from.country;
          mod = true;
        } else if (inv.from.address === 'Surabaya') {
          inv.from.address = 'Surabaya - Indonesia';
          delete inv.from.country;
          mod = true;
        }
      }
      if (inv.to) {
        if (inv.to.address && inv.to.country && !inv.to.address.includes(inv.to.country)) {
          inv.to.address = `${inv.to.address} - ${inv.to.country}`;
          delete inv.to.country;
          mod = true;
        } else if (inv.to.address === 'Surabaya') {
          inv.to.address = 'Surabaya - Indonesia';
          delete inv.to.country;
          mod = true;
        }
      }
    });

    if (invoiceState.from) {
      if (invoiceState.from.address && invoiceState.from.country && !invoiceState.from.address.includes(invoiceState.from.country)) {
        invoiceState.from.address = `${invoiceState.from.address} - ${invoiceState.from.country}`;
        delete invoiceState.from.country;
      } else if (invoiceState.from.address === 'Surabaya') {
        invoiceState.from.address = 'Surabaya - Indonesia';
        delete invoiceState.from.country;
      }
    }
    if (invoiceState.to) {
      if (invoiceState.to.address && invoiceState.to.country && !invoiceState.to.address.includes(invoiceState.to.country)) {
        invoiceState.to.address = `${invoiceState.to.address} - ${invoiceState.to.country}`;
        delete invoiceState.to.country;
      } else if (invoiceState.to.address === 'Surabaya') {
        invoiceState.to.address = 'Surabaya - Indonesia';
        delete invoiceState.to.country;
      }
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  syncInputsWithState();
  renderItems();

  // Initialize undo/redo baseline with the loaded state
  _lastKnownBaseline = _snapshotState();

  // Listen for messages from the authenticated parent dashboard
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== window.location.origin || !event.data) return;

    if (event.data.type === 'SYNC_USER_PROFILE') {
      const parentProfile = event.data.profile;
      if (parentProfile) {
        if (!invoiceState.from) invoiceState.from = {};
        invoiceState.from.name = parentProfile.name || '';
        invoiceState.from.company = parentProfile.company || '';
        invoiceState.from.email = parentProfile.email || '';
        invoiceState.from.phone = parentProfile.phone || '';
        invoiceState.from.address = parentProfile.address || '';

        if (DOM.fromName) DOM.fromName.value = invoiceState.from.name;
        if (DOM.fromCompany) DOM.fromCompany.value = invoiceState.from.company;
        if (DOM.fromEmail) DOM.fromEmail.value = invoiceState.from.email;
        if (DOM.fromPhone) DOM.fromPhone.value = invoiceState.from.phone;
        if (DOM.fromAddress) DOM.fromAddress.value = invoiceState.from.address;

        updateSignaturesView();
        // Silent save without triggering parent notifications or debounce save loop
        StorageManager.saveDraft(invoiceState);
      }
    } else if (event.data.type === 'LOAD_INVOICE' && event.data.invoiceId) {
      loadInvoiceIntoEditor(event.data.invoiceId);
    } else if (event.data.type === 'SYNC_INVOICES' && Array.isArray(event.data.invoices)) {
      const syncedInvoices = event.data.invoices;
      StorageManager.saveAllInvoices(syncedInvoices, false);
      renderSavedInvoicesList();

      const activeInvoice = syncedInvoices.find(inv => inv.id === invoiceState.id);
      if (activeInvoice) {
        // Bandingkan isi invoice tanpa memicu auto-save ke parent
        if (JSON.stringify(activeInvoice) !== JSON.stringify(invoiceState)) {
          invoiceState = JSON.parse(JSON.stringify(activeInvoice));
          syncInputsWithState();
          renderItems();
          StorageManager.saveDraft(invoiceState);
          // AutoSave badge status update
          if (DOM.autoSaveBadge) {
            DOM.autoSaveBadge.classList.remove('saving');
            const span = DOM.autoSaveBadge.querySelector('span');
            if (span) span.textContent = 'Tersimpan';
          }
        }
      } else if (syncedInvoices.length > 0) {
        if (!invoiceState.id) {
          loadInvoiceIntoEditor(syncedInvoices[0].id, true);
        }
      } else {
        // Jika akun baru dan belum punya invoice apa pun, buka template lembaran baru yang bersih
        resetToNewBlankDocument('invoice', false, false);
      }
    }
  });

  localStorage.setItem('invoice_app_has_initialized', 'true');
  renderSavedInvoicesList();
}

// Run on load
document.addEventListener('DOMContentLoaded', initApp);
