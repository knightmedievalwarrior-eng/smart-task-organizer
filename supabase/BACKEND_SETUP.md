# คู่มือติดตั้ง Backend ของ Stepwise Command Center

เอกสารนี้อธิบาย backend ที่เพิ่มให้โปรเจกต์นี้ และขั้นตอนนำขึ้น Supabase จริง **โค้ดในรีโพยังไม่ได้ถูก deploy หรือแก้ฐานข้อมูลบน cloud** ต้องทำตามขั้นตอนนี้กับโปรเจกต์ Supabase ที่คุณเป็นเจ้าของก่อนใช้งานจริง

## สิ่งที่เพิ่ม

- Supabase migrations สองไฟล์: baseline สำหรับโปรเจกต์ใหม่ และ security hardening สำหรับโปรเจกต์เดิม
- สร้าง/อัปเดต `user_profiles` เมื่อสมัครบัญชี, เครดิตฟรี 250 หน่วยต่อวัน, Pro trial 14 วัน, Pro allowance 25,000 ต่อเดือน และ pack credits
- `my_credits()` และ `spend_credits()` คงรูปแบบผลลัพธ์ที่ UI ใช้อยู่เดิม โดยการหักเครดิตทำ transaction เดียว มี row lock ป้องกัน concurrent overspend และ `_request_id` ทำให้ retry ของงานเดียวกันไม่หักซ้ำ
- `subscriptions`, `credits_ledger` และ `task_logs` เก็บ metadata เท่านั้น; RLS จำกัดแถวตาม `auth.uid()`; client แก้ยอดเครดิต/สมาชิกเองไม่ได้
- Supabase Auth password + Magic Link ใช้ email verification จาก Supabase Auth; trigger สร้าง profile อัตโนมัติ
- GitHub OAuth ใช้ callback ฝั่ง Edge Function, `state` แบบสุ่มและใช้ได้ครั้งเดียว; token ถูกเข้ารหัส AES-GCM ก่อนลงฐานข้อมูล และไม่ส่ง token กลับ browser
- สร้าง private repository ให้ผู้ใช้แบบอัตโนมัติเมื่อสำรองครั้งแรก; browser เข้ารหัสข้อมูลด้วย passphrase ก่อนส่ง และแยกไฟล์ ciphertext ต่อ UUID
- soft-delete tombstones เก็บเฉพาะ UUID/เวลา และ Edge Function ลบไฟล์ GitHub หลัง 30 วัน

## ข้อมูลส่วนตัวและขอบเขตความเป็นส่วนตัว

เนื้อหา Excel/CSV ไม่ถูกบันทึกลง Postgres หรือส่งไป Edge Function แบบ plaintext โดยระบบสำรองชุดใหม่เข้ารหัสบน browser ด้วย PBKDF2-SHA-256 (310,000 iterations) และ AES-256-GCM ก่อน upload; backend เห็นเพียง ciphertext, UUID ที่ได้จาก hash, สถานะเชื่อมต่อ และ metadata การคิดเครดิต ผู้ใช้ต้องเก็บ passphrase สำรองไว้เอง—ถ้าหาย ระบบกู้ข้อมูลไม่ได้

GitHub OAuth App ใช้ scope `repo read:user` ซึ่งเป็น scope กว้างและให้ GitHub token มีสิทธิ์กับ repo ส่วนตัวของผู้ใช้ ควรพิจารณา GitHub App แบบจำกัด repository สำหรับ production ขั้นสูง หากใช้ OAuth App ให้ชี้แจง scope และขอ consent จากผู้ใช้ให้ชัดเจน

ระบบ task scheduler ปัจจุบันยังรันเฉพาะขณะที่แอปเปิดอยู่ เพราะ task payload และไฟล์อยู่ใน browser ตาม zero-knowledge policy การรันงาน Excel/CSV ขณะปิด browser โดยให้ server อ่านข้อมูลไม่ได้เป็นข้อกำหนดที่ขัดกัน จึง **ไม่ส่ง task payload ไปทำงานบน server** หากต้องการ background execution จริง ต้องออกแบบ opt-in ที่แยกต่างหาก (เช่น ciphertext, กุญแจที่ผู้ใช้มอบหมาย และ execution worker ที่มีมาตรการยินยอม/ลบข้อมูล) ไม่ควรเปิดใช้โดยปริยาย

## ติดตั้ง Supabase

1. ติดตั้ง Supabase CLI และเชื่อม CLI เข้ากับบัญชีของคุณ จากโฟลเดอร์โปรเจกต์รัน:

   ```bash
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push
   ```

   ตรวจสอบ project ref ให้ตรงกับโปรเจกต์เป้าหมายก่อนกด deploy ฐานข้อมูล

2. ตั้ง Supabase Auth ใน Dashboard:
   - เปิด Email provider และ `Confirm email`
   - ตั้ง Site URL เป็น URL จริงของแอป
   - เพิ่ม URL จริงและ preview URLs ที่อนุญาตใน Redirect URLs
   - ตั้ง SMTP ที่เชื่อถือได้สำหรับส่ง verification และ Magic Link ใน production
   - สมัครด้วย email/password และ Magic Link มีหน้า UI แล้ว แต่การยืนยันอีเมลยังขึ้นกับ Supabase Auth settings/SMTP

3. สร้าง GitHub OAuth App ใน GitHub Developer Settings:
   - Authorization callback URL: `https://<PROJECT_REF>.supabase.co/functions/v1/github-oauth-callback`
   - คัดลอก Client ID และ Client Secret เก็บเป็น Supabase secrets เท่านั้น

4. ตั้ง Edge Function secrets โดยแทนค่าทุก placeholder:

   ```bash
   supabase secrets set \
     APP_ORIGIN="https://<APP_DOMAIN>" \
     GITHUB_APP_REDIRECT_URL="https://<APP_DOMAIN>/" \
     GITHUB_REDIRECT_URI="https://<PROJECT_REF>.supabase.co/functions/v1/github-oauth-callback" \
     GITHUB_CLIENT_ID="<OAUTH_CLIENT_ID>" \
     GITHUB_CLIENT_SECRET="<OAUTH_CLIENT_SECRET>" \
     GITHUB_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
     GITHUB_PURGE_SECRET="$(openssl rand -hex 32)"
   ```

   `GITHUB_TOKEN_ENCRYPTION_KEY` ต้องเป็น base64 ของ random 32 bytes อย่าสร้างใหม่หลัง deploy เว้นแต่ทำ token re-encryption/migration ก่อน ไม่เช่นนั้น token เก่าจะถอดรหัสไม่ได้ เก็บสำเนา key ใน secret manager ที่องค์กรควบคุมและจำกัดผู้เข้าถึง

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` เป็น environment ของ Supabase Edge Functions ตามปกติ ห้ามเผย service-role key ใน client, log, repo หรือ CI output

5. Deploy functions:

   ```bash
   for fn in github-oauth-start github-oauth-callback github-create-private-repo \
     github-sync-encrypted-records github-list-encrypted-records github-status \
     github-set-record-trash github-purge-expired; do
     supabase functions deploy "$fn"
   done
   ```

   ถ้า `APP_ORIGIN` มีหลาย origin ให้ใส่รายการคั่นด้วย comma โดยไม่ใส่ wildcard

6. ตั้ง schedule สำหรับ `github-purge-expired` ใน Supabase Dashboard → Edge Functions → Schedules (หรือ cron runner ที่องค์กรดูแล): เรียก `POST /functions/v1/github-purge-expired` วันละครั้ง และส่ง header `x-purge-secret: <ค่าเดียวกับ GITHUB_PURGE_SECRET>` ห้ามเรียก function นี้จาก browser; function ไม่ใช้ JWT แต่ตรวจ secret แบบ constant-time ก่อนทำงาน แต่ละครั้งลบได้สูงสุด 100 records แล้วค่อยทำต่อรอบถัดไป

## สัญญา API สำหรับ frontend

แอปมี UI เชื่อม GitHub OAuth และ client-side encryption ผ่าน `src/lib/github-vault.ts` แล้ว Edge Functions ต่อไปนี้ใช้ Supabase session ของผู้ใช้:

- `github-oauth-start`: เริ่ม OAuth และคืน `authorization_url`
- `github-status`: คืนเฉพาะ connected/login/repository/branch
- `github-create-private-repo`: สร้าง private repo ถ้ายังไม่มี โดยใช้ token ที่ถอดรหัสใน memory ของ Edge Function
- `github-sync-encrypted-records`: รับ `{ records: [{ id, ciphertext }] }`; 1–20 records ต่อ request; UUID และ base64 ciphertext เท่านั้น
- `github-list-encrypted-records`: คืน ciphertext files ที่ยังไม่อยู่ใน trash; จำกัด 100 records ต่อการอ่าน
- `github-set-record-trash`: รับ `{ record_ids: [UUID...], state: "trashed" | "restored" }`; สูงสุด 100 UUID ต่อ request

รหัสผ่าน backup ถูกใช้เฉพาะใน browser และไม่เก็บใน localStorage/sessionStorage ระบบเก็บเฉพาะ public KDF salt ใน localStorage หากกู้คืนบนอุปกรณ์ใหม่ ต้องใช้ passphrase เดิมก่อน backup ชุดใหม่ การซิงก์ปัจจุบันเป็นการกดสำรอง/กู้คืนด้วยตนเอง ไม่เก็บ passphrase เพื่อทำ auto-backup

## เครดิต, billing และการปล่อยใช้งานเชิงพาณิชย์

`subscriptions` เป็นตาราง source-of-truth สำหรับ entitlement, `grant_pack_credits()` จำกัดให้ `service_role` และใช้ payment reference แบบ unique เพื่อป้องกัน webhook retry ให้เครดิตซ้ำ แต่ยังไม่มี Stripe/ผู้ให้บริการชำระเงิน webhook เชื่อมอยู่ ต้องเพิ่ม webhook ฝั่ง server ที่ตรวจ signature, ป้องกัน replay และเรียก RPC นี้โดยอ้างอิง transaction id ของผู้ให้บริการก่อนเปิดรับเงินจริง ห้ามให้ client เรียก `grant_pack_credits()` หรือแก้ `subscriptions` โดยตรง

## ตรวจสอบหลัง deploy

- สมัครบัญชีใหม่และยืนยันอีเมล ตรวจว่ามี profile เพียงหนึ่ง row และค่า trial end อยู่ในอนาคต
- เรียก `my_credits()` ใน session ผู้ใช้: `free=250`, `is_pro=true` ระหว่าง trial
- เรียก `spend_credits` พร้อม `_request_id` เดิมสองครั้ง: ledger และยอดต้องลดครั้งเดียว; request id ใหม่จึงคิดเครดิตใหม่
- ยิง `spend_credits` พร้อมกันหลาย request ตรวจว่าไม่มี balance ติดลบ และ request เกินยอดถูกปฏิเสธ
- ยืนยันว่า authenticated user อ่าน profile/credits/logs/subscription ของตนเองได้ แต่เขียน profile, subscription, ledger หรือ GitHub credential ไม่ได้
- เชื่อม GitHub และตรวจว่า repository เป็น private; ตรวจใน Network tab ว่า browser ไม่เคยได้รับ token และ payload สำรองก่อน upload เป็น ciphertext
- ลองกู้คืนด้วย passphrase ผิด/ถูก และลองบน browser profile ใหม่
- สร้าง tombstone ทดสอบแล้วปรับ `deleted_at` ใน environment ทดสอบให้เก่ากว่า 30 วันก่อนรัน purge; อย่าทดสอบ destructive purge กับข้อมูล production

ก่อนเปิดใช้จริงให้ review SQL กับผู้ดูแล Supabase, ตั้ง backup/monitoring, SMTP, payment webhook, rate limit และ incident procedure โดยเฉพาะการหมุน encryption key และการเพิกถอน GitHub OAuth token
