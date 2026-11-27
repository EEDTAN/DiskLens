// DiskLens helper (Windows). Scanning is read-only: it lists folders and never opens or changes a file.
// `fastscan.exe --trash` is the one exception: it moves the paths given on stdin to the Recycle Bin in one batch.
// Sizes, dates and file IDs come straight from the folder listing (one handle per folder, not per file),
// which is why it is much faster than asking for every file separately.
// Output: progress lines on stderr while scanning, then the whole tree as JSON on stdout.
// Built with the C# compiler that ships with Windows (.NET Framework 4): see native/build.js.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

// ---------- Recycle Bin in one batch (IFileOperation), like selecting many files in Explorer and pressing Delete ----------
[ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem { }
[ComImport, Guid("947aab5f-0a5c-4c13-b4d6-4bf7836fc9f8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileOperation {
  void Advise(IFileOperationProgressSink sink, out uint cookie);
  void Unadvise(uint cookie);
  void SetOperationFlags(uint flags);
  void _SetProgressMessage(); void _SetProgressDialog(); void _SetProperties(); void _SetOwnerWindow();
  void _ApplyPropertiesToItem(); void _ApplyPropertiesToItems(); void _RenameItem(); void _RenameItems();
  void _MoveItem(); void _MoveItems(); void _CopyItem(); void _CopyItems();
  void DeleteItem(IShellItem item, IntPtr sink);
  void _DeleteItems(); void _NewItem();
  void PerformOperations();
}
[ComVisible(true), Guid("04b0f1a7-9490-44bc-96e1-4296a31252e2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFileOperationProgressSink {
  [PreserveSig] int StartOperations();
  [PreserveSig] int FinishOperations(int hr);
  [PreserveSig] int PreRenameItem(uint f, IntPtr item, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostRenameItem(uint f, IntPtr item, [MarshalAs(UnmanagedType.LPWStr)] string name, int hr, IntPtr created);
  [PreserveSig] int PreMoveItem(uint f, IntPtr item, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostMoveItem(uint f, IntPtr item, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name, int hr, IntPtr created);
  [PreserveSig] int PreCopyItem(uint f, IntPtr item, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostCopyItem(uint f, IntPtr item, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name, int hr, IntPtr created);
  [PreserveSig] int PreDeleteItem(uint f, IntPtr item);
  [PreserveSig] int PostDeleteItem(uint f, IntPtr item, int hr, IntPtr created);
  [PreserveSig] int PreNewItem(uint f, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name);
  [PreserveSig] int PostNewItem(uint f, IntPtr dest, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string templ, uint attr, int hr, IntPtr created);
  [PreserveSig] int UpdateProgress(uint total, uint done);
  [PreserveSig] int ResetTimer(); [PreserveSig] int PauseTimer(); [PreserveSig] int ResumeTimer();
}
// Stops an item from being destroyed when Windows cannot put it in the Recycle Bin (too big, network drive...).
// DiskLens then reports it instead of deleting it for good without asking.
[ComVisible(true)]
public class OnlyRecycle : IFileOperationProgressSink {
  public int StartOperations() { return 0; } public int FinishOperations(int hr) { return 0; }
  public int PreRenameItem(uint f, IntPtr i, string n) { return 0; } public int PostRenameItem(uint f, IntPtr i, string n, int hr, IntPtr c) { return 0; }
  public int PreMoveItem(uint f, IntPtr i, IntPtr d, string n) { return 0; } public int PostMoveItem(uint f, IntPtr i, IntPtr d, string n, int hr, IntPtr c) { return 0; }
  public int PreCopyItem(uint f, IntPtr i, IntPtr d, string n) { return 0; } public int PostCopyItem(uint f, IntPtr i, IntPtr d, string n, int hr, IntPtr c) { return 0; }
  public int PreDeleteItem(uint f, IntPtr i) { return (f & 0x80 /* TSF_DELETE_RECYCLE_IF_POSSIBLE */) != 0 ? 0 : unchecked((int)0x80004004) /* E_ABORT */; }
  public int PostDeleteItem(uint f, IntPtr i, int hr, IntPtr c) { return 0; }
  public int PreNewItem(uint f, IntPtr d, string n) { return 0; } public int PostNewItem(uint f, IntPtr d, string n, string t, uint a, int hr, IntPtr c) { return 0; }
  public int UpdateProgress(uint t, uint d) { return 0; } public int ResetTimer() { return 0; } public int PauseTimer() { return 0; } public int ResumeTimer() { return 0; }
}

class Big { public string n; public long s; public long m; }
class Node { public string n; public long s, f, d; public List<Node> c = new List<Node>(); public List<Big> b; }
class Top { public string name, path; public long size; }

static partial class FastScan {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetFileInformationByHandleEx(IntPtr h, int cls, byte[] buf, uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern bool GetVolumeInformationW(string root, StringBuilder name, int nlen, out uint serial, out uint maxlen, out uint flags, StringBuilder fs, int fslen);

  const long BIG = 50L * 1024 * 1024;
  const uint TAG_MOUNT = 0xA0000003, TAG_SYMLINK = 0xA000000C;
  static long files, dirs, bytes, unread, linked, topMin;
  static volatile string cur = "";
  static bool dedupe;
  static readonly ConcurrentDictionary<long, byte> seen = new ConcurrentDictionary<long, byte>();
  static readonly string[] CATN = { "video", "image", "audio", "doc", "archive", "app", "other" };
  static readonly long[] cats = new long[7];
  static readonly Dictionary<string, int> CAT = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
  static readonly List<Top> top = new List<Top>();

  static void Put(int c, string list) { foreach (var e in list.Split(' ')) CAT[e] = c; }

  static void Walk(string dir, Node node) {
    cur = dir;
    IntPtr h = CreateFileW(@"\\?\" + dir, 1 /* list folder */, 7, IntPtr.Zero, 3, 0x02000000 /* backup semantics: open a folder */, IntPtr.Zero);
    if (h == new IntPtr(-1)) { Interlocked.Increment(ref unread); return; }
    var subs = new List<Node>();
    var buf = new byte[64 * 1024];
    string pre = dir.EndsWith("\\") ? dir : dir + "\\";
    try {
      while (GetFileInformationByHandleEx(h, 10 /* FileIdBothDirectoryInfo */, buf, (uint)buf.Length)) {
        int off = 0;
        while (true) {
          int next = BitConverter.ToInt32(buf, off);
          uint attr = BitConverter.ToUInt32(buf, off + 56);
          int nlen = BitConverter.ToInt32(buf, off + 60);
          uint tag = BitConverter.ToUInt32(buf, off + 64); // holds the reparse tag when the item is a reparse point
          string name = Encoding.Unicode.GetString(buf, off + 104, nlen);
          bool reparse = (attr & 0x400) != 0, link = reparse && (tag == TAG_MOUNT || tag == TAG_SYMLINK);
          if (name != "." && name != "..") {
            if ((attr & 0x10) != 0) { if (!link) subs.Add(new Node { n = name }); } // skip junctions and links: no loops, no double counting
            else {
              node.f++; Interlocked.Increment(ref files);
              long id = BitConverter.ToInt64(buf, off + 96);
              // A file with several hard links (common in Windows\WinSxS) is stored once, so count it once.
              if (dedupe && id != 0 && !seen.TryAdd(id, 0)) Interlocked.Increment(ref linked);
              else if (!link) {
                long size = BitConverter.ToInt64(buf, off + 40);
                node.s += size; Interlocked.Add(ref bytes, size);
                int dot = name.LastIndexOf('.'), c;
                if (dot < 0 || !CAT.TryGetValue(name.Substring(dot + 1), out c)) c = 6;
                Interlocked.Add(ref cats[c], size);
                if (size > Interlocked.Read(ref topMin)) AddTop(name, pre + name, size);
                if (size >= BIG) {
                  if (node.b == null) node.b = new List<Big>();
                  node.b.Add(new Big { n = name, s = size, m = BitConverter.ToInt64(buf, off + 24) / 10000 - 11644473600000L });
                }
              }
            }
          }
          if (next == 0) break;
          off += next;
        }
      }
    } finally { CloseHandle(h); }
    Interlocked.Add(ref dirs, subs.Count);
    if (subs.Count > 1) Parallel.ForEach(subs, k => Walk(pre + k.n, k));
    else foreach (var k in subs) Walk(pre + k.n, k);
    foreach (var k in subs) { node.s += k.s; node.f += k.f; node.d += k.d + 1; node.c.Add(k); }
  }

  static void AddTop(string name, string path, long size) {
    lock (top) {
      top.Add(new Top { name = name, path = path, size = size });
      top.Sort((a, b) => b.size.CompareTo(a.size));
      if (top.Count > 8) top.RemoveAt(8);
      if (top.Count == 8) Interlocked.Exchange(ref topMin, top[7].size);
    }
  }

  // JSON strings: escape quotes, control characters and lone surrogates so JavaScript gets the exact name back.
  static void Str(TextWriter w, string s) {
    w.Write('"');
    foreach (char ch in s) {
      if (ch == '"') w.Write("\\\""); else if (ch == '\\') w.Write("\\\\");
      else if (ch < 0x20 || (ch >= 0xD800 && ch <= 0xDFFF)) w.Write("\\u" + ((int)ch).ToString("x4"));
      else w.Write(ch);
    }
    w.Write('"');
  }
  static void Tree(TextWriter w, Node n) {
    w.Write("{\"n\":"); Str(w, n.n);
    w.Write(",\"s\":" + n.s + ",\"f\":" + n.f + ",\"d\":" + n.d + ",\"c\":[");
    for (int i = 0; i < n.c.Count; i++) { if (i > 0) w.Write(','); Tree(w, n.c[i]); }
    w.Write(']');
    if (n.b != null) {
      w.Write(",\"b\":[");
      for (int i = 0; i < n.b.Count; i++) { if (i > 0) w.Write(','); w.Write('['); Str(w, n.b[i].n); w.Write("," + n.b[i].s + "," + n.b[i].m + "]"); }
      w.Write(']');
    }
    w.Write('}');
  }
  static string TopJson() {
    var sw = new StringWriter(); sw.Write('[');
    lock (top) for (int i = 0; i < top.Count; i++) {
      if (i > 0) sw.Write(',');
      sw.Write("{\"name\":"); Str(sw, top[i].name); sw.Write(",\"path\":"); Str(sw, top[i].path); sw.Write(",\"size\":" + top[i].size + "}");
    }
    sw.Write(']'); return sw.ToString();
  }
  static void Progress(TextWriter err) {
    var sw = new StringWriter();
    sw.Write("{\"files\":" + Interlocked.Read(ref files) + ",\"dirs\":" + Interlocked.Read(ref dirs) + ",\"bytes\":" + Interlocked.Read(ref bytes) + ",\"cur\":");
    Str(sw, cur); sw.Write(",\"top\":" + TopJson() + "}");
    err.WriteLine(sw.ToString()); err.Flush();
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);

  // Moves every path given on stdin to the Recycle Bin in one operation. The caller checks afterwards which ones are gone.
  static int Trash() {
    var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    var op = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3ad05575-8857-4850-9277-11b85bdb8e09")));
    op.SetOperationFlags(0x614 | 0x40 | 0x00080000); // no UI, allow undo, recycle on delete
    uint cookie; op.Advise(new OnlyRecycle(), out cookie);
    int n = 0; string line;
    while ((line = input.ReadLine()) != null) {
      if (line.Length == 0) continue;
      try { IShellItem it; SHCreateItemFromParsingName(line, IntPtr.Zero, new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), out it); op.DeleteItem(it, IntPtr.Zero); n++; } catch { /* missing or unreadable: reported by the caller */ }
    }
    if (n > 0) try { op.PerformOperations(); } catch { /* some items failed or were refused: the caller checks each path */ }
    return 0;
  }

  // ---------- what Windows knows: installed programs and file types (read-only) ----------
  [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
  static extern int AssocQueryStringW(int flags, int what, string assoc, string extra, StringBuilder outp, ref uint len);
  static string Assoc(int what, string ext) {
    uint len = 512; var sb = new StringBuilder(512);
    return AssocQueryStringW(0x400 /* fail for unknown types */, what, "." + ext, null, sb, ref len) == 0 ? sb.ToString().Trim() : "";
  }
  // `--types ext...`: the type name and the app that opens it, as File Explorer shows them.
  static int Types(string[] exts) {
    var w = new StringWriter(); w.Write('{'); bool first = true;
    foreach (var e in exts) {
      string type = Assoc(3 /* friendly doc name */, e), app = Assoc(4 /* friendly app name */, e);
      if (type == "" && app == "") continue;
      if (!first) w.Write(','); first = false;
      Str(w, e); w.Write(":{\"type\":"); Str(w, type); w.Write(",\"app\":"); Str(w, app); w.Write('}');
    }
    w.Write('}'); Out(w.ToString()); return 0;
  }
  static string DirOf(string s) {
    if (string.IsNullOrEmpty(s)) return "";
    s = s.Trim();
    if (s.StartsWith("\"")) { int e = s.IndexOf('"', 1); if (e < 0) return ""; s = s.Substring(1, e - 1); }
    else { int c = s.IndexOf(','); if (c > 0) s = s.Substring(0, c); int x = s.ToLowerInvariant().IndexOf(".exe"); if (x > 0) s = s.Substring(0, x + 4); }
    var l = s.ToLowerInvariant();
    if (!l.EndsWith(".exe") && !l.EndsWith(".ico")) return "";
    try { return Path.GetDirectoryName(s) ?? ""; } catch { return ""; }
  }
  // `--apps`: every program in Windows' list of installed apps (Settings → Apps), with its folder.
  static int Apps() {
    var w = new StringWriter(); w.Write('['); bool first = true;
    foreach (var hive in new[] { Microsoft.Win32.RegistryHive.LocalMachine, Microsoft.Win32.RegistryHive.CurrentUser })
      foreach (var view in new[] { Microsoft.Win32.RegistryView.Registry64, Microsoft.Win32.RegistryView.Registry32 }) {
        try {
          using (var b = Microsoft.Win32.RegistryKey.OpenBaseKey(hive, view))
          using (var u = b.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")) {
            if (u == null) continue;
            foreach (var n in u.GetSubKeyNames()) {
              try {
                using (var k = u.OpenSubKey(n)) {
                  var name = k.GetValue("DisplayName") as string;
                  if (string.IsNullOrWhiteSpace(name)) continue;
                  string loc = ((k.GetValue("InstallLocation") as string) ?? "").Trim().Trim('"');
                  if (loc == "") loc = DirOf(k.GetValue("DisplayIcon") as string);
                  if (loc == "") loc = DirOf(k.GetValue("UninstallString") as string);
                  if (loc == "") continue;
                  if (!first) w.Write(','); first = false;
                  w.Write("{\"name\":"); Str(w, name.Trim()); w.Write(",\"pub\":"); Str(w, ((k.GetValue("Publisher") as string) ?? "").Trim());
                  w.Write(",\"loc\":"); Str(w, loc.TrimEnd('\\')); w.Write('}');
                }
              } catch { /* unreadable entry */ }
            }
          }
        } catch { /* hive or view not available */ }
      }
    w.Write(']'); Out(w.ToString()); return 0;
  }
  static void Out(string s) { var o = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)); o.Write(s); o.Flush(); }

  [STAThread]
  static int Main(string[] args) {
    if (args.Length < 1) return 2;
    if (args[0] == "--trash") return Trash();
    if (args[0] == "--apps") return Apps();
    if (args[0] == "--phones") return Phones();
    if (args[0] == "--mtp-ops" && args.Length >= 5) return PhoneOps(args);
    if (args[0] == "--types") { var ex = new string[args.Length - 1]; Array.Copy(args, 1, ex, 0, ex.Length); return Types(ex); }
    if (args[0] == "--info") { // description and company written inside a program file
      try {
        var v = System.Diagnostics.FileVersionInfo.GetVersionInfo(args[1]);
        var w = new StringWriter(); w.Write("{\"desc\":"); Str(w, (v.FileDescription ?? "").Trim()); w.Write(",\"company\":"); Str(w, (v.CompanyName ?? "").Trim());
        w.Write(",\"product\":"); Str(w, (v.ProductName ?? "").Trim()); w.Write("}");
        var io = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)); io.Write(w.ToString()); io.Flush();
      } catch { Console.Write("null"); }
      return 0;
    }
    Put(0, "mp4 mkv avi mov wmv webm flv m4v mpg mpeg 3gp");
    Put(1, "jpg jpeg png gif webp bmp heic tif tiff raw cr2 nef svg ico psd");
    Put(2, "mp3 wav flac aac ogg m4a wma opus");
    Put(3, "pdf doc docx xls xlsx ppt pptx txt md rtf csv odt ods");
    Put(4, "zip rar 7z tar gz bz2 iso img vhd vhdx");
    Put(5, "exe dll sys msi bat cmd com ocx drv cab msu");
    bool phone = args[0] == "--mtp" && args.Length >= 4;
    string root = phone ? args[3] : args[0], dir = root.Replace('/', '\\');
    if (dir.Length > 3) dir = dir.TrimEnd('\\');
    uint serial, maxlen, flags;
    if (!phone) dedupe = GetVolumeInformationW(Path.GetPathRoot(dir), null, 0, out serial, out maxlen, out flags, null, 0) && (flags & 0x00400000) != 0; // volume supports hard links
    var err = new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false));
    var tree = new Node { n = root };
    var done = new ManualResetEvent(false);
    var ticker = new Thread(() => { while (!done.WaitOne(120)) Progress(err); }) { IsBackground = true };
    ticker.Start();
    if (phone) {
      try { tree = ScanPhone(args[1], args[2], root); }
      catch (Exception e) { done.Set(); ticker.Join(); err.WriteLine("phone: " + e.Message); err.Flush(); return 3; }
    } else Walk(dir, tree);
    done.Set(); ticker.Join();
    var o = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false), 1 << 20);
    o.Write("{\"tree\":"); Tree(o, tree);
    o.Write(",\"files\":" + files + ",\"dirs\":" + dirs + ",\"bytes\":" + bytes + ",\"unread\":" + unread + ",\"linked\":" + linked + ",\"cats\":{");
    for (int i = 0; i < 7; i++) { if (i > 0) o.Write(','); o.Write("\"" + CATN[i] + "\":" + cats[i]); }
    o.Write("}}"); o.Flush();
    return 0;
  }
}
