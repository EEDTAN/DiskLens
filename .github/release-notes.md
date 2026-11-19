## Download

| | |
|---|---|
| **DiskLens-Setup.exe** | Installer with Start menu entry and desktop shortcut |
| **DiskLens-Portable.exe** | No installation, runs from any folder or USB stick |

Windows 10 and 11, 64-bit. DiskLens is not code-signed yet, so Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.

## What is new in 0.3.1

- **Delete straight from a selection**: the selection panel in Explorer has **Recycle Bin…** and **Delete permanently…**. Both open the review with that option already chosen. `Delete` and `Shift` + `Delete` do the same, like in File Explorer.
- **Select all / Select none** in Analysis and Old files (was "Collect all"), plus Recycle Bin and Delete permanently buttons once items are picked.

## Yang baru di 0.3.1

- **Hapus langsung dari pilihan**: panel pilihan di Penjelajah punya **Recycle Bin…** dan **Hapus permanen…**, yang membuka pemeriksaan dengan pilihan itu sudah terpilih. `Delete` dan `Shift` + `Delete` juga begitu, seperti di File Explorer.
- **Pilih semua / Batal pilih semua** di Analisis dan File lama, plus tombol Recycle Bin dan Hapus permanen setelah item dipilih.

## What is new in 0.3.0

- **Automatic updates**: the installed app checks GitHub when it starts and offers **Update now**, then **Restart and install**. Turn it off or check by hand in Settings → Updates. The portable version tells you about new versions and opens the download page.
- **Fits smaller windows**: screens no longer stick to the bottom edge or get cut off; they scroll when the window is short, and Explorer keeps file names readable in narrow windows.

Coming from 0.2.x: install this version once by hand. After that DiskLens updates itself.

## Yang baru di 0.3.0

- **Pembaruan otomatis**: app yang terpasang mengecek GitHub setiap dibuka dan menawarkan **Perbarui sekarang**, lalu **Mulai ulang dan pasang**. Bisa dimatikan atau dicek manual di Pengaturan → Pembaruan. Versi portable memberi tahu versi baru dan membuka halaman unduhan.
- **Pas di jendela kecil**: layar tidak lagi menempel atau terpotong di bagian bawah; bisa di-scroll kalau jendela pendek, dan nama file di Penjelajah tetap terbaca di jendela sempit.

Dari 0.2.x: pasang versi ini sekali secara manual. Setelah itu DiskLens memperbarui dirinya sendiri.

## What is new in 0.2.1

- **Select all** button in Explorer (also `Ctrl` + `A`); press it again to clear the selection.
- **Add all to collector** when several items are selected.
- **Collect all** button in Analysis and Old files for the list you are looking at.

## Yang baru di 0.2.1

- Tombol **Pilih semua** di Penjelajah (juga `Ctrl` + `A`); tekan lagi untuk membatalkan.
- **Tambah semua ke keranjang** saat beberapa item dipilih.
- Tombol **Kumpulkan semua** di Analisis dan File lama.

## What is new in 0.2.0

- **Analysis**: 48 rules explain what an item is and what happens if you delete it, grouped into *Safe to delete*, *Check first* and *Keep*, often with a better way to do it.
- **Collector**: drag items in or press +, review them, then move them to the Recycle Bin, move them to another drive (every file checked with SHA-256 before the original is removed), or delete permanently with an optional 3-pass overwrite.
- **Safety**: drive roots, Windows, Program Files, ProgramData, Users, your profile folders, boot files and DiskLens itself can never be deleted or moved. The check runs in the main process.
- **Duplicates**: identical files by size, then start and end, then full SHA-256. Hard links are not counted.
- **Old files**: big files that have not changed in 6 to 36 months.
- **Clean-up history** in Settings, and an **Empty Recycle Bin** button.
- Installer and portable app, built by GitHub Actions.

## Yang baru di 0.2.0 (Bahasa Indonesia)

- **Analisis**: 48 aturan menjelaskan apa sebuah item dan apa akibatnya kalau dihapus, dikelompokkan jadi *Aman dihapus*, *Cek dulu*, dan *Jangan dihapus*.
- **Keranjang kumpul**: Recycle Bin, pindah ke drive lain dengan pemeriksaan SHA-256, atau hapus permanen dengan pilihan timpa 3x.
- **Pengaman**: folder sistem dan program tidak pernah bisa dihapus atau dipindah.
- **Duplikat**, **File lama**, **Riwayat pembersihan**, dan tombol **Kosongkan Recycle Bin**.
