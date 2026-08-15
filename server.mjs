import express from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

dotenv.config();
const app=express(), PORT=process.env.PORT||3000, DATA=path.join(process.cwd(),"data");
fs.mkdirSync(DATA,{recursive:true});
const db=new Database(path.join(DATA,"elite-ai.sqlite")); db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS applications(
id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE NOT NULL,
name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, course TEXT, level TEXT,
message TEXT, status TEXT NOT NULL DEFAULT 'NEW', created_at TEXT NOT NULL)`);

const ai=process.env.OPENAI_API_KEY?new OpenAI({apiKey:process.env.OPENAI_API_KEY}):null;
const sessions=new Map();
const statuses=["NEW","CONTACTED","INTERESTED","APPLIED","ENROLLED"];

const info=`You are Elite AI, the official virtual assistant for Elite Technical Training Institute.
Location: Wiyumiririe Town, Laikipia, Kenya, along the Nyeri-Nyahururu Highway.
Phone: +254 714 567 192.
Courses: Hair Dressing; Nail Technology; Beauty Therapy; Barbering; Food and Beverage Production (Culinary Arts); Food and Beverage Service; Cake Baking & Deco and Pastry; House Keeping and Accommodation; Front Office Operations; Hotel and Restaurant Management; Event Management; Computer Studies; Information Communication Technology; Computer Networking; Web Design and Development; Graphics Design and Multimedia; Computer Repair and Maintenance; Video Recording Editing and Production; Photography; Film and Media Production.
Duration: Short courses 3-4 months; Certificate 6-12 months; Diploma 2 years.
Admission: ID and academic certificates.
Never invent fees, accreditation, intake dates, grades, exam bodies or other unavailable facts. If unavailable, direct the student to +254 714 567 192.
Be friendly, concise and helpful. Recommend only courses in this list.`;

app.use(express.json({limit:"30kb"})); app.use(express.static("public"));
const limiter=rateLimit({windowMs:60000,limit:30,standardHeaders:"draft-8",legacyHeaders:false});
const sessionsLimiter=rateLimit({windowMs:60000,limit:10,standardHeaders:"draft-8",legacyHeaders:false});
const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
const newToken=()=>crypto.randomBytes(32).toString("hex");
function auth(req,res,next){const t=req.headers.authorization?.replace("Bearer ","");if(!t||!sessions.has(t))return res.status(401).json({error:"Unauthorized"});req.sid=t;next();}
function ref(){return "ETTI-"+new Date().getFullYear()+"-"+crypto.randomBytes(3).toString("hex").toUpperCase();}

app.post("/api/chat",limiter,async(req,res)=>{
 try{const message=clean(req.body?.message,2500);if(!message)return res.status(400).json({error:"Message is required."});
 if(!ai)return res.status(503).json({error:"AI service is not configured."});
 const r=await ai.responses.create({model:"gpt-5.6",instructions:info,input:message});
 res.json({reply:r.output_text});
 }catch(e){console.error(e);res.status(500).json({error:"Elite AI is temporarily unavailable. Call +254 714 567 192."});}
});

app.post("/api/applications",limiter,(req,res)=>{
 const name=clean(req.body?.name,100),phone=clean(req.body?.phone,50);
 if(!name||!phone)return res.status(400).json({error:"Name and phone are required."});
 let reference; do{reference=ref()}while(db.prepare("SELECT 1 FROM applications WHERE reference=?").get(reference));
 db.prepare(`INSERT INTO applications(reference,name,phone,email,course,level,message,created_at)
 VALUES(?,?,?,?,?,?,?,?)`).run(reference,name,phone,clean(req.body?.email,120),clean(req.body?.course,150),
 clean(req.body?.level,50),clean(req.body?.message,700),new Date().toISOString());
 res.json({success:true,reference,message:`Application enquiry received. Your reference is ${reference}.`});
});

app.get("/api/application/:reference",(req,res)=>{
 const row=db.prepare("SELECT reference,name,course,level,status,created_at FROM applications WHERE reference=?").get(clean(req.params.reference,40).toUpperCase());
 if(!row)return res.status(404).json({error:"Application not found."});res.json(row);
});

app.post("/api/admin/login",sessionsLimiter,(req,res)=>{
 if(clean(req.body?.username,100)!==process.env.ADMIN_USERNAME||clean(req.body?.password,200)!==process.env.ADMIN_PASSWORD)
 return res.status(401).json({error:"Invalid username or password."});
 const t=newToken();sessions.set(t,{username:process.env.ADMIN_USERNAME,created:Date.now()});res.json({token:t});
});
app.post("/api/admin/logout",auth,(req,res)=>{sessions.delete(req.sid);res.json({success:true});});
app.get("/api/admin/applications",auth,(req,res)=>{
 const q=clean(req.query?.q,100), status=clean(req.query?.status,30).toUpperCase();
 let sql="SELECT * FROM applications WHERE 1=1", params=[];
 if(q){sql+=" AND (name LIKE ? OR phone LIKE ? OR reference LIKE ? OR course LIKE ?)";const x="%"+q+"%";params.push(x,x,x,x);}
 if(status&&statuses.includes(status)){sql+=" AND status=?";params.push(status);}
 sql+=" ORDER BY id DESC";res.json({applications:db.prepare(sql).all(...params)});
});
app.patch("/api/admin/applications/:id",auth,(req,res)=>{
 const s=clean(req.body?.status,20).toUpperCase();if(!statuses.includes(s))return res.status(400).json({error:"Invalid status"});
 const r=db.prepare("UPDATE applications SET status=? WHERE id=?").run(s,Number(req.params.id));
 if(!r.changes)return res.status(404).json({error:"Application not found."});res.json({success:true});
});
app.get("/api/admin/stats",auth,(req,res)=>{
 const total=db.prepare("SELECT COUNT(*) n FROM applications").get().n;
 const groups=db.prepare("SELECT status,COUNT(*) n FROM applications GROUP BY status").all();
 res.json({total,byStatus:Object.fromEntries(groups.map(x=>[x.status,x.n]))});
});
app.get("/api/admin/export.csv",auth,(req,res)=>{
 const rows=db.prepare("SELECT reference,name,phone,email,course,level,status,message,created_at FROM applications ORDER BY id DESC").all();
 const esc=x=>`"${String(x??"").replaceAll('"','""')}"`;
 const csv=["Reference,Name,Phone,Email,Course,Level,Status,Message,Created"].concat(rows.map(r=>Object.values(r).map(esc).join(","))).join("\n");
 res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",'attachment; filename="elite-ai-applications.csv"');res.send(csv);
});
app.get("/api/health",(_,res)=>res.json({ok:true,service:"Elite AI v3"}));
app.listen(PORT,()=>console.log(`Elite AI v3: http://localhost:${PORT}`));
