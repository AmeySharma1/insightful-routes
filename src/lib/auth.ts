import { supabase } from "@/integrations/supabase/client";

export interface SessionUser { id:string; email:string; displayName:string; avatarUrl:string|null; preferences:Record<string,unknown>; role:"admin"|"operator"|"viewer" }
let accessToken:string|null=null;
const listeners=new Set<()=>void>();
export const authStore={get token(){return accessToken},set(token:string|null){accessToken=token;for(const l of listeners)l();},subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}};

async function toSessionUser():Promise<SessionUser|null>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user?.email){authStore.set(null);return null;}
  authStore.set(session.access_token);
  const displayName=String(session.user.user_metadata?.["display_name"]??session.user.email.split("@")[0]);
  const {data:profile}=await supabase.from("profiles").select("display_name,avatar_url,preferences").eq("user_id",session.user.id).maybeSingle();
  if(!profile){await supabase.from("profiles").insert({user_id:session.user.id,display_name:displayName});}
  return {id:session.user.id,email:session.user.email,displayName:profile?.display_name??displayName,avatarUrl:profile?.avatar_url??null,preferences:(profile?.preferences as Record<string,unknown>|null)??{},role:"viewer"};
}

export async function signInWithGoogle(){
  const {lovable}=await import("@/integrations/lovable/index");
  const result=await lovable.auth.signInWithOAuth("google",{redirect_uri:window.location.origin});
  if(result.error)throw new Error(result.error.message??"Google sign-in failed");
  if(result.redirected)return null;
  return toSessionUser();
}
export async function signUp(email:string,password:string,displayName:string){
  const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:`${window.location.origin}/auth/callback`}});
  if(error)throw new Error(error.message);
}
export async function signIn(email:string,password:string){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw new Error(error.message);return toSessionUser();}
export async function requestPasswordReset(email:string){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/reset-password?recovery=1`});if(error)throw new Error(error.message);}
export async function updatePassword(password:string){const {error}=await supabase.auth.updateUser({password});if(error)throw new Error(error.message);return toSessionUser();}
export async function signOut(){await supabase.auth.signOut({scope:"local"});authStore.set(null);}
export async function refreshSession(){try{return await toSessionUser();}catch{authStore.set(null);return null;}}
