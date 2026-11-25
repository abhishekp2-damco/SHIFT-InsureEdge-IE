const base = '/api/report-management';

export interface ReportCard { id:number; reportCode:string; title:string; description:string; defaultReportName:string; isImplemented:boolean; sortOrder:number }
export interface ReportItem { id:number; code:string; label:string; pageTitle:string; itemType:'FileList'|'Catalog'; sortOrder:number; cards:ReportCard[] }
export interface ReportGroup { id:number; name:string; sortOrder:number; items:ReportItem[] }
export interface ReportFile { id:number; itemCode:string; reportName:string; reportingPeriod:string; issuingCarrier?:string; createdOn:string }
export interface GeneratedReport { id:number; reportName:string; reportRunBy:string; reportCreatedDate:string; scheduledReport:boolean }
export interface ReportDefinition { id:number; reportCode:string; reportName:string; scheduledBy:string; dateCriteria?:string; periodFrom?:string; periodTo?:string; filters:Record<string,string[]>; scheduleType?:string; frequency?:string; scheduledDate?:string; startDate?:string; endDate?:string; deliveryMethod?:string; recipients?:string; canEdit:boolean; canDelete:boolean }
export interface Lookup { value:string; label:string }
export interface ReportField { key:string; label:string; type:'select'|'multi'|'date'|'number' }
export interface Metadata { reportCode:string; reportName:string; fields:ReportField[]; lookups:Record<string,Lookup[]> }
export interface ReportRequest { [key:string]:unknown; reportName:string; dateCriteria?:string; periodFrom?:string; periodTo?:string; filters:Record<string,string[]>; isScheduleReport:boolean; scheduleType?:string; frequency?:string; scheduledDate?:string; startDate?:string; endDate?:string; deliveryMethod?:string; recipients?:string }
export interface Paged<T>{items:T[];total:number;page:number;pageSize:number}
export interface UserLookup { id:number; name:string; email:string }

async function json<T>(url:string, init?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(init?.headers||{})},...init});
  if(!response.ok){let message=`Request failed (${response.status})`;try{message=(await response.json()).error||message}catch{}throw new Error(message)}
  if(response.status===204)return undefined as T;return response.json();
}
const qs=(o:Record<string,string|number|undefined>)=>new URLSearchParams(Object.entries(o).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString();
async function file(url:string){const r=await fetch(url,{credentials:'include'});if(!r.ok)throw new Error((await r.json()).error||'Unable to retrieve file');return r.blob()}

export const reportApi={
  catalog:()=>json<{groups:ReportGroup[]}>(`${base}/catalog`),
  years:(code:string)=>json<number[]>(`${base}/items/${code}/years`),
  files:(code:string,year:number,search:string,page:number,pageSize:number)=>json<Paged<ReportFile>>(`${base}/items/${code}/files?${qs({year,search,page,pageSize})}`),
  reportFile:(id:number,action:'View'|'Download'|'Share')=>file(`${base}/files/${id}?action=${action}`),
  generated:(code:string,search:string,page:number,pageSize:number)=>json<Paged<GeneratedReport>>(`${base}/reports/${code}/generated?${qs({search,page,pageSize})}`),
  definitions:(code:string,search:string,page:number,pageSize:number)=>json<Paged<ReportDefinition>>(`${base}/reports/${code}/definitions?${qs({search,page,pageSize})}`),
  definition:(code:string,id:number)=>json<ReportDefinition>(`${base}/reports/${code}/definitions/${id}`),
  metadata:(code:string)=>json<Metadata>(`${base}/reports/${code}/metadata`),
  preview:(code:string,request:ReportRequest)=>json<{fileName:string;contentBase64:string;rowCount:number}>(`${base}/reports/${code}/preview`,{method:'POST',body:JSON.stringify(request)}),
  create:(code:string,request:ReportRequest)=>json<{id:number}>(`${base}/reports/${code}/definitions`,{method:'POST',body:JSON.stringify(request)}),
  update:(code:string,id:number,request:ReportRequest)=>json<void>(`${base}/reports/${code}/definitions/${id}`,{method:'PUT',body:JSON.stringify(request)}),
  delete:(code:string,id:number)=>json<void>(`${base}/reports/${code}/definitions/${id}`,{method:'DELETE'}),
  generatedFile:(id:number,action:'View'|'Download'|'Share')=>file(`${base}/generated/${id}/file?action=${action}`),
  users:()=>json<UserLookup[]>(`${base}/users`),
  recent:()=>json<{id:number;action:string;targetType:string;targetName:string;occurredOn:string}[]>(`${base}/recent-activity`),
  share:(id:number,userIds:number[])=>json<void>(`${base}/generated/${id}/share`,{method:'POST',body:JSON.stringify({userIds})}),
  sendEmail:(payload:unknown)=>json<void>(`${base}/emails`,{method:'POST',body:JSON.stringify(payload)}),
};
