import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const load=async result=>import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const {applyVoiceAction}=await load(await build({entryPoints:['src/lib/voice-actions.ts'],bundle:true,platform:'node',format:'esm',write:false}));
const quickReply={id:'quick-reply',action:'reply',reply:'The saved Hacker News brief is available.',provider:'codex',model:null,transcript:'What is the top HN story?',queued:null,skill:null,workIds:[],panels:['documents'],deliverable:null,reveal:null,reveals:[],obsidian:null,workTarget:null};

test('native quick answer with a documents highlight performs no workspace navigation',async()=>{
 const app={get workspace(){assert.fail('quick answer must not access workspace navigation')},get vault(){assert.fail('quick answer must not open a note')}};
 assert.equal(await applyVoiceAction(app,quickReply,()=>assert.fail('no cockpit activation'),()=>assert.fail('no terminal opening')),null);
});

test('explicit saved-report opens navigate directly in native Obsidian for either provider',async()=>{
 const file={path:'inbox/research/morning-intel/2026-09-15-intel.md',name:'2026-09-15-intel.md',extension:'md'};
 for(const provider of ['codex','claude']){
  const opened=[],revealed=[];
  const leaf={openFile:async value=>opened.push(value)};
  const app={vault:{getAbstractFileByPath:query=>query===file.path?file:null},workspace:{iterateAllLeaves:()=>{},getLeaf:type=>{assert.equal(type,'tab');return leaf},revealLeaf:async value=>revealed.push(value)}};
  const result=await applyVoiceAction(app,{...quickReply,provider,reply:'',deliverable:file.path,reveal:'open'},()=>assert.fail('no dashboard activation'),()=>assert.fail('no terminal opening'));
  assert.deepEqual(opened,[file]);assert.deepEqual(revealed,[leaf]);assert.equal(result,'Opened '+file.name+'.');
 }
});

const stubs={
 '../../obsidian-v2/shared/voice-session':`export const sessions=[];export class VoiceSession{constructor(){this.mode='idle';this.cancellations=[];sessions.push(this)}connect(){}destroy(){}cancel(reason){this.cancellations.push(reason);this.mode='idle';return 'cancel-result'} }export const browserVoiceTransport=()=>()=>{throw new Error('No network allowed')};`,
 './work':`export const workCalls=[];export const workFeed={refresh:async()=>({tasks:[]})};export function syncWorkReply(){}export function openWork(ids=[],spoken=false){workCalls.push({ids,spoken})}export function getWorkSelection(){throw new Error('No request dispatched')}`,
 './bridge-auth':`export function authorizeBridge(){throw new Error('No authorization required')}`,
 '../../obsidian-v2/shared/timezone.mjs':`export const TIME_ZONE=new Intl.DateTimeFormat().resolvedOptions().timeZone;`,
};
const hugo=await load(await build({stdin:{contents:`export {voice} from '../hugo-v2/lib/voiceClient';export {sessions} from '../../obsidian-v2/shared/voice-session';export {workCalls} from './work';`,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'voice-navigation-fixture',setup(builder){
 builder.onResolve({filter:/.*/},args=>{if(args.path==='../hugo-v2/lib/voiceClient')return {path:path.resolve('../hugo-v2/lib/voiceClient.ts')};if(args.path in stubs)return {path:args.path,namespace:'fixture'};throw new Error('Unexpected voice dependency '+args.path)});
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'js'}));
 }}]}));

test('Hugo quick documents highlight does not open work, a report, or a reveal',()=>{
 const highlights=[];hugo.voice.onPanels(value=>highlights.push(value));hugo.voice.onOpenDoc(()=>assert.fail('no report opening'));hugo.voice.onDeliverable(()=>assert.fail('no report callout'));hugo.voice.onReveal(()=>assert.fail('no reveal'));
 hugo.voice.init();const before=hugo.workCalls.length;hugo.sessions.at(-1).onReply(quickReply);assert.deepEqual(highlights,[['documents']]);assert.equal(hugo.workCalls.length,before);hugo.voice.destroy();
});

test('explicit terminal command and actual work IDs still open Hugo work',()=>{
 hugo.voice.init();const session=hugo.sessions.at(-1),before=hugo.workCalls.length;
 session.onReply({...quickReply,panels:[],workIds:['new-a','new-b'],action:'task'});
 session.onReply({...quickReply,panels:[],obsidian:{op:'command',id:'terminal:open-terminal.default.root',label:'terminal'}});
 assert.deepEqual(hugo.workCalls.slice(before),[{ids:['new-a','new-b'],spoken:true},{ids:[],spoken:false}]);hugo.voice.destroy();
});

test('explicit saved-report opens display the report in Hugo without a terminal or extra callout',()=>{
 const opened=[];hugo.voice.onPanels(()=>{});hugo.voice.onOpenDoc(path=>opened.push(path));hugo.voice.onDeliverable(()=>assert.fail('no extra report callout'));hugo.voice.onReveal(()=>assert.fail('no extra reveal'));
 hugo.voice.init();const session=hugo.sessions.at(-1),before=hugo.workCalls.length,path='inbox/research/morning-intel/2026-09-15-intel.md';
 for(const provider of ['codex','claude'])session.onReply({...quickReply,provider,reply:'',deliverable:path,reveal:'open'});
 assert.deepEqual(opened,[path,path]);assert.equal(hugo.workCalls.length,before);hugo.voice.destroy();
});

test('Hugo reports provider changes only when an active voice turn was stopped',()=>{
 const logs=[];hugo.voice.onLog((kind,text)=>logs.push({kind,text}));hugo.voice.init();const session=hugo.sessions.at(-1);
 for(const state of ['listening','working','speaking']){
  session.mode=state;const before=logs.length;
  assert.equal(hugo.voice.stop('provider-change'),'cancel-result');assert.equal(session.mode,'idle');
  assert.equal(logs.length,before+1);assert.equal(logs.at(-1).kind,'sys');assert.match(logs.at(-1).text,/stopped.*switching providers/i);
  hugo.voice.stop('provider-change');assert.equal(logs.length,before+1,'idle rerenders stay quiet');
 }
 session.mode='working';const before=logs.length;hugo.voice.stop();assert.equal(logs.length,before,'ordinary stops retain existing caller messaging');
 session.mode='error';hugo.voice.stop('provider-change');assert.equal(logs.length,before,'inactive errors do not claim a stopped recording');
 assert.deepEqual(session.cancellations,['provider-change','provider-change','provider-change','provider-change','provider-change','provider-change',undefined,'provider-change']);hugo.voice.destroy();
});

function nativeNoteFixture(file){
 const opened=[],created=[],revealed=[],leaves=[];
 const makeLeaf=(initial,type='markdown')=>({view:{file:initial,getViewType:()=>type},editor:{selection:'keep this selection'},async openFile(value){opened.push({leaf:this,file:value});this.view.file=value}});
 const other=makeLeaf({...file,path:'different-folder/'+file.name});leaves.push(other);
 const workspace={iterateAllLeaves:visit=>leaves.forEach(visit),getLeaf:where=>{const leaf=makeLeaf(null);created.push({where,leaf});leaves.push(leaf);return leaf},revealLeaf:async leaf=>revealed.push(leaf),getMostRecentLeaf:()=>other,createLeafBySplit:(leaf,direction)=>{assert.equal(leaf,other);assert.equal(direction,'vertical');return workspace.getLeaf('split')},getRightLeaf:()=>workspace.getLeaf('right-sidebar'),getLeftLeaf:()=>workspace.getLeaf('left-sidebar')};
 const app={vault:{getAbstractFileByPath:query=>query===file.path?file:null,getMarkdownFiles:()=>[file]},workspace};
 return {app,opened,created,revealed,leaves,other,makeLeaf};
}

test('native repeated report, note and daily-note opens reuse the exact existing file pane',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date());
 for(const reply of [{deliverable:'reports/brief.md',reveal:'open'},{obsidian:{op:'open-note',query:'reports/brief.md'}},{obsidian:{op:'open-note',query:'reports/brief.md',where:'tab'}},{obsidian:{op:'daily-note'}}]){
  const filePath=reply.obsidian?.op==='daily-note'?`daily-notes/${date}.md`:'reports/brief.md';
  const file={path:filePath,name:filePath.split('/').at(-1),basename:'brief',extension:'md'},f=nativeNoteFixture(file);
  for(let attempt=0;attempt<2;attempt++)assert.equal(await applyVoiceAction(f.app,{...quickReply,...reply},()=>assert.fail('no cockpit'),()=>assert.fail('no terminal')),'Opened '+file.name+'.');
  assert.equal(f.created.length,1);assert.equal(f.opened.length,1);assert.notEqual(f.created[0].leaf,f.other,'matching basenames never substitute another full path');
  assert.deepEqual(f.revealed,[f.created[0].leaf,f.created[0].leaf]);assert.equal(f.created[0].leaf.editor.selection,'keep this selection');
 }
});

test('native explicit split and sidebar requests keep their chosen destination',async()=>{
 const file={path:'reports/brief.md',name:'brief.md',extension:'md'};
 for(const where of ['split','right-sidebar','left-sidebar']){
  const f=nativeNoteFixture(file),existing=f.makeLeaf(file);f.leaves.push(existing);
  await applyVoiceAction(f.app,{...quickReply,obsidian:{op:'open-note',query:file.path,where}},()=>{},()=>{});
  assert.deepEqual(f.created.map(item=>item.where),[where]);assert.equal(f.opened.length,1);assert.notEqual(f.revealed[0],existing);
 }
});
