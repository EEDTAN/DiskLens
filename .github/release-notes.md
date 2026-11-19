## Download

| | |
|---|---|
| **DiskLens-Setup.exe** | Installer with Start menu entry and desktop shortcut |
| **DiskLens-Portable.exe** | No installation, runs from any folder or USB stick |

Windows 10 and 11, 64-bit. DiskLens is not code-signed yet, so Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.

## What is new in 0.3.9

- **An explanation for every item, not only the ones a rule knows.** DiskLens now builds it from three things Windows already has:
  - **Where it is**: the nearest folder it recognises. A file in `AppData\Roaming\Spotify` is "data of the app Spotify". A file in `Program Files\Discord` is "part of the program Discord", and so on.
  - **Windows' list of installed programs** (the same list as Settings → Apps). Programs installed anywhere, for example a game on `D:\`, are recognised by name and maker.
  - **The file itself**: the type from its extension or from Windows (the "Type" column in File Explorer, with the app that opens it), and for .exe, .dll and .sys files, the name and maker written inside them.
- Folders with .exe files that Windows has no record of are explained as a portable program or game.
- Files inside an installed program or inside Windows are now locked like the folder itself. Programs installed only for your account are marked "Check first".
- Items that nothing explains still say so honestly: DiskLens does not guess.

## Yang baru di 0.3.9

- **Setiap item punya penjelasan, tidak hanya yang dikenal aturan.** DiskLens sekarang menyusunnya dari tiga hal yang sudah dimiliki Windows:
  - **Lokasinya**: folder terdekat yang dikenali. File di `AppData\Roaming\Spotify` dijelaskan sebagai "data milik aplikasi Spotify". File di `Program Files\Discord` dijelaskan sebagai "bagian dari program Discord", dan seterusnya.
  - **Daftar program terpasang di Windows** (sama dengan Pengaturan → Aplikasi). Program yang dipasang di mana saja, misalnya game di `D:\`, dikenali nama dan pembuatnya.
  - **Filenya sendiri**: jenisnya dari ekstensi atau dari Windows (kolom "Type" di File Explorer, beserta aplikasi pembukanya). Untuk file .exe, .dll, dan .sys, nama dan pembuat yang tertulis di dalam file juga dibaca.
- Folder berisi file .exe yang tidak tercatat di Windows dijelaskan sebagai program atau game portable.
- File di dalam program terpasang atau di dalam Windows sekarang ikut dikunci seperti foldernya. Program yang dipasang hanya untuk akunmu diberi label "Cek dulu".
- Item yang tidak bisa dijelaskan tetap ditulis apa adanya: DiskLens tidak menebak.

## What is new in 0.3.8

- **Open folders in Analysis**: folder items have a ▸. Click it or double-click the row to see what is inside, level by level. Items inside a temp or cache folder are labelled like the folder, and protected ones show a lock.
- **Smoother photo and video viewer**: the arrow keys and the ‹ › buttons now slide the next photo or video in. The viewer no longer closes and reopens on every step.

## Yang baru di 0.3.8

- **Buka folder di Analisis**: item folder punya tombol ▸. Klik tombol itu atau klik dua kali barisnya untuk melihat isinya, tingkat demi tingkat. Isi folder temp atau cache diberi label seperti foldernya, dan yang dilindungi diberi gembok.
- **Penampil foto dan video lebih halus**: tombol panah dan tombol ‹ › sekarang menggeser foto atau video berikutnya masuk. Penampil tidak lagi tertutup lalu terbuka ulang di setiap langkah.

## What is new in 0.3.7

- **Photos and videos fit the screen**: the viewer showed big photos at full size, so they were zoomed in and cut off. Now every photo and video is shown whole, keeps its shape, and grows or shrinks with the window.

## Yang baru di 0.3.7

- **Foto dan video menyesuaikan layar**: sebelumnya foto besar tampil di ukuran aslinya, jadi terlihat ter-zoom dan terpotong. Sekarang setiap foto dan video tampil utuh, proporsinya tetap, dan ikut membesar atau mengecil mengikuti jendela.

## What is new in 0.3.6

- **Analysis is a plain list again**, biggest first. Each row shows where the item lives (📂 its folder). Long paths keep the drive and the last folders. "What is this" and "if deleted" stay in the side panel.

## Yang baru di 0.3.6

- **Analisis kembali jadi daftar langsung**, dari yang terbesar. Tiap baris menampilkan lokasinya (📂 folder asalnya). Path yang panjang tetap menampilkan huruf drive dan folder terakhirnya. "Apa ini" dan "kalau dihapus" tetap ada di panel samping.

## What is new in 0.3.5

- **Double-click opens and closes a folder level** in Explorer's list, Analysis and Old files, instead of going into the folder. Enter or right-click → Open still goes into it.
- **Softer home screen**: the shadows of the logo and the big purple card were cut off into hard edges. They now fade out smoothly, also on the scan result and Settings screens.
- Fixed an error when clicking empty space in Analysis after selecting items in Explorer.

## Yang baru di 0.3.5

- **Klik dua kali membuka dan menutup tingkat folder** di daftar Penjelajah, Analisis, dan File lama, tidak lagi masuk ke dalam folder. Enter atau klik kanan → Buka tetap masuk ke folder.
- **Beranda lebih halus**: bayangan logo dan kotak ungu besar sebelumnya terpotong jadi garis tajam. Sekarang memudar dengan lembut, begitu juga di layar hasil scan dan Pengaturan.
- Diperbaiki: error saat mengklik area kosong di Analisis setelah memilih item di Penjelajah.

## What is new in 0.3.4

- **Much faster scanning**: a small Windows scanner reads sizes straight from the folder listing. A whole C: drive with 778,000 files went from 175 seconds to 7.5 seconds on the test PC. If it cannot run, DiskLens falls back to the old scanner.
- **More accurate totals**: pagefile.sys, hiberfil.sys and swapfile.sys are now counted (the old scanner could not read them). All three stay locked.
- **Faster Recycle Bin**: all items go to the Recycle Bin in one Windows operation. Items Windows cannot recycle are reported, never deleted for good.
- **Everything is a tree**: Explorer's list view opens folders in place with ▸. Analysis and Old files show every folder level. Folder rows look like file rows, and each level has its own colour.
- Selecting a folder together with things inside it no longer shows a message. Only the folder goes into the collector.
- Softer shadows and glows, no hard bands under the list, and smooth hover and press effects.
- Fixed: settings with a byte-order mark (for example after editing in Notepad) were read as empty.

## Yang baru di 0.3.4

- **Scan jauh lebih cepat**: pemindai kecil khusus Windows membaca ukuran langsung dari daftar folder. Seluruh drive C: dengan 778.000 file turun dari 175 detik ke 7,5 detik di PC uji. Kalau pemindai ini tidak bisa jalan, DiskLens kembali memakai pemindai lama.
- **Total lebih akurat**: pagefile.sys, hiberfil.sys, dan swapfile.sys sekarang ikut dihitung (pemindai lama tidak bisa membacanya). Ketiganya tetap dikunci.
- **Recycle Bin lebih cepat**: semua item masuk Recycle Bin dalam satu operasi Windows. Item yang tidak bisa masuk Recycle Bin dilaporkan, tidak pernah dihapus permanen diam-diam.
- **Semuanya bertingkat**: tampilan Daftar di Penjelajah membuka folder di tempat dengan ▸. Analisis dan File lama menampilkan setiap tingkat folder. Baris folder sama seperti baris file, dan tiap tingkat punya warnanya sendiri.
- Memilih folder bersama isinya tidak lagi memunculkan pesan. Hanya foldernya yang masuk keranjang.
- Bayangan dan glow lebih lembut, tidak ada lagi pita kaku di bawah daftar, dan efek hover serta tekan lebih halus.
- Diperbaiki: pengaturan yang punya penanda BOM (misalnya setelah diedit di Notepad) terbaca kosong.

## What is new in 0.3.3

- **Dark theme**: Settings → Theme → Light, Dark, or Same as Windows.
- **Folder tree** in Analysis and Old files: each item sits under its folder, indented, with a line to the parent folder. Click a folder to fold it.
- **Temp and cache folders are cleaned in place**: only what is inside gets deleted, like Windows Disk Cleanup, and files in use are skipped. This also works for Temp and Logs inside Windows, so Select all no longer skips them.
- The Recycle Bin has its own **Empty** button. Items that must stay show a lock, and DiskLens's own folders are no longer listed.
- **Faster deleting**: sizes come from the scan instead of being counted again, several items are deleted at once, and cache folders no longer go through the Recycle Bin.

## Yang baru di 0.3.3

- **Tema gelap**: Pengaturan → Tema → Terang, Gelap, atau Ikuti Windows.
- **Tampilan bertingkat** di Analisis dan File lama: tiap item ada di bawah foldernya, menjorok ke dalam, dengan garis ke folder induknya. Klik folder untuk melipatnya.
- **Folder Temp dan cache dibersihkan isinya saja**, seperti Disk Cleanup di Windows, dan file yang sedang dipakai dilewati. Berlaku juga untuk Temp dan Logs di dalam Windows, jadi Pilih semua tidak melewatinya lagi.
- Recycle Bin punya tombol **Kosongkan** sendiri. Item yang harus tetap ada diberi gembok, dan folder milik DiskLens sendiri tidak ditampilkan lagi.
- **Hapus lebih cepat**: ukuran diambil dari hasil scan tanpa dihitung ulang, beberapa item dihapus sekaligus, dan folder cache tidak lewat Recycle Bin.

## What is new in 0.3.2

- **Fixed**: with many items, the review window pushed the three choices (Recycle Bin, Move to another drive, Delete permanently) below the list, so only the Recycle Bin button showed. The choices now sit above the list and are always visible.
- The collector button is now a red **Delete** button. The extra delete buttons added in 0.3.1 are gone; everything goes through this one place. `Delete` still opens it with Recycle Bin chosen, `Shift` + `Delete` with Delete permanently.

## Yang baru di 0.3.2

- **Diperbaiki**: kalau item banyak, tiga pilihan (Recycle Bin, Pindah ke drive lain, Hapus permanen) terdorong ke bawah daftar sehingga hanya tombol Recycle Bin yang terlihat. Sekarang pilihannya ada di atas daftar dan selalu terlihat.
- Tombol di keranjang sekarang tombol merah **Hapus**. Tombol hapus tambahan dari 0.3.1 dihapus, semuanya lewat satu tempat ini. `Delete` tetap membukanya dengan Recycle Bin terpilih, `Shift` + `Delete` dengan Hapus permanen.

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
