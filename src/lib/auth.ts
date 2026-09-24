export interface SessionUser { id:string; email:string; displayName:string; avatarUrl:string|null; preferences:Record<string,unknown>; role:"admin"|"operator"|"viewer" }
let accessToken:string|null=null;
const listeners=new Set<()=>void>();
export const authStore={get token(){return accessToken},set(token:string|null){accessToken=token;for(const l of listeners)l();},subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}};
interface ApiEnvelope<T>{success:boolean;data?:T;error?:{message:string}}
const apiBase=()=>`${import.meta.env['VITE_API_URL']??"http://localhost:3000"}/api`;
async function request<T>(path:string,body:unknown,method:string,allowRefresh:boolean){const init:RequestInit={method,credentials:"include",headers:{"content-type":"application/json",...(accessToken?{authorization:`Bearer ${accessToken}`}:{})}};if(body!==undefined)init.body=JSON.stringify(body);let response=await fetch(`${apiBase()}${path}`,init);if(response.status===401&&allowRefresh&&path!=="/auth/refresh"){const renewed=await refreshSession();if(renewed){const retryHeaders={...init.headers,authorization:`Bearer ${authStore.token}`};response=await fetch(`${apiBase()}${path}`,{...init,headers:retryHeaders});}}const result=await response.json() as ApiEnvelope<T>;if(!response.ok||!result.success)throw new Error(result.error?.message??"Request failed");return result.data as T;}
export async function authRequest<T>(path:string,body?:unknown,method="POST"){return request<T>(path,body,method,true);}
export async function refreshSession(){try{const data=await request<{accessToken:string;user:SessionUser}>("/auth/refresh",undefined,"POST",false);authStore.set(data.accessToken);return data.user;}catch{authStore.set(null);return null;}}
