(function () {
  "use strict";

  const EXTRA_ROWS = 20; // jumlah baris Cash / QRIS / Pengeluaran
  const DEFAULT_PRODUCTS = [
    ["AMERICANO", 8000], ["REDBERRYCANO", 12000], ["LUMA PEARL", 12000], ["GOLDEN DRIFT", 12000],
    ["RENJANA", 11000], ["KAHWA", 10000], ["SAKALA", 11000], ["CARAMEL", 13000],
    ["HAZELNUT", 13000], ["BUTTERSCOTCH", 13000], ["PANDAN", 13000], ["PISTACHIO", 13000],
    ["REDVELVET", 12000], ["MATCHA", 12000], ["TARO", 12000], ["CHOCOLATE", 12000]
  ].map((p, i) => ({ id: i + 1, name: p[0], price: p[1], sort: i + 1 }));

  const $ = (id) => document.getElementById(id);
  const rp = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let sb = null;
  let products = DEFAULT_PRODUCTS.slice();
  // rows: satu baris per produk -> {pid, name, price, jumlah, masuk, keluar, kds, sisa}
  let rows = [];
  let cash = [], qris = [], keluar = [];
  let minusRill = "";           // diisi manual
  let busy = false;
  let isSaved = false;          // tanggal yang sedang dibuka sudah pernah disimpan?
  let productsDirty = false;    // daftar produk berubah sejak rekap terakhir dibangun

  // ---------- util tanggal (tanpa masalah zona waktu) ----------
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDay(str, n) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }

  function toast(msg, err) {
    const t = $("toast");
    t.textContent = msg;
    t.className = err ? "err" : "";
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), err ? 6000 : 2800);
  }

  // ---------- helper baris ----------
  const blankRow = (p) => ({ pid: p.id, name: p.name, price: p.price, jumlah: "", masuk: "", keluar: "", kds: "", sisa: "" });
  const findItem = (list, p) =>
    (list || []).find((r) => r.pid != null && r.pid === p.id) || (list || []).find((r) => r.name === p.name);
  const valuesFrom = (r) => ({
    jumlah: r.jumlah ?? "", masuk: r.masuk ?? "", keluar: r.keluar ?? "", kds: r.kds ?? "", sisa: r.sisa ?? ""
  });
  const padArr = (a) => {
    const x = (a || []).map((v) => (v === 0 ? "" : v));
    while (x.length < EXTRA_ROWS) x.push("");
    return x.slice(0, EXTRA_ROWS);
  };

  function emptyState() {
    rows = products.map(blankRow);
    cash = Array(EXTRA_ROWS).fill("");
    qris = Array(EXTRA_ROWS).fill("");
    keluar = Array(EXTRA_ROWS).fill("");
    minusRill = "";
  }

  // ---------- render tabel rekap ----------
  function buildLeft() {
    const tb = document.querySelector("#tblLeft tbody");
    tb.innerHTML = "";
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td class="c">${i + 1}</td><td class="t">${esc(r.name)}</td>` +
        ["jumlah", "masuk", "keluar", "kds"].map((k) =>
          `<td><input type="number" inputmode="numeric" data-i="${i}" data-k="${k}"></td>`).join("") +
        `<td class="c" id="tot${i}">0</td><td class="c" id="ter${i}">0</td>` +
        `<td><input type="number" inputmode="numeric" data-i="${i}" data-k="sisa"></td>` +
        `<td class="m" id="hrg${i}">${rp(r.price)}</td><td class="m" id="uang${i}">Rp0</td>`;
      tb.appendChild(tr);
    });
    tb.oninput = (e) => {
      const el = e.target;
      if (el.dataset.k) { rows[+el.dataset.i][el.dataset.k] = el.value; recalc(); }
    };
  }

  function buildRight() {
    const rb = document.querySelector("#tblRight tbody");
    rb.innerHTML = "";
    for (let r = 0; r < EXTRA_ROWS; r++) {
      const tr = document.createElement("tr");
      tr.innerHTML = ["cash", "qris", "keluar"].map((k) =>
        `<td><input type="number" inputmode="numeric" min="0" data-r="${r}" data-c="${k}"></td>`).join("");
      rb.appendChild(tr);
    }
    rb.oninput = (e) => {
      const el = e.target;
      if (!el.dataset.c) return;
      const arr = el.dataset.c === "cash" ? cash : el.dataset.c === "qris" ? qris : keluar;
      arr[+el.dataset.r] = el.value;
      recalc();
    };
  }

  function fillInputs() {
    document.querySelectorAll("#tblLeft input").forEach((el) => { el.value = rows[+el.dataset.i][el.dataset.k] ?? ""; });
    $("minusVal").value = minusRill;
    document.querySelectorAll("#tblRight input").forEach((el) => {
      const arr = el.dataset.c === "cash" ? cash : el.dataset.c === "qris" ? qris : keluar;
      el.value = arr[+el.dataset.r] ?? "";
    });
  }

  function refreshRekap() { buildLeft(); fillInputs(); recalc(); }

  // ---------- hitung ----------
  // Total = Jumlah + Masuk - Keluar - KDS/TPH
  // Total Terjual = Total - Sisa Stok (manual)
  // Total Terjual (Uang) = Total Terjual x Harga Produk
  // Lebih/Minus Rill = Cash + QRIS + Pengeluaran - Total Terjual (Uang)
  function compute() {
    const calc = rows.map((r) => {
      const total = num(r.jumlah) + num(r.masuk) - num(r.keluar) - num(r.kds);
      const terjual = total - num(r.sisa);
      return { total, terjual, uang: terjual * num(r.price) };
    });
    const sum = (a) => a.reduce((s, v) => s + num(v), 0);
    const totalUang = calc.reduce((s, r) => s + r.uang, 0);
    const sCash = sum(cash), sQris = sum(qris), sKeluar = sum(keluar);
    const sebelum = sCash + sQris;
    const sesudah = sebelum - sKeluar;
    const selisih = sebelum + sKeluar - totalUang;
    return { calc, totalUang, sCash, sQris, sKeluar, sebelum, sesudah, selisih };
  }

  function recalc() {
    const c = compute();
    let fj = 0, fm = 0, fk = 0, fd = 0, ft = 0, fter = 0, fs = 0, fh = 0;
    c.calc.forEach((r, i) => {
      $("tot" + i).textContent = r.total;
      $("ter" + i).textContent = r.terjual;
      $("hrg" + i).textContent = rp(rows[i].price);
      $("uang" + i).textContent = rp(r.uang);
      fj += num(rows[i].jumlah); fm += num(rows[i].masuk); fk += num(rows[i].keluar); fd += num(rows[i].kds);
      fs += num(rows[i].sisa); fh += num(rows[i].price);
      ft += r.total; fter += r.terjual;
    });
    $("fJumlah").textContent = fj; $("fMasuk").textContent = fm; $("fKeluar").textContent = fk; $("fKds").textContent = fd;
    $("fTotal").textContent = ft; $("fTerjual").textContent = fter; $("fSisa").textContent = fs;
    $("fHarga").textContent = rp(fh);
    $("fUang").textContent = rp(c.totalUang);

    $("sCash").textContent = rp(c.sCash);
    $("sQris").textContent = rp(c.sQris);
    $("sKeluar").textContent = rp(c.sKeluar);
    $("tSebelum").textContent = rp(c.sebelum);
    $("tSesudah").textContent = rp(c.sesudah);

    $("tSelisih").textContent = rp(Math.abs(c.selisih));
    $("selLbl").textContent = c.selisih === 0 ? "PAS" : c.selisih > 0 ? "LEBIH" : "MINUS";
    $("selLbl").className = "ta-lbl" + (c.selisih < 0 ? " minus-c" : "");
    $("tSelisih").className = "ta-val" + (c.selisih >= 0 ? " ok" : "");
    $("tSesudah").className = "ta-val" + (c.sesudah > 0 ? " ok" : "");
  }

  // ---------- supabase ----------
  function initSupabase() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("GANTI") || !window.supabase) return false;
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return true;
  }

  async function fetchProducts() {
    if (!sb) return;
    const { data, error } = await sb.from("products").select("*").order("sort", { ascending: true }).order("id", { ascending: true });
    if (error) { toast("Gagal memuat produk: " + errMsg(error), true); return; }
    products = (data || []).map((p) => ({ id: p.id, name: p.name, price: p.price, sort: p.sort }));
  }

  async function lastSavedDate() {
    const { data, error } = await sb.from("daily_reports").select("tanggal").order("tanggal", { ascending: false }).limit(1);
    if (error) toast("Gagal memuat tanggal: " + errMsg(error), true);
    return data && data.length ? data[0].tanggal : null;
  }

  async function loadDate(tgl) {
    busy = true;
    $("status").textContent = "Memuat...";
    emptyState();
    isSaved = false;
    try {
      const { data, error } = await sb.from("daily_reports").select("*").eq("tanggal", tgl).maybeSingle();
      if (error) throw error;
      if (data) {
        isSaved = true;
        const saved = data.items || [];
        const used = new Set();
        rows = products.map((p) => {
          const r = findItem(saved, p);
          if (!r) return blankRow(p);
          used.add(r);
          return { pid: p.id, name: p.name, price: r.price ?? p.price, ...valuesFrom(r) };
        });
        // produk yang sudah dihapus tapi ada di data tanggal ini tetap ditampilkan
        saved.forEach((r) => {
          if (!used.has(r)) rows.push({ pid: r.pid ?? null, name: r.name, price: r.price ?? 0, ...valuesFrom(r) });
        });
        cash = padArr(data.cash); qris = padArr(data.qris); keluar = padArr(data.pengeluaran);
        minusRill = data.minus_rill ?? "";
      } else {
        // hari baru: Jumlah otomatis = sisa stok hari sebelumnya (masih bisa diedit)
        const { data: prev } = await sb.from("daily_reports").select("items").lt("tanggal", tgl).order("tanggal", { ascending: false }).limit(1);
        if (prev && prev.length) {
          rows = products.map((p) => {
            const r = findItem(prev[0].items, p);
            const row = blankRow(p);
            if (r && r.sisa !== undefined && r.sisa !== null) row.jumlah = r.sisa;
            return row;
          });
        }
      }
    } catch (e) {
      toast("Gagal memuat: " + errMsg(e), true);
    }
    productsDirty = false;
    refreshRekap();
    const b = $("badge");
    b.textContent = isSaved ? "sudah tersimpan" : "baru";
    b.className = "badge" + (isSaved ? " saved" : "");
    $("status").textContent = "";
    busy = false;
  }

  // gabungkan perubahan daftar produk ke form yang sedang dibuka (isian tidak hilang)
  function syncProductsIntoRows() {
    const merged = products.map((p) => {
      const ex = rows.find((r) => r.pid === p.id);
      if (!ex) return blankRow(p);
      return { ...ex, name: p.name, price: isSaved ? ex.price : p.price };
    });
    if (isSaved) rows.forEach((r) => { if (!products.some((p) => p.id === r.pid)) merged.push(r); });
    rows = merged;
    productsDirty = false;
    refreshRekap();
  }

  async function submit() {
    if (busy) return;
    const tgl = $("tanggal").value;
    if (!tgl) return toast("Pilih tanggal dulu", true);
    const c = compute();
    const payload = {
      tanggal: tgl,
      items: rows.map((r, i) => ({
        pid: r.pid, name: r.name, price: num(r.price),
        jumlah: num(r.jumlah), masuk: num(r.masuk), keluar: num(r.keluar), kds: num(r.kds),
        total: c.calc[i].total, terjual: c.calc[i].terjual, sisa: num(r.sisa), uang: c.calc[i].uang
      })),
      cash: cash.map(num).filter((v) => v), qris: qris.map(num).filter((v) => v), pengeluaran: keluar.map(num).filter((v) => v),
      total_terjual_uang: c.totalUang, total_cash: c.sCash, total_qris: c.sQris,
      total_pengeluaran: c.sKeluar, selisih: c.selisih,
      minus_rill: minusRill === "" ? null : num(minusRill), updated_at: new Date().toISOString()
    };
    busy = true;
    $("btnSubmit").disabled = true;
    $("status").textContent = "Menyimpan...";
    const { error } = await sb.from("daily_reports").upsert(payload, { onConflict: "tanggal" });
    $("btnSubmit").disabled = false;
    busy = false;
    $("status").textContent = "";
    if (error) return toast("Gagal menyimpan: " + errMsg(error), true);
    const next = addDay(tgl, 1);
    toast("Tersimpan untuk " + tgl + ". Pindah ke " + next);
    $("tanggal").value = next;
    await loadDate(next);
  }

  // ---------- menu produk ----------
  function renderProducts() {
    const tb = document.querySelector("#tblProduk tbody");
    tb.innerHTML = "";
    if (!products.length) {
      tb.innerHTML = `<tr><td colspan="4" style="padding:14px;text-align:center">Belum ada produk. Tambahkan di atas.</td></tr>`;
      return;
    }
    products.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.dataset.id = p.id;
      tr.innerHTML =
        `<td class="n">${i + 1}</td>` +
        `<td><input type="text" class="pn" value="${esc(p.name)}"></td>` +
        `<td><input type="number" class="pp" inputmode="numeric" min="0" step="500" value="${p.price}"></td>` +
        `<td class="a"><button class="sm" data-act="save" type="button">Simpan</button> <button class="sm del" data-act="del" type="button">Hapus</button></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll("input").forEach(fitInput);
  }

  // lebar kotak isian mengikuti panjang isinya
  function fitInput(el) {
    const n = Math.max(String(el.value).length, 4);
    el.style.width = (n + 3) + "ch";
  }

  async function afterProductChange() {
    await fetchProducts();
    renderProducts();
    productsDirty = true;
  }

  // pesan error yang mudah dipahami + petunjuk perbaikan
  function errMsg(e) {
    const m = (e && e.message) || String(e);
    const code = (e && e.code) || "";
    if (code === "42501" || /permission denied/i.test(m))
      return "Izin database belum aktif. Jalankan file supabase.sql di Supabase SQL Editor (aman diulang), lalu coba lagi.";
    if (code === "PGRST204" || /minus_rill|schema cache/i.test(m))
      return "Struktur database belum lengkap. Jalankan file supabase.sql di Supabase SQL Editor, lalu coba lagi.";
    if (code === "23505") return "Nama produk sudah ada";
    if (/failed to fetch|networkerror|load failed/i.test(m))
      return "Tidak bisa terhubung ke Supabase. Periksa koneksi internet.";
    return m;
  }
  const dupMsg = errMsg;

  async function addProduct() {
    const name = $("pNama").value.trim().toUpperCase();
    const price = parseInt($("pHarga").value, 10);
    if (!name) return toast("Nama produk wajib diisi", true);
    if (isNaN(price) || price < 0) return toast("Harga jual wajib diisi", true);
    const sort = products.reduce((m, p) => Math.max(m, p.sort || 0), 0) + 1;
    const { error } = await sb.from("products").insert({ name, price, sort });
    if (error) return toast("Gagal menambah: " + dupMsg(error), true);
    $("pNama").value = ""; $("pHarga").value = "";
    $("pNama").focus();
    await afterProductChange();
    toast("Produk " + name + " ditambahkan");
  }

  async function onProductClick(e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (!sb) return toast("Supabase belum dikonfigurasi (config.js)", true);
    const tr = btn.closest("tr");
    const id = Number(tr.dataset.id);
    const RLS_HINT = "Tidak ada data yang berubah. Jalankan file supabase.sql di Supabase SQL Editor (aman diulang), lalu coba lagi.";

    if (btn.dataset.act === "save") {
      const name = tr.querySelector(".pn").value.trim().toUpperCase();
      const price = parseInt(tr.querySelector(".pp").value, 10);
      if (!name || isNaN(price) || price < 0) return toast("Nama dan harga harus diisi", true);
      btn.disabled = true;
      const { data, error } = await sb.from("products").update({ name, price }).eq("id", id).select();
      btn.disabled = false;
      if (error) return toast("Gagal menyimpan: " + dupMsg(error), true);
      if (!data || !data.length) return toast(RLS_HINT, true);
      await afterProductChange();
      toast("Produk diperbarui");
    } else {
      // konfirmasi di halaman (dialog bawaan browser sering diblokir di aplikasi terpasang)
      if (btn.dataset.confirm !== "1") {
        btn.dataset.confirm = "1";
        btn.textContent = "Yakin hapus?";
        clearTimeout(btn._t);
        btn._t = setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "Hapus"; }, 4000);
        return;
      }
      clearTimeout(btn._t);
      btn.disabled = true;
      btn.textContent = "Menghapus...";
      const { data, error } = await sb.from("products").delete().eq("id", id).select();
      if (error) {
        btn.disabled = false; btn.dataset.confirm = ""; btn.textContent = "Hapus";
        return toast("Gagal menghapus: " + errMsg(error), true);
      }
      if (!data || !data.length) {
        btn.disabled = false; btn.dataset.confirm = ""; btn.textContent = "Hapus";
        return toast(RLS_HINT, true);
      }
      await afterProductChange();
      toast("Produk dihapus. Data rekap tanggal lama tetap tersimpan.");
    }
  }

  // ---------- tab ----------
  function showTab(name) {
    const rekap = name === "rekap";
    $("viewRekap").hidden = !rekap;
    $("viewProduk").hidden = rekap;
    $("tabRekap").classList.toggle("active", rekap);
    $("tabProduk").classList.toggle("active", !rekap);
    if (rekap && productsDirty) syncProductsIntoRows();
  }

  // ---------- PWA (install di semua perangkat) ----------
  let deferredPrompt = null;
  function setupPWA() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $("btnInstall").hidden = false;
    });
    $("btnInstall").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $("btnInstall").hidden = true;
    });
    window.addEventListener("appinstalled", () => { $("btnInstall").hidden = true; });
    window.addEventListener("offline", () => toast("Tidak ada internet. Data belum bisa disimpan.", true));
    window.addEventListener("online", () => toast("Kembali online"));
  }

  // ---------- start ----------
  async function start() {
    setupPWA();
    buildRight();
    $("tabRekap").addEventListener("click", () => showTab("rekap"));
    $("tabProduk").addEventListener("click", () => showTab("produk"));
    $("tanggal").value = todayStr();
    emptyState();
    refreshRekap();
    renderProducts();

    if (!initSupabase()) {
      $("btnSubmit").disabled = true;
      $("btnAddProduk").disabled = true;
      $("status").textContent = "Isi SUPABASE_URL & SUPABASE_ANON_KEY di config.js";
      toast("Supabase belum dikonfigurasi (config.js)", true);
      return;
    }
    await fetchProducts();
    renderProducts();
    const last = await lastSavedDate();
    const tgl = last ? addDay(last, 1) : todayStr();
    $("tanggal").value = tgl;
    await loadDate(tgl);

    $("tanggal").addEventListener("change", () => $("tanggal").value && loadDate($("tanggal").value));
    $("minusVal").addEventListener("input", (e) => { minusRill = e.target.value; });
    $("btnSubmit").addEventListener("click", submit);
    $("btnReset").addEventListener("click", () => { emptyState(); isSaved = false; refreshRekap(); });
    $("btnPrice").addEventListener("click", () => {
      rows.forEach((r) => { const p = products.find((x) => x.id === r.pid); if (p) r.price = p.price; });
      recalc();
      toast("Harga diperbarui ke harga terbaru");
    });
    $("btnAddProduk").addEventListener("click", addProduct);
    $("pHarga").addEventListener("keydown", (e) => { if (e.key === "Enter") addProduct(); });
    document.querySelector("#tblProduk tbody").addEventListener("click", onProductClick);
    document.querySelector("#tblProduk tbody").addEventListener("input", (e) => fitInput(e.target));
  }
  start();
})();
