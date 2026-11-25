// Supabase Edge Function ชื่อ "api"
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("LINE_TOKEN")!, SECRET = Deno.env.get("LINE_SECRET")!, PIN = Deno.env.get("ADMIN_PIN");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-pin", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const json = (c: number, o: unknown) => new Response(JSON.stringify(o), { status: c, headers: { ...cors, "Content-Type": "application/json" } });
const line = (p: string, b: unknown) => fetch("https://api.line.me/v2/bot/message/" + p, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN }, body: JSON.stringify(b) });
const bkk = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
const ACT = ["waiting", "accepted"];
const txt = (t: string) => ({ type: "text", text: t });
const flex = (title: string, lines: string[], btn?: { label: string; data: string }) => ({
  type: "flex", altText: title, contents: { type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: [
      { type: "text", text: title, weight: "bold", size: "lg", wrap: true },
      ...lines.map((t) => ({ type: "text", text: t, wrap: true }))] },
    ...(btn ? { footer: { type: "box", layout: "vertical", contents: [
      { type: "button", style: "primary", action: { type: "postback", label: btn.label, data: btn.data } }] } } : {}) } });
const qs = async (shop: string) => {
  const { data, error } = await db.rpc("queue_status", { p_shop: shop });
  if (error) throw error;
  return data;
};
async function sign(raw: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)))));
}
async function finish(shop: string, q: string | null) {
  const base = () => db.from("orders").update({ status: "done" }).eq("shop_id", shop).eq("day", bkk()).in("status", ACT);
  if (q === "all") return (await base().select("id")).data ?? [];
  if (q) return (await base().eq("q", q).select("id")).data ?? [];
  const { data: o } = await db.from("orders").select("id").eq("shop_id", shop).eq("day", bkk()).in("status", ACT).order("seq").limit(1);
  return o?.length ? (await db.from("orders").update({ status: "done" }).eq("id", o[0].id).select("id")).data ?? [] : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url), path = url.pathname;
  let authed = false;
  try {
    if (req.method === "GET" && path.endsWith("/status")) return json(200, await qs(url.searchParams.get("shop") ?? "nongpp"));

    if (req.method === "GET" && path.endsWith("/track")) {
      const t = url.searchParams.get("t") ?? "";
      if (!/^[0-9a-f-]{36}$/.test(t)) return json(404, {});
      const { data } = await db.from("orders").select("status,q").eq("token", t).maybeSingle();
      return data ? json(200, data) : json(404, {});
    }

    if (path.includes("/admin/")) {
      if (!PIN || req.headers.get("x-pin") !== PIN) return json(401, {});
      authed = true;
      if (req.method === "GET" && path.endsWith("/orders")) {
        const { data, error } = await db.from("orders").select("id,shop_id,day,q,customer,note,items_text,total,status,created_at")
          .eq("day", url.searchParams.get("date") ?? bkk()).order("created_at");
        if (error) throw error;
        return json(200, data);
      }
      if (req.method === "POST" && path.endsWith("/update")) {
        const { id, f, v } = await req.json();
        if (!["customer", "note", "items_text", "total", "status"].includes(f)) return json(400, {});
        if (f === "status" && ![...ACT, "done", "cancelled"].includes(v)) return json(400, {});
        const { error } = await db.from("orders").update({ [f]: f === "total" ? Math.max(0, Number(v) || 0) : String(v).slice(0, 300) }).eq("id", id);
        if (error) throw error;
        return json(200, { ok: true });
      }
    }

    if (req.method === "POST" && path.endsWith("/order")) {
      const o: any = await req.json();
      if (!Array.isArray(o.items) || !o.items.length || o.items.length > 30) return json(400, {});
      const shopId = String(o.shop ?? "nongpp");
      const items = o.items.map((i: any) => ({ n: String(i.n).slice(0, 40), qty: Math.min(99, Math.max(1, Number(i.qty) || 1)), p: Math.max(0, Number(i.p) || 0) }));
      const total = items.reduce((s: number, i: any) => s + i.p * i.qty, 0);
      const name = String(o.name ?? "ลูกค้า").slice(0, 30), note = String(o.note ?? "").slice(0, 80);
      const itemsText = items.map((i: any) => `${i.n} ×${i.qty}`).join(", ");
      const { data, error } = await db.rpc("create_order", { p_shop: shopId, p_name: name, p_note: note, p_items: itemsText, p_total: total });
      if (error) throw error;
      if (data.full) return json(409, { n: data.n, max: data.max });
      try {
      const { data: shop, error: shopErr } = await db.from("shops").select("name,seller_id").eq("id", shopId).single();
      if (shopErr) throw shopErr;
      const cancel = () => db.from("orders").update({ status: "cancelled" }).eq("id", data.id);
      if (!shop?.seller_id) { await cancel(); throw new Error("ยังไม่ได้ตั้ง seller_id"); }
      const msg = flex(`ออเดอร์ใหม่ ${data.q}`, [`${shop.name} · คิวตอนนี้ ${data.n}/${data.max}`, `ชื่อ: ${name}`,
        ...items.map((i: any) => `• ${i.n} ×${i.qty}`), ...(note ? [`หมายเหตุ: ${note}`] : []), `รวม ${total} บาท`],
        { label: "รับออเดอร์", data: `a=accept&id=${data.id}` });
      const r = await line("push", { to: shop.seller_id, messages: [msg] });
      if (!r.ok) { await cancel(); throw new Error("LINE " + r.status + " " + (await r.text())); }
      return json(200, { q: data.q, t: data.t, n: data.n });
      } catch (e) { // ถ้าส่งเข้าไลน์พลาดด้วยเหตุใดก็ตาม ให้ยกเลิกออเดอร์นี้ ไม่ปล่อยค้างในคิว
        await db.from("orders").update({ status: "cancelled" }).eq("id", data.id);
        throw e;
      }
    }

    if (req.method === "POST" && path.endsWith("/webhook")) {
      const raw = await req.text();
      if ((await sign(raw)) !== req.headers.get("x-line-signature")) return new Response("bad signature", { status: 401 });
      for (const e of JSON.parse(raw).events ?? []) {
        const s = e.source ?? {}, sid: string = s.groupId ?? s.roomId ?? s.userId;
        const { data: shop } = await db.from("shops").select("id,max_queue").eq("seller_id", sid).maybeSingle();
        let reply: unknown = null;
        if (e.type === "postback" && shop) {
          const P = new URLSearchParams(e.postback.data), id = Number(P.get("id")), a = P.get("a");
          if (a === "accept") {
            const { data: o } = await db.from("orders").update({ status: "accepted" }).eq("id", id).eq("shop_id", shop.id).eq("status", "waiting").select("q").maybeSingle();
            reply = o ? flex(`รับออเดอร์ ${o.q} แล้ว ✅`, ["ลูกค้าเห็นสถานะแล้ว ทำเสร็จแล้วกดปุ่มด้านล่าง"], { label: "ทำเสร็จ", data: `a=done&id=${id}` })
                      : txt("ออเดอร์นี้ถูกรับหรือปิดไปแล้ว");
          } else if (a === "done") {
            const { data: o } = await db.from("orders").update({ status: "done" }).eq("id", id).eq("shop_id", shop.id).eq("status", "accepted").select("q").maybeSingle();
            const st = await qs(shop.id);
            reply = o ? txt(`ทำเสร็จ ${o.q} แล้ว ✅ คิวตอนนี้ ${st.n}/${st.max}`) : txt("ไม่พบออเดอร์นี้ในรายการที่กำลังทำ");
          }
        } else if (e.type === "message" && e.message?.type === "text") {
          const t: string = e.message.text.trim();
          if (!shop) { if (t.toLowerCase() === "id") reply = txt("รหัสของคุณ: " + sid); }
          else if (t === "ล้างคิว") { await finish(shop.id, "all"); reply = txt(`ล้างคิวแล้ว 0/${shop.max_queue}`); }
          else if (t.startsWith("เสร็จ")) {
            const m = t.match(/(\d+)/), q = m ? "Q" + m[1].padStart(2, "0") : null;
            const done = await finish(shop.id, q), st = await qs(shop.id);
            reply = done.length ? txt(`ปิด ${q ?? "คิวแรกสุด"} แล้ว คิวตอนนี้ ${st.n}/${st.max}`) : txt("ไม่พบคิวนี้ในรายการที่ค้างอยู่");
          }
        }
        if (reply) await line("reply", { replyToken: e.replyToken, messages: [reply] });
      }
      return new Response("ok");
    }
    return json(404, {});
  } catch (err: any) { console.error(String(err?.message ?? err)); return json(500, authed ? { error: String(err?.message ?? err) } : {}); }
});
