// Local-only acceptance driver. Run through zwaar.sh; never use production n8n state.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { sanitizeExecution } from './sanitize-ap-execution.mjs';
const root = path.resolve('.');
const req = createRequire(path.join(root,'.ap-local/package.json'));
const {simpleParser} = req('mailparser');
const dir = path.join(root,'.ap-local/run-'+Date.now());
fs.mkdirSync(dir,{recursive:true});
const evidence = path.join(root,'evidence/ap-template'); fs.mkdirSync(evidence,{recursive:true});
const cli = path.join(root,'.ap-local/node_modules/n8n/bin/n8n');
const env = {...process.env,N8N_USER_FOLDER:dir,N8N_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),N8N_HOST:'localhost',N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_PORT:'5689',N8N_RUNNERS_BROKER_PORT:'5690',N8N_PROTOCOL:'http',WEBHOOK_URL:'http://localhost:5689/',N8N_EDITOR_BASE_URL:'http://localhost:5689/',N8N_SECURE_COOKIE:'false',N8N_DIAGNOSTICS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_COMMUNITY_PACKAGES_ENABLED:'false',N8N_COMMUNITY_PACKAGES_PREVENT_LOADING:'false',N8N_RUNNERS_MODE:'internal',DB_SQLITE_POOL_SIZE:'1',N8N_DEFAULT_BINARY_DATA_MODE:'default',N8N_LOG_LEVEL:'warn'};
const community = path.join(dir,'.n8n/nodes/node_modules/n8n-nodes-jithox');
fs.mkdirSync(community,{recursive:true});fs.copyFileSync('package.json',path.join(community,'package.json'));fs.cpSync('dist',path.join(community,'dist'),{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
for(const p of [5689,5690,1025,5691]) await free(p);
const logFd = fs.openSync(path.join(dir,'n8n.log'),'a');
let server, sink, mock, cookie = '', messages = [];
const request = async (url, body, method=body===undefined?'GET':'POST') => {
  console.log('Local API',method,url);
  const r = await fetch('http://localhost:5689'+url,{method,headers:{'content-type':'application/json',...(cookie?{cookie}: {})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
  if(r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const text = await r.text(); if(!r.ok) throw new Error(`${method} ${url}: ${r.status} ${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
};
const report = {startedAt:new Date().toISOString(),n8n:req('n8n/package.json').version,runs:[],externalMailSent:0,smtp:{host:'127.0.0.1',port:1025,relaying:false},doesNotProve:['IMAP authentication against a real mailbox (fixture injected at trigger)','Real human callback/account ownership','Bank import/payment acceptance','Ledger posting','Optional paid VAT operation']};
try {
  const imported = spawnSync(process.execPath,[cli,'import:workflow','--input='+path.join(root,'templates/ap-invoice-payment-check.json')],{env:{...env,N8N_LOG_LEVEL:'info'},encoding:'utf8',timeout:600000});
  fs.writeFileSync(path.join(evidence,'import.log.txt'),imported.stdout+imported.stderr);
  assert.equal(imported.status,0,'n8n import:workflow failed'); report.importExit=0;
  server=spawn(process.execPath,[cli,'start'],{env,stdio:['ignore',logFd,logFd]}); report.n8nPid=server.pid;
  for(let n=0;;n++){try{if((await fetch('http://localhost:5689/rest/settings')).ok)break;}catch{} if(n>300||server.exitCode!==null)throw new Error('n8n not ready; see '+dir);await sleep(1000);}
  await request('/rest/owner/setup',{email:'owner@example.invalid',firstName:'Local',lastName:'Test',password:'A9'+crypto.randomBytes(24).toString('hex')});
  const credential = (await request('/rest/credentials',{name:'LOCAL SINK - no auth no relay',type:'smtp',data:{host:'127.0.0.1',port:1025,secure:false,disableStartTls:true}})).data;
  sink=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost local-only sink\r\n');let buffer='',dataMode=false,data='';
    socket.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\r\n')){const i=buffer.indexOf('\r\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+2);
      if(dataMode){if(line==='.') {dataMode=false;const message=data;data='';simpleParser(message).then(m=>messages.push(m));socket.write('250 accepted locally\r\n');} else data+=line+'\r\n';continue;}
      if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');else if(/^DATA/.test(line)){dataMode=true;socket.write('354 send data\r\n');}else if(/^QUIT/.test(line)){socket.end('221 bye\r\n');}else socket.write('250 ok\r\n');
    }});
  }); await new Promise(r=>sink.listen(1025,'127.0.0.1',r));
  mock=http.createServer((rq,res)=>{res.writeHead(403,{'content-type':'application/json','x-vercel-mitigated':'challenge'});res.end(JSON.stringify({error:{code:'challenge',message:'Mocked Vercel challenge - no burst'}}));});await new Promise(r=>mock.listen(5691,'127.0.0.1',r));
  const template=JSON.parse(fs.readFileSync('templates/ap-invoice-payment-check.json'));
  const infos=[...new Map(template.nodes.map(n=>[`${n.type}@${n.typeVersion}`,{name:n.type,version:n.typeVersion}])).values()];
  const types=(await request('/rest/node-types',{nodeInfos:infos})).data;
  report.registeredNodeTypes=types.map(t=>t.name);assert.equal(types.length,new Set(template.nodes.map(n=>`${n.type}@${n.typeVersion}`)).size);
  const operator={debtorName:'Fictitious Buyer - DO NOT PAY',debtorIban:'BE68539007547034',debtorBic:'KREDBEBB',executionDate:'2026-10-15',approverEmail:'approver@example.invalid',fromEmail:'ap@example.invalid'};
  for(const scenario of ['live-approved','mock-403-approved','live-rejected']) {
    const w=structuredClone(template);delete w.id;w.name='LOCAL AP E2E '+scenario;
    const byName=n=>w.nodes.find(x=>x.name===n);
    Object.assign(byName('Invoice email'),{type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{}});
    Object.assign(byName('Supplier table'),{type:'n8n-nodes-base.set',typeVersion:3.4,parameters:{mode:'raw',jsonOutput:JSON.stringify({supplierKey:'BE0123456789',ibanOnFile:'BE68539007547034'}),options:{}}});
    byName('Operator settings').parameters.jsCode=`return [{json:{...$input.first().json,operator:${JSON.stringify(operator)}}}];`;
    byName('Human approval').credentials={smtp:{id:credential.id,name:credential.name}};
    for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest')) n.parameters.headerParameters.parameters.push({name:'x-jithox-probe',value:'ap-template-e2e'});
    if(scenario==='mock-403-approved')byName('Payment change check').parameters.url='http://127.0.0.1:5691/challenge';
    const input={json:{},binary:{attachment_0:{data:fs.readFileSync('tests/fixtures/invoice.xml').toString('base64'),mimeType:'application/xml',fileName:'invoice.xml'}}};
    w.nodes.push({id:'fixture-attachment',name:'Fixture attachment',type:'n8n-nodes-base.code',typeVersion:2,position:[0,200],parameters:{jsCode:`return [${JSON.stringify(input)}];`}});
    w.connections['Invoice email']={main:[[{node:'Fixture attachment',type:'main',index:0}]]};
    w.connections['Fixture attachment']={main:[[{node:'Select UBL attachment',type:'main',index:0}]]};
    const saved=(await request('/rest/workflows',w)).data;
    const started=(await request(`/rest/workflows/${saved.id}/run`,{triggerToStartFrom:{name:'Invoice email'}})).data;
    console.log('Started',scenario,started.executionId); const id=started.executionId;
    let execution;
    async function getExec(){return request(`/api/v1/executions/${id}?includeData=true`);}
    for(let i=0;;i++) {execution=await getExec();if(execution.status==='waiting')break;if(['error','success','crashed','canceled'].includes(execution.status)||i>120) {fs.writeFileSync(path.join(dir,'failed-execution.json'),JSON.stringify(execution,null,2));throw new Error('Did not wait: '+execution.status+' '+dir);}await sleep(1000);}
    for(let i=0;messages.length===0&&i<20;i++)await sleep(250);
    assert.equal(messages.length,1); const mail=messages.shift();
    const approved=scenario!=='live-rejected';
    const links=[...String(mail.html).matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
    const link=links.find(x=>x.includes(`approved=${approved}`));assert.ok(link);assert.equal(new URL(link).hostname,'localhost');
    const callback=spawnSync('curl.exe',['--silent','--show-error','--fail','--user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',link],{encoding:'utf8',timeout:20000});assert.equal(callback.status,0);
    assert.ok(callback.stdout.length>0,'Approval callback was ignored (e.g. a bot user agent)');
    for(let i=0;;i++){execution=await getExec();if(execution.status==='success')break;if(['error','crashed','canceled'].includes(execution.status)||i>120){fs.writeFileSync(path.join(dir,'failed-execution.json'),JSON.stringify(execution,null,2));throw new Error('Resume failed: '+execution.status+' '+dir);}await sleep(1000);}
    const runs=execution.data.resultData.runData;
    const gate=runs['Approval gate'].at(-1).data.main[0][0].json;
    assert.equal(gate.exportAllowed,scenario==='live-approved');
    if(scenario==='mock-403-approved') assert.equal(gate.paymentResponse.statusCode,403,'Must exercise a real HTTP 403 response from the local mock');
    if(scenario==='live-approved') {
      assert.equal(gate.paymentVerdict,'verify_first');
      assert.equal(gate.reviewResponse.statusCode,200);
      assert.equal(gate.review.hasUnknowns,true);
      assert.ok(gate.review.checks.some(c=>c.source==='eu_vies'&&c.status==='skipped'));
      const item=runs['SEPA and booking proposal'].at(-1).data.main[0][0];
      for(const [name,b] of Object.entries(item.binary)){
        let bytes;
        if(b.id){const r=await fetch('http://localhost:5689/rest/binary-data?id='+encodeURIComponent(b.id)+'&action=download',{headers:{cookie}});assert.equal(r.status,200);bytes=Buffer.from(await r.arrayBuffer());}
        else bytes=Buffer.from(b.data,'base64');
        fs.writeFileSync(path.join(evidence,name==='sepa'?'payment.pain.001.001.03.xml':'booking-proposal.json'),bytes);
        b.data=bytes.toString('base64');delete b.id;
        if(name==='sepa')report.sepaBytes=bytes.length;
      }
    } else assert.ok(!runs['SEPA and booking proposal']);
    // Strip local resume capabilities and credential references, keeping real API replies.
    fs.writeFileSync(path.join(evidence,scenario+'.execution.json'),JSON.stringify(sanitizeExecution(execution),null,2)+'\n');
    report.runs.push({scenario,id,status:execution.status,paymentVerdict:gate.paymentVerdict,exportAllowed:gate.exportAllowed,approval:gate.approval});
    console.log('PASS',scenario,execution.status,gate.paymentVerdict,gate.exportAllowed);
  }
} catch(error){report.error=String(error.stack);console.error(report.error);process.exitCode=1;}
finally {
  if(server&&server.exitCode===null){
    if(process.platform==='win32') spawnSync('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore'});
    else server.kill('SIGTERM');
    await Promise.race([new Promise(r=>server.exitCode!==null?r():server.once('exit',r)),sleep(10000)]);
  }
  if(sink)await new Promise(r=>sink.close(r));if(mock)await new Promise(r=>mock.close(r));
  report.cleanup={};for(const port of [5689,5690,1025,5691]){try{await free(port);report.cleanup[port]='closed';}catch{report.cleanup[port]='OPEN';process.exitCode=1;}}
  report.finishedAt=new Date().toISOString();report.localRunDirectory=dir;
  fs.writeFileSync(path.join(evidence,'run-report.json'),JSON.stringify(report,null,2)+'\n');
  fs.closeSync(logFd);console.log('REPORT',JSON.stringify(report));
}
