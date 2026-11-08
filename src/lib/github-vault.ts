import { supabase } from "@/integrations/supabase/client";
import { exportBackup, importBackup, type AppState } from "./session-store";

const SALT_KEY = "gtr.backup.kdf-salt.v1";
const ITERATIONS = 310_000;
const MAX_RECORDS = 100;
const BATCH_SIZE = 20;

type VaultRecord = { id: string; ciphertext: string };
type StoredEnvelope = { version: 1; salt: string; iv: string; data: string };
type Entry = { kind: "task" | "history" | "trash" | "manifest"; item: unknown; originalId: string };

export interface GithubVaultStatus {
  connected: boolean;
  login: string | null;
  repository: string | null;
  branch: string | null;
  connected_at: string | null;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

function base64Text(value: string): string {
  return encodeBase64(new TextEncoder().encode(value));
}

function decodeText(value: string): string {
  return new TextDecoder().decode(decodeBase64(value));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: bufferSource(salt), iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function stableRecordId(
  userId: string,
  kind: Entry["kind"],
  originalId: string,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`stepwise-v1:${userId}:${kind}:${originalId}`),
    ),
  );
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function currentSalt(): Uint8Array | null {
  try {
    const stored = window.localStorage.getItem(SALT_KEY);
    return stored ? decodeBase64(stored) : null;
  } catch {
    return null;
  }
}

function saveSalt(salt: Uint8Array) {
  window.localStorage.setItem(SALT_KEY, encodeBase64(salt));
}

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) throw new Error(error.message || `${name}_failed`);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function startGithubOAuth(): Promise<void> {
  const result = await invoke<{ authorization_url: string }>("github-oauth-start");
  if (!result.authorization_url) throw new Error("oauth_url_missing");
  window.location.assign(result.authorization_url);
}

export async function getGithubVaultStatus(): Promise<GithubVaultStatus> {
  return invoke<GithubVaultStatus>("github-status");
}

async function ensureRepository(): Promise<void> {
  const status = await getGithubVaultStatus();
  if (!status.connected) throw new Error("github_not_connected");
  if (!status.repository) await invoke("github-create-private-repo");
}

async function listRecords(): Promise<VaultRecord[]> {
  const result = await invoke<{ records: VaultRecord[] }>("github-list-encrypted-records");
  if (!Array.isArray(result.records)) throw new Error("invalid_remote_records");
  return result.records;
}

function makeEntries(state: AppState, userId: string): Entry[] {
  const entries: Entry[] = [
    ...state.tasks.map((item) => ({ kind: "task" as const, item, originalId: item.id })),
    ...state.history.map((item) => ({ kind: "history" as const, item, originalId: item.id })),
    ...state.trash.map((item) => ({ kind: "trash" as const, item, originalId: item.task.id })),
    { kind: "manifest", item: { app: "stepwise-command-center", version: 1 }, originalId: userId },
  ];
  return entries;
}

async function encryptEntry(
  entry: Entry,
  id: string,
  key: CryptoKey,
  saltText: string,
): Promise<VaultRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ kind: entry.kind, item: entry.item }),
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bufferSource(iv) },
      key,
      bufferSource(plaintext),
    ),
  );
  const envelope: StoredEnvelope = {
    version: 1,
    salt: saltText,
    iv: encodeBase64(iv),
    data: encodeBase64(encrypted),
  };
  return { id, ciphertext: base64Text(JSON.stringify(envelope)) };
}

export async function backupEncryptedRecords(
  passphrase: string,
): Promise<{ count: number; repository: string | null }> {
  if (passphrase.length < 12) throw new Error("ตั้งรหัสผ่านสำรองอย่างน้อย 12 ตัวอักษร");
  await ensureRepository();
  const remote = await listRecords();
  if (remote.length > MAX_RECORDS)
    throw new Error(
      `มีไฟล์สำรองเกินขีดจำกัด ${MAX_RECORDS} รายการ กรุณาแบ่งเก็บหรือลบรายการเก่าก่อน`,
    );

  let salt = currentSalt();
  if (!salt && remote.length > 0)
    throw new Error(
      "พบข้อมูลสำรองเดิมบน GitHub แต่เครื่องนี้ไม่มี salt สำหรับเข้ารหัส กรุณากู้คืนก่อน หรือใช้เครื่องเดิม",
    );
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    saveSalt(salt);
  }
  if (salt.length !== 16) throw new Error("salt สำรองไม่ถูกต้อง กรุณากู้คืนก่อนสำรองใหม่");
  const saltText = encodeBase64(salt);
  for (const record of remote) {
    const envelope = parseEnvelope(record.ciphertext);
    if (envelope.salt !== saltText)
      throw new Error("รหัสผ่านหรือ salt ไม่ตรงกับชุดสำรองเดิม กรุณากู้คืนด้วยรหัสผ่านเดิมก่อน");
  }
  const key = await deriveKey(passphrase, salt);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("ต้องเข้าสู่ระบบก่อนสำรองข้อมูล");
  const entries = makeEntries(exportBackup() as AppState, authData.user.id);
  if (entries.length > MAX_RECORDS)
    throw new Error(`มีข้อมูลเกินขีดจำกัด ${MAX_RECORDS} รายการต่อ repository`);

  const active: VaultRecord[] = [];
  for (const entry of entries) {
    active.push(
      await encryptEntry(
        entry,
        await stableRecordId(authData.user.id, entry.kind, entry.originalId),
        key,
        saltText,
      ),
    );
  }
  for (let index = 0; index < active.length; index += BATCH_SIZE) {
    await invoke("github-sync-encrypted-records", {
      records: active.slice(index, index + BATCH_SIZE),
    });
  }
  const activeIds = new Set(active.map((record) => record.id));
  const removedIds = remote.map((record) => record.id).filter((id) => !activeIds.has(id));
  if (removedIds.length)
    await invoke("github-set-record-trash", { record_ids: removedIds, state: "trashed" });
  await invoke("github-set-record-trash", { record_ids: [...activeIds], state: "restored" });
  const status = await getGithubVaultStatus();
  return { count: active.length, repository: status.repository };
}

function parseEnvelope(ciphertext: string): StoredEnvelope {
  const envelope = JSON.parse(decodeText(ciphertext)) as Partial<StoredEnvelope>;
  if (
    envelope.version !== 1 ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.data !== "string"
  ) {
    throw new Error("รูปแบบไฟล์สำรองไม่ถูกต้อง");
  }
  if (decodeBase64(envelope.salt).length !== 16 || decodeBase64(envelope.iv).length !== 12)
    throw new Error("ข้อมูลเข้ารหัสไม่ถูกต้อง");
  return envelope as StoredEnvelope;
}

export async function restoreEncryptedRecords(passphrase: string): Promise<{ count: number }> {
  if (passphrase.length < 12) throw new Error("ใช้รหัสผ่านสำรองเดิม (อย่างน้อย 12 ตัวอักษร)");
  const records = await listRecords();
  if (!records.length) throw new Error("ไม่พบข้อมูลสำรองใน repository นี้");
  const firstRecord = records[0];
  if (!firstRecord) throw new Error("ไม่พบข้อมูลสำรองใน repository นี้");
  const first = parseEnvelope(firstRecord.ciphertext);
  const salt = decodeBase64(first.salt);
  const localSalt = currentSalt();
  if (localSalt && encodeBase64(localSalt) !== first.salt)
    throw new Error("salt ในเครื่องไม่ตรงกับ repository นี้");
  const key = await deriveKey(passphrase, salt);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("ต้องเข้าสู่ระบบก่อนกู้คืนข้อมูล");
  const state: { tasks: unknown[]; history: unknown[]; trash: unknown[] } = {
    tasks: [],
    history: [],
    trash: [],
  };
  let decrypted = 0;
  for (const record of records) {
    const envelope = parseEnvelope(record.ciphertext);
    if (envelope.salt !== first.salt) throw new Error("พบข้อมูลสำรองจากชุดเข้ารหัสหลายชุด");
    let clear: ArrayBuffer;
    try {
      clear = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bufferSource(decodeBase64(envelope.iv)) },
        key,
        bufferSource(decodeBase64(envelope.data)),
      );
    } catch {
      throw new Error("ถอดรหัสไม่ได้: ตรวจสอบ passphrase และความสมบูรณ์ของไฟล์สำรอง");
    }
    const payload = JSON.parse(new TextDecoder().decode(clear)) as {
      kind?: string;
      item?: unknown;
    };
    if (payload.kind === "manifest") {
      const expectedId = await stableRecordId(authData.user.id, "manifest", authData.user.id);
      if (record.id !== expectedId) throw new Error("ไฟล์สำรองไม่ตรงกับบัญชีผู้ใช้นี้");
    } else if (payload.kind === "task" || payload.kind === "history" || payload.kind === "trash") {
      const item = payload.item as { id?: string; task?: { id?: string } } | null;
      const originalId = payload.kind === "trash" ? item?.task?.id : item?.id;
      if (!originalId) throw new Error("รายการสำรองไม่มี UUID ที่จำเป็น");
      const expectedId = await stableRecordId(authData.user.id, payload.kind, originalId);
      if (record.id !== expectedId) throw new Error("UUID ของไฟล์สำรองไม่ตรงกับเนื้อหาที่ถอดรหัส");
      if (payload.kind === "task") state.tasks.push(payload.item);
      if (payload.kind === "history") state.history.push(payload.item);
      if (payload.kind === "trash") state.trash.push(payload.item);
    } else throw new Error("ชนิดข้อมูลใน backup ไม่รู้จัก");
    decrypted++;
  }
  if (!importBackup(state)) throw new Error("ข้อมูลสำรองไม่ผ่านการตรวจสอบ");
  saveSalt(salt);
  return { count: decrypted };
}
