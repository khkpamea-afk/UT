// รับออเดอร์จากหน้าเว็บ แล้วส่งข้อความเข้าไลน์ผู้ขาย (จำกัดคิวที่ค้างอยู่ไม่เกิน MAX)
// รัน: LINE_TOKEN=xxx LINE_SECRET=xxx SELLER_ID=Uxxxx node server.js   (Node 18 ขึ้นไป)
// ผู้ขายตอบในไลน์ว่า "เสร็จ Q03" เพื่อปล่อยคิว, "เสร็จ" = ปล่อยคิวแรกสุด, "ล้างคิว" = ปล่อยทั้งหมด
const http = require("http"), crypto = require("crypto");
const { LINE_TOKEN, LINE_SECRET, SELLER_ID, PORT = 3000 } = process.env; // SELLER_ID = userId หรือ groupId
const MAX = 5;
let seq = 0, day = new Date().toDateString(), active = []; // active = เลขคิวที่ยังไม่เสร็จ

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
const json = (res, code, obj) => res.writeHead(code, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(obj));
const rollover = () => { if (day !== new Date().toDateString()) { day = new Date().toDateString(); seq = 0; active = []; } };
const line = (path, payload) => fetch("https://api.line.me/v2/bot/message/" + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + LINE_TOKEN },
  body: JSON.stringify(payload),
});
const readBody = async (req) => { let b = ""; for await (const c of req) { b += c; if (b.length > 20000) throw new Error("too big"); } return b; };

http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    rollover();

    if (req.method === "GET" && req.url === "/status") return json(res, 200, { n: active.length, max: MAX });

    if (req.method === "POST" && req.url === "/order") {
      const o = JSON.parse(await readBody(req));
      if (!Array.isArray(o.items) || !o.items.length) return json(res, 400, {});
      if (active.length >= MAX) return json(res, 409, { n: active.length, max: MAX });
      const q = "Q" + String(++seq).padStart(2, "0");
      active.push(q);
      const text = `ออเดอร์ใหม่ ${q} (คิวตอนนี้ ${active.length}/${MAX})\nชื่อ: ${String(o.name).slice(0, 30)}\n` +
        o.items.map(i => `• ${String(i.n).slice(0, 40)} ×${Number(i.qty)}`).join("\n") +
        (o.note ? `\nหมายเหตุ: ${String(o.note).slice(0, 80)}` : "") +
        `\nรวม ${Number(o.total)} บาท\n(ทำเสร็จแล้วตอบ "เสร็จ ${q}")`;
      const r = await line("push", { to: SELLER_ID, messages: [{ type: "text", text }] });
      if (!r.ok) { active.pop(); seq--; throw new Error("LINE " + r.status + " " + (await r.text())); }
      return json(res, 200, { q, n: active.length });
    }

    if (req.method === "POST" && req.url === "/webhook") {
      const raw = await readBody(req);
      const sig = crypto.createHmac("sha256", LINE_SECRET).update(raw).digest("base64");
      if (sig !== req.headers["x-line-signature"]) return res.writeHead(401).end();
      res.writeHead(200).end(); // ตอบ LINE ก่อน แล้วค่อยประมวลผล
      for (const e of JSON.parse(raw).events) {
        const s = e.source || {};
        console.log("รหัสผู้ส่ง (ใช้เป็น SELLER_ID):", s.groupId || s.roomId || s.userId);
        if (e.type !== "message" || e.message.type !== "text" || (s.groupId || s.roomId || s.userId) !== SELLER_ID) continue;
        const t = e.message.text.trim(); let reply = null;
        if (t === "ล้างคิว") { active = []; reply = "ล้างคิวแล้ว 0/" + MAX; }
        else if (/^เสร็จ/.test(t)) {
          const m = t.match(/(\d+)/), id = m ? "Q" + String(m[1]).padStart(2, "0") : active[0];
          if (id && active.includes(id)) { active = active.filter(x => x !== id); reply = `ปิด ${id} แล้ว คิวตอนนี้ ${active.length}/${MAX}`; }
          else reply = "ไม่พบคิวนี้ในรายการที่ค้างอยู่";
        }
        if (reply) await line("reply", { replyToken: e.replyToken, messages: [{ type: "text", text: reply }] });
      }
      return;
    }
    res.writeHead(404, cors).end();
  } catch (e) { console.error(e.message); if (!res.headersSent) res.writeHead(500, cors).end(); }
}).listen(PORT, () => console.log("พร้อมรับออเดอร์ที่พอร์ต " + PORT));
