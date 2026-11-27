// Phones and tablets plugged in by USB (MTP). Windows gives them no drive letter, so they are read
// through Windows Portable Devices (WPD), the same way File Explorer shows them under "This PC".
// Read-only: it only lists folders and reads names, sizes and dates.
//   fastscan.exe --phones                       -> [{dev,name,storages:[{id,name,total,free}]}]
//   fastscan.exe --mtp <dev> <storage> <root>   -> same tree JSON as a folder scan
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[StructLayout(LayoutKind.Sequential)]
struct PropKey { public Guid fmtid; public uint pid; public PropKey(Guid g, uint p) { fmtid = g; pid = p; } }

[ComImport, Guid("a1567595-4c2f-4574-a6fa-ecef917b9a40"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDeviceManager {
  void GetDevices(IntPtr ids, ref uint count);
  void RefreshDeviceList();
  void GetDeviceFriendlyName([MarshalAs(UnmanagedType.LPWStr)] string id, [Out] StringBuilder name, ref uint len);
}
[ComImport, Guid("625e2df8-6392-4cf0-9ad1-3cfa5f17775c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDevice {
  void Open([MarshalAs(UnmanagedType.LPWStr)] string id, IPortableDeviceValues clientInfo);
  void _SendCommand();
  void Content(out IPortableDeviceContent content);
  void _Capabilities(); void _Cancel();
  void Close();
}
[ComImport, Guid("6a96ed84-7c73-4480-9938-bf5af477d426"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDeviceContent {
  void EnumObjects(uint flags, [MarshalAs(UnmanagedType.LPWStr)] string parent, IPortableDeviceValues filter, out IEnumPortableDeviceObjectIDs e);
  void Properties(out IPortableDeviceProperties props);
}
[ComImport, Guid("10ece955-cf41-4728-bfa0-41eedf1bbf19"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEnumPortableDeviceObjectIDs {
  [PreserveSig] int Next(uint n, IntPtr ids, out uint fetched);
}
[ComImport, Guid("7f6d695c-03df-4439-a809-59266beee3a6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDeviceProperties {
  void _GetSupportedProperties(); void _GetPropertyAttributes();
  void GetValues([MarshalAs(UnmanagedType.LPWStr)] string obj, IPortableDeviceKeyCollection keys, out IPortableDeviceValues values);
}
[ComImport, Guid("dada2357-e0ad-492e-98db-dd61c53ba353"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDeviceKeyCollection {
  void GetCount(out uint n); void _GetAt();
  void Add(ref PropKey key);
}
[ComImport, Guid("6848f6f2-3155-4f86-b6f5-263eeeab3143"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPortableDeviceValues {
  void GetCount(out uint n); void _GetAt(); void _SetValue();
  [PreserveSig] int GetValue(ref PropKey key, IntPtr pv);
  void _SetStringValue();
  [PreserveSig] int GetStringValue(ref PropKey key, [MarshalAs(UnmanagedType.LPWStr)] out string v);
  void _SetUnsignedIntegerValue(); void _GetUnsignedIntegerValue(); void _SetSignedIntegerValue(); void _GetSignedIntegerValue();
  void _SetUnsignedLargeIntegerValue();
  [PreserveSig] int GetUnsignedLargeIntegerValue(ref PropKey key, out ulong v);
  void _SetSignedLargeIntegerValue(); void _GetSignedLargeIntegerValue(); void _SetFloatValue(); void _GetFloatValue();
  void _SetErrorValue(); void _GetErrorValue(); void _SetKeyValue(); void _GetKeyValue(); void _SetBoolValue(); void _GetBoolValue();
  void _SetIUnknownValue(); void _GetIUnknownValue(); void _SetGuidValue();
  [PreserveSig] int GetGuidValue(ref PropKey key, out Guid v);
}

static partial class FastScan {
  static readonly Guid OBJ = new Guid("EF6B490D-5CD8-437A-AFFC-DA8B60EE4A3C"), STO = new Guid("01A3057A-74D6-4E80-BEA7-DC4C212CE50A");
  static PropKey K_NAME = new PropKey(OBJ, 4), K_TYPE = new PropKey(OBJ, 7), K_SIZE = new PropKey(OBJ, 11),
    K_FILE = new PropKey(OBJ, 12), K_MOD = new PropKey(OBJ, 19), K_CAP = new PropKey(STO, 4), K_FREE = new PropKey(STO, 5), K_DESC = new PropKey(STO, 7);
  static readonly Guid FOLDER = new Guid("27E2E392-A111-48E0-AB0C-E17705A05F85"), FUNCTIONAL = new Guid("99ED0160-17FF-4C44-9D98-1D7A6F941921");

  static T Make<T>(string clsid) { return (T)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid(clsid))); }
  static IPortableDeviceKeyCollection Keys(params PropKey[] ks) {
    var c = Make<IPortableDeviceKeyCollection>("de2d022d-2480-43be-97f0-d1fa2cf98f4f");
    for (int i = 0; i < ks.Length; i++) c.Add(ref ks[i]);
    return c;
  }
  static IPortableDevice OpenDevice(string id) {
    var d = Make<IPortableDevice>("728a21c5-3d9e-48d7-9810-864848f0f404");
    d.Open(id, Make<IPortableDeviceValues>("0c15d503-d017-47ce-9016-7b3f978721cc"));
    return d;
  }
  static List<string> Children(IPortableDeviceContent c, string parent) {
    var list = new List<string>();
    IEnumPortableDeviceObjectIDs e; c.EnumObjects(0, parent, null, out e);
    IntPtr buf = Marshal.AllocCoTaskMem(256 * IntPtr.Size); uint got;
    try {
      while (true) {
        int hr = e.Next(256, buf, out got);
        for (int i = 0; i < got; i++) { IntPtr p = Marshal.ReadIntPtr(buf, i * IntPtr.Size); list.Add(Marshal.PtrToStringUni(p)); Marshal.FreeCoTaskMem(p); }
        if (hr != 0 || got == 0) break;
      }
    } finally { Marshal.FreeCoTaskMem(buf); }
    return list;
  }
  static string S(IPortableDeviceValues v, PropKey k) { string s; return v.GetStringValue(ref k, out s) == 0 ? s : null; }
  static long U(IPortableDeviceValues v, PropKey k) { ulong n; return v.GetUnsignedLargeIntegerValue(ref k, out n) == 0 ? (long)n : 0; }
  static long Date(IPortableDeviceValues v, PropKey k) { // VT_DATE -> ms since 1970
    IntPtr pv = Marshal.AllocCoTaskMem(24);
    try {
      for (int i = 0; i < 24; i++) Marshal.WriteByte(pv, i, 0);
      if (v.GetValue(ref k, pv) != 0 || Marshal.ReadInt16(pv) != 7) return 0;
      return (long)((BitConverter.Int64BitsToDouble(Marshal.ReadInt64(pv, 8)) - 25569) * 86400000);
    } finally { Marshal.FreeCoTaskMem(pv); }
  }

  static int Phones() {
    var w = new StringWriter(); w.Write('[');
    try {
      var m = Make<IPortableDeviceManager>("0af10cec-2ecd-4b92-9581-34f6ae0637f3");
      uint n = 0; m.GetDevices(IntPtr.Zero, ref n);
      var buf = Marshal.AllocCoTaskMem((int)Math.Max(1, n) * IntPtr.Size); if (n > 0) m.GetDevices(buf, ref n);
      var ids = new IntPtr[n]; if (n > 0) Marshal.Copy(buf, ids, 0, (int)n); Marshal.FreeCoTaskMem(buf);
      bool first = true;
      for (int i = 0; i < n; i++) {
        string id = Marshal.PtrToStringUni(ids[i]); Marshal.FreeCoTaskMem(ids[i]);
        string name = id; uint len = 256; var sb = new StringBuilder(256);
        try { m.GetDeviceFriendlyName(id, sb, ref len); name = sb.ToString(); } catch { }
        var st = new StringWriter(); bool f2 = true;
        try { // a locked phone, or one set to "charging only", shows no storage
          var d = OpenDevice(id); IPortableDeviceContent c; d.Content(out c); IPortableDeviceProperties p; c.Properties(out p);
          var keys = Keys(K_TYPE, K_DESC, K_NAME, K_CAP, K_FREE);
          foreach (var sid in Children(c, "DEVICE")) {
            IPortableDeviceValues v; p.GetValues(sid, keys, out v);
            Guid t; var kt = K_TYPE; if (v.GetGuidValue(ref kt, out t) != 0 || t != FUNCTIONAL) continue;
            long cap = U(v, K_CAP); if (cap <= 0) continue;
            if (sid.Length <= 3 && sid.Length >= 2 && sid[1] == ':') continue; // USB disks also show up here, but they already have a drive letter
            if (!f2) st.Write(','); f2 = false;
            st.Write("{\"id\":"); Str(st, sid); st.Write(",\"name\":"); Str(st, S(v, K_DESC) ?? S(v, K_NAME) ?? sid);
            st.Write(",\"total\":" + cap + ",\"free\":" + U(v, K_FREE) + "}");
          }
          d.Close();
        } catch { }
        if (f2 && id.IndexOf("wpdbusenum", StringComparison.OrdinalIgnoreCase) >= 0) continue; // a USB disk with a letter, not a phone
        if (!first) w.Write(','); first = false;
        w.Write("{\"dev\":"); Str(w, id); w.Write(",\"name\":"); Str(w, name); w.Write(",\"storages\":[" + st + "]}");
      }
    } catch { }
    w.Write(']'); Out(w.ToString()); return 0;
  }

  static IPortableDeviceContent mc; static IPortableDeviceProperties mp; static IPortableDeviceKeyCollection mk;
  static void WalkPhone(string objId, string path, Node node) {
    cur = path;
    List<string> kids;
    try { kids = Children(mc, objId); } catch { Interlocked.Increment(ref unread); return; }
    foreach (var id in kids) {
      IPortableDeviceValues v;
      try { mp.GetValues(id, mk, out v); } catch { Interlocked.Increment(ref unread); continue; }
      string name = S(v, K_FILE) ?? S(v, K_NAME) ?? id;
      Guid t; var kt = K_TYPE; bool isDir = v.GetGuidValue(ref kt, out t) == 0 && (t == FOLDER || t == FUNCTIONAL);
      if (isDir) {
        var k = new Node { n = name };
        WalkPhone(id, path + "\\" + name, k);
        dirs++; node.s += k.s; node.f += k.f; node.d += k.d + 1; node.c.Add(k);
      } else {
        long size = U(v, K_SIZE);
        files++; node.f++; node.s += size; bytes += size;
        int c; cats[CAT.TryGetValue(Path.GetExtension(name).TrimStart('.'), out c) ? c : 6] += size;
        if (size > topMin || top.Count < 8) AddTop(name, path + "\\" + name, size);
        // Every file is kept (not only big ones): a phone cannot be listed again quickly, so the Explorer view is built from this.
        if (node.b == null) node.b = new List<Big>();
        node.b.Add(new Big { n = name, s = size, m = Date(v, K_MOD) });
      }
    }
  }

  static Node ScanPhone(string dev, string storage, string root) {
    var d = OpenDevice(dev); d.Content(out mc); mc.Properties(out mp);
    mk = Keys(K_NAME, K_FILE, K_TYPE, K_SIZE, K_MOD);
    var tree = new Node { n = root };
    WalkPhone(storage, root.TrimEnd('\\'), tree);
    d.Close();
    return tree;
  }
}
