-- Khusus jika Anda SUDAH menjalankan supabase.sql versi sebelumnya.
-- Jalankan sekali di Supabase SQL Editor agar Menu Produk bisa tambah / ubah / hapus produk.

-- Kolom untuk isian manual "MINUS RILL"
alter table public.daily_reports add column if not exists minus_rill numeric;

drop policy if exists "products insert" on public.products;
drop policy if exists "products update" on public.products;
drop policy if exists "products delete" on public.products;

create policy "products insert" on public.products for insert to anon with check (true);
create policy "products update" on public.products for update to anon using (true) with check (true);
create policy "products delete" on public.products for delete to anon using (true);
