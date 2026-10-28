"""Live Annex A acceptance. Uses real deployment sessions; never fakes model runs.
Credentials: NEXO_EMPLOYEE_PASSWORD, NEXO_ANALYST_PASSWORD.
Writes synthetic conversations/drafts and intentionally confirms fixture updates/reopening.
"""
import os,json,urllib.request,urllib.error,http.cookiejar,datetime,sys
BASE=os.environ.get('NEXO_BASE_URL','https://nexo-assist-self.vercel.app').rstrip('/')
REQUIRE_MASTRA=os.environ.get('NEXO_REQUIRE_MASTRA','true')=='true'
report={'requiresMastra':REQUIRE_MASTRA,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':BASE,'checks':[],'traces':[],'conversations':[]}
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
a,h=client(),client()
def check(name,condition,detail=None):
 report['checks'].append(dict(name=name,passed=bool(condition),detail=detail));print(('PASS ' if condition else 'FAIL ')+name,flush=True)
 if not condition:raise AssertionError(name+': '+str(detail))
def request(c,path,method='GET',body=None):
 q=urllib.request.Request(BASE+path,json.dumps(body).encode() if body is not None else None,{'Content-Type':'application/json','Origin':BASE},method=method)
 try:
  with c.open(q,timeout=100) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def api(c,path,method='GET',body=None):
 status,data=request(c,path,method,body)
 if status not in [200,201]:raise AssertionError(path+': '+json.dumps({'status':status,'error':data.get('error')}))
 return data
def conversation():
 c=api(a,'/api/conversations','POST',{})['conversation']['id'];report['conversations'].append(c);return c
def send(c,text):
 data=api(a,'/api/conversations/'+c+'/messages','POST',{'text':text})
 if data.get('response'):
  trace=data['response']['trace'];report['traces'].append({'traceId':trace.get('traceId'),'intent':trace['intent'],'decision':trace['decision'],'mode':trace['extractedFacts'].get('agentMode')})
  if REQUIRE_MASTRA:check('real Mastra response',trace['extractedFacts'].get('agentMode')=='mastra-readonly-tools-with-deterministic-domain',trace)
  else:check('demonstration response without runtime failure',not trace['extractedFacts'].get('errorCategory'),trace)
 return data
def audit(c):
 runs=api(a,'/api/conversations/'+c+'/audit')['traces'];model=[r for r in runs if r['run']['mode']==('mastra' if REQUIRE_MASTRA else 'deterministic')]
 check('audited agent run completed',bool(model) and all(r['run']['status']=='COMPLETED' for r in model),[r['run'] for r in model])
 if REQUIRE_MASTRA:check('model calls and token usage persisted',all(any(e['kind']=='MODEL_CALL' for e in r['events']) and any(e['kind']=='MODEL_RESULT' and e.get('output',{}).get('usage') for e in r['events']) for r in model))
 return runs
try:
 for c,email,key in [(a,'ana.souza@nexo.com.br','NEXO_EMPLOYEE_PASSWORD'),(h,'rafael.lima@nexo.com.br','NEXO_ANALYST_PASSWORD')]:
  api(c,'/api/login','POST',{'email':email,'password':os.environ[key]})
 check('employee and analyst authenticated',True)
 tickets=api(a,'/api/tickets')['tickets'];check('demo fixtures available',{'INC-20311','INC-20150','INC-19010','REQ-10442'}.issubset({t['id'] for t in tickets}))
 check('real other-owner ticket denied',request(a,'/api/tickets/INC-30002')[0]==404)
 c=conversation();d=send(c,'Qual o status dos meus chamados?');check('status uses real scoped tools',d['response']['trace']['intent']=='TICKET_STATUS' and (not REQUIRE_MASTRA or any(x['name'].startswith('mastra.') for x in d['response']['trace']['actions'])));audit(c)
 if os.environ.get('NEXO_SMOKE_ONLY')=='true':raise SystemExit(0)
 c=conversation();d=send(c,'Como resolver o erro 809 da VPN no Windows 11?');check('KB platform restriction',d['response']['trace']['intent']=='KNOWLEDGE_QUESTION' and ('Windows 11' in d['response']['text']) and 'reinstale o cliente' not in d['response']['text'].lower());audit(c)
 for text,intent in [('Preciso consultar meu salário com RH','OUT_OF_SCOPE'),('zqxv 843 sem sentido','UNCLEAR')]:
  c=conversation();d=send(c,text);check('scope or low-confidence policy',d['response']['trace']['intent']==intent);audit(c)
 c=conversation();d=send(c,'Meu notebook lento após atualização Windows, só eu, tenho alternativa');check('duplicate prevented','NO_DUPLICATE' in d['response']['trace']['policyRules']);audit(c)
 c=conversation();before=api(a,'/api/tickets/INC-20311')['ticket'];d=send(c,'Atualizar INC-20311: verifiquei o driver e o notebook continua lento nesta validação.');draft=api(a,'/api/drafts/'+d['response']['ui']['draftId'])['draft'];check('update requires confirmation',api(a,'/api/tickets/INC-20311')['ticket']['description']==before['description']);result=api(a,'/api/drafts/'+draft['id']+'/confirm','POST',{'version':draft['version'],'idempotencyKey':'acceptance-'+c});check('update confirmed',result['ticket']['version']==before['version']+1);audit(c)
 c=conversation();d=send(c,'Reabrir INC-20150: minha conta SAP voltou a ficar bloqueada nesta validação.');draft=api(a,'/api/drafts/'+d['response']['ui']['draftId'])['draft'];check('recent resolved ticket proposes reopen',draft['action']=='REOPEN');result=api(a,'/api/drafts/'+draft['id']+'/confirm','POST',{'version':draft['version'],'idempotencyKey':'reopen-'+c});check('reopen confirmed',result['ticket']['status']=='ABERTO');audit(c)
 c=conversation();d=send(c,'Reabrir INC-19010: Outlook voltou a travar ao abrir anexos.');check('expired reopen refused',d['response']['trace']['decision']=='REFUSE');audit(c)
 for text in ['Meu software parou para minha equipe e ninguém consegue trabalhar','Qual o status do chamado INC-20298?','Quero falar com um analista']:
  c=conversation();d=send(c,text);check('handoff and paused agent',d['conversation']['state']=='WAITING_ANALYST');paused=send(c,'Complemento durante atendimento humano');check('no model response while paused',paused.get('paused') is True);audit(c)
  api(h,'/api/analyst/conversations/'+c+'/assume','POST',{});api(h,'/api/analyst/conversations/'+c+'/message','POST',{'text':'Aceitação Anexo A: recebido pelo analista.'});api(h,'/api/analyst/conversations/'+c+'/return','POST',{});check('analyst returns to agent',api(a,'/api/conversations/'+c)['conversation']['state']=='AGENT_ACTIVE')
except SystemExit:pass
except Exception as e:report['error']=str(e);print('ERROR',str(e),flush=True)
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();path=os.environ.get('NEXO_REPORT_PATH','/tmp/nexo-live-annex-a.json');open(path,'w').write(json.dumps(report,ensure_ascii=False,indent=2));print('RESULT',sum(x['passed'] for x in report['checks']),'/',len(report['checks']),flush=True)
 if report.get('error'):sys.exit(1)
