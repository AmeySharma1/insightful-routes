import { Pool } from "pg";
import { databaseConfig } from "../config/database";
import type { OtpRecord, RefreshRecord, UserRecord } from "./types";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(input: { email: string; passwordHash: string; displayName: string }): Promise<UserRecord>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  saveOtp(record: OtpRecord): Promise<void>;
  getLatestOtp(email: string, purpose: OtpRecord["purpose"]): Promise<OtpRecord | null>;
  updateOtp(record: OtpRecord): Promise<void>;
  saveRefresh(record: RefreshRecord): Promise<void>;
  findRefresh(tokenHash: string): Promise<RefreshRecord | null>;
  revokeRefresh(id: string, replacedBy?: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

const users = new Map<string, UserRecord>();
const otps = new Map<string, OtpRecord>();
const refreshes = new Map<string, RefreshRecord>();
class MemoryAuthRepository implements AuthRepository {
  async findUserByEmail(email: string) { return [...users.values()].find(u => u.email === email) ?? null; }
  async findUserById(id: string) { return users.get(id) ?? null; }
  async createUser(input: { email: string; passwordHash: string; displayName: string }) { const id=crypto.randomUUID(); const user:UserRecord={id,email:input.email,passwordHash:input.passwordHash,verified:true,displayName:input.displayName,avatarUrl:null,preferences:{},role:"viewer"}; users.set(id,user); return user; }
  async updatePassword(userId:string,passwordHash:string){const u=users.get(userId);if(u)users.set(userId,{...u,passwordHash});}
  async saveOtp(record:OtpRecord){otps.set(record.id,record);}
  async getLatestOtp(email:string,purpose:OtpRecord["purpose"]){return [...otps.values()].filter(o=>o.email===email&&o.purpose===purpose).sort((a,b)=>b.expiresAt-a.expiresAt)[0]??null;}
  async updateOtp(record:OtpRecord){otps.set(record.id,record);}
  async saveRefresh(record:RefreshRecord){refreshes.set(record.id,record);}
  async findRefresh(tokenHash:string){return [...refreshes.values()].find(r=>r.tokenHash===tokenHash)??null;}
  async revokeRefresh(id:string,replacedBy?:string){const r=refreshes.get(id);if(r)refreshes.set(id,{...r,revokedAt:Date.now(),replacedBy:replacedBy??null});}
  async revokeFamily(familyId:string){for(const [id,r] of refreshes)if(r.familyId===familyId)refreshes.set(id,{...r,revokedAt:Date.now()});}
}

class PgAuthRepository implements AuthRepository {
  private pool=new Pool({connectionString:databaseConfig.nodes.find(n=>n.role==="primary")?.connectionString,max:5});
  async findUserByEmail(email:string){const r=await this.pool.query(`SELECT u.id,u.email,u.password_hash,u.email_verified_at,p.display_name,p.avatar_url,p.preferences,COALESCE((SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role LIMIT 1),'viewer') role FROM app_users u JOIN profiles p ON p.user_id=u.id WHERE u.email=$1`,[email]);return this.mapUser(r.rows[0]);}
  async findUserById(id:string){const r=await this.pool.query(`SELECT u.id,u.email,u.password_hash,u.email_verified_at,p.display_name,p.avatar_url,p.preferences,COALESCE((SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role LIMIT 1),'viewer') role FROM app_users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,[id]);return this.mapUser(r.rows[0]);}
  private mapUser(row:Record<string,unknown>|undefined):UserRecord|null{return row?{id:String(row.id),email:String(row.email),passwordHash:String(row.password_hash),verified:Boolean(row.email_verified_at),displayName:String(row.display_name),avatarUrl:row.avatar_url?String(row.avatar_url):null,preferences:(row.preferences??{}) as Record<string,unknown>,role:row.role as UserRecord["role"]}:null;}
  async createUser(input:{email:string;passwordHash:string;displayName:string}){const c=await this.pool.connect();try{await c.query("BEGIN");const u=await c.query(`INSERT INTO app_users(email,password_hash,email_verified_at) VALUES($1,$2,now()) RETURNING id`,[input.email,input.passwordHash]);const id=String(u.rows[0].id);await c.query(`INSERT INTO profiles(user_id,display_name) VALUES($1,$2)`,[id,input.displayName]);await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,'viewer')`,[id]);await c.query("COMMIT");return (await this.findUserById(id))!;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
  async updatePassword(userId:string,passwordHash:string){await this.pool.query(`UPDATE app_users SET password_hash=$2,updated_at=now() WHERE id=$1`,[userId,passwordHash]);}
  async saveOtp(o:OtpRecord){await this.pool.query(`INSERT INTO otp_challenges(id,email,purpose,code_hash,payload,attempts,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),NULL)`,[o.id,o.email,o.purpose,o.codeHash,o.payload,o.attempts,o.expiresAt]);}
  async getLatestOtp(email:string,purpose:OtpRecord["purpose"]){const r=await this.pool.query(`SELECT id,email,purpose,code_hash,payload,attempts,extract(epoch from expires_at)*1000 expires_at,extract(epoch from consumed_at)*1000 consumed_at FROM otp_challenges WHERE email=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1`,[email,purpose]);const o=r.rows[0];return o?{id:o.id,email:o.email,purpose:o.purpose,codeHash:o.code_hash,payload:o.payload,attempts:o.attempts,expiresAt:Number(o.expires_at),consumedAt:o.consumed_at?Number(o.consumed_at):null}:null;}
  async updateOtp(o:OtpRecord){await this.pool.query(`UPDATE otp_challenges SET attempts=$2,consumed_at=CASE WHEN $3::bigint IS NULL THEN NULL ELSE to_timestamp($3/1000.0) END WHERE id=$1`,[o.id,o.attempts,o.consumedAt]);}
  async saveRefresh(r:RefreshRecord){await this.pool.query(`INSERT INTO refresh_sessions(id,user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4,to_timestamp($5/1000.0))`,[r.id,r.userId,r.familyId,r.tokenHash,r.expiresAt]);}
  async findRefresh(hash:string){const q=await this.pool.query(`SELECT id,user_id,family_id,token_hash,extract(epoch from expires_at)*1000 expires_at,extract(epoch from revoked_at)*1000 revoked_at,replaced_by FROM refresh_sessions WHERE token_hash=$1`,[hash]);const r=q.rows[0];return r?{id:r.id,userId:r.user_id,familyId:r.family_id,tokenHash:r.token_hash,expiresAt:Number(r.expires_at),revokedAt:r.revoked_at?Number(r.revoked_at):null,replacedBy:r.replaced_by}:null;}
  async revokeRefresh(id:string,replacedBy?:string){await this.pool.query(`UPDATE refresh_sessions SET revoked_at=now(),replaced_by=$2 WHERE id=$1`,[id,replacedBy??null]);}
  async revokeFamily(familyId:string){await this.pool.query(`UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL`,[familyId]);}
}
export const authRepository:AuthRepository=databaseConfig.simulate?new MemoryAuthRepository():new PgAuthRepository();
