export interface SessionUser { id:string; email:string; displayName:string; avatarUrl:string|null; preferences:Record<string,unknown>; role:"admin"|"operator"|"viewer" }
let accessToken:string|null=null;
const listeners=new Set<()=>void>();
export const authStore={get token(){return accessToken},set(token:string|null){accessToken=token;for(const l of listeners)l();},subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}};
interface ApiEnvelope<T>{success:boolean;data?:T;error?:{message:string}}
export async function authRequest<T>(path:string,body?:unknown,method="POST"){const response=await fetch(`${import.meta.env.VITE_API_URL??"http://localhost:3000"}/api${path}`,{method,credentials:"include",headers:{"content-type":"application/json",...(accessToken?{authorization:`Bearer ${accessToken}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json() as ApiEnvelope<T>;if(!response.ok||!result.success)throw new Error(result.error?.message??"Request failed");return result.data as T;}
export async function refreshSession(){try{const data=await authRequest<{accessToken:string;user:SessionUser}>("/auth/refresh");authStore.set(data.accessToken);return data.user;}catch{authStore.set(null);return null;}}
