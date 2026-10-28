#!/usr/bin/env python3
"""Chromium UI E2E via backend bridge; suitable when sandbox blocks localhost navigation.

The browser executes the actual frontend JS/CSS and interacts with the real HTTP server.
Only network transport is bridged through urllib; this is not a full networking E2E.
"""
import os, sys, json, socket, subprocess, tempfile, time, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'public'
OUT=ROOT/'artifacts/screenshots'
OUT.mkdir(parents=True,exist_ok=True)

def freeport():
 s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close();return port

class Backend:
 def __init__(self,port):
  self.port=port;self.cookies=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
 def call(self,payload):
  path=payload['url'];assert path.startswith('/api/'),path
  body=payload.get('body');hdrs=payload.get('headers') or {}
  req=urllib.request.Request(f'http://127.0.0.1:{self.port}{path}',data=body.encode('utf8') if body is not None else None,headers=hdrs,method=payload.get('method','GET'))
  try:r=self.opener.open(req,timeout=15)
  except urllib.error.HTTPError as ex:r=ex
  with r:return {'status':r.status,'body':r.read().decode('utf8'),'headers':{'content-type':r.headers.get('Content-Type','application/json')}}

def create_page(browser,port,width=1440,height=900):
 pg=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
 backend=Backend(port)
 pg.expose_function('backendFetch',backend.call)
 pg.set_content('<html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="app"></div><div id="toast" role="status"></div></body></html>')
 pg.evaluate('''window.fetch=async(url,opts={})=>{const d=await backendFetch({url:String(url),method:opts.method||'GET',body:opts.body||null,headers:opts.headers||{}});return new Response(d.body,{status:d.status,headers:d.headers})};true;''')
 pg.add_style_tag(content=(ASSETS/'styles.css').read_text())
 pg.add_script_tag(content=(ASSETS/'app.js').read_text())
 pg.wait_for_selector('input[name="email"]')
 return pg,backend

def log_in(page,email):
 page.locator('input[name="email"]').fill(email)
 page.locator('input[name="password"]').fill('demo123')
 page.locator('#login-form button[type=submit]').click()
 page.wait_for_selector('.shell, .analyst-shell',timeout=15000)

def send(page,text):
 page.locator('#send-form textarea').fill(text)
 page.locator('#send-form button[type=submit]').click()
 page.wait_for_function('document.querySelector("#send-form button[type=submit]") && !document.querySelector("#send-form button[type=submit]").disabled',timeout=20000)

with tempfile.TemporaryDirectory(prefix='nexo-browser-') as temp:
 if os.environ.get('NEXO_ISOLATED_TEST_DB') != 'true': raise RuntimeError('Browser test requires NEXO_ISOLATED_TEST_DB=true and isolated DATABASE_URL')
  port=freeport();env={**os.environ,'PORT':str(port),'USE_MASTRA':'false'}
 proc=subprocess.Popen(['node','--disable-warning=ExperimentalWarning','dist/server.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 try:
  for _ in range(50):
   try:
    urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=.5);break
   except Exception:time.sleep(.1)
  else:raise RuntimeError('server not ready')
  errors=[];results=[]
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path),headless=True,args=['--no-sandbox'])
   employee,emp_client=create_page(browser,port)
   employee.on('pageerror',lambda e:errors.append(str(e)))
   employee.screenshot(path=str(OUT/'01-login.png'))
   log_in(employee,'ana.souza@nexo.com.br')
   assert employee.locator('text=Como posso ajudar você?').count()==1
   results.append('login and empty chat')
   # Profile is Pencil frame six.
   employee.locator('[data-nav="profile"]').click();assert employee.locator('text=Meu perfil').count()>0
   employee.screenshot(path=str(OUT/'06-perfil.png'));results.append('profile')
   employee.locator('[data-nav="chat"]').click()
   send(employee,'Minha impressora está travando, só eu, tenho alternativa de usar outra impressora')
   employee.locator('[data-confirm]').first.wait_for(timeout=12000)
   employee.screenshot(path=str(OUT/'02-novo-chamado.png'))
   results.append('draft and confirmation UI')
   # Auditable decisions panel visible on the generated response.
   employee.locator('details.trace-details').last.locator('summary').click()
   employee.locator('[data-audit]').last.click()
   employee.locator('[data-audit-panel] pre').last.wait_for(timeout=10000)
   assert 'TOOL' in employee.locator('[data-audit-panel] pre').last.inner_text()
   results.append('auditable trace panel')
   # Confirm mutation and ensure draft cannot be confirmed twice through UI.
   employee.locator('[data-confirm]').first.click();employee.wait_for_timeout(300)
   assert employee.locator('[data-confirm]').count()==0
   results.append('explicit backend ticket confirmation')
   # New conversation for overdue status + handoff.
   employee.locator('[data-new]').first.click()
   employee.wait_for_timeout(350)
   employee.locator('#send-form textarea').fill('Qual o status do chamado INC-20311?')
   employee.locator('#send-form button[type=submit]').click()
   employee.wait_for_function('document.querySelector(".chat-state")?.textContent.includes("Aguardando analista")',timeout=15000)
   employee.screenshot(path=str(OUT/'03-consulta-transferencia.png'))
   results.append('overdue ticket transfers to analyst')
   # Analyst has independent authenticated session.
   analyst,analyst_client=create_page(browser,port)
   analyst.on('pageerror',lambda e:errors.append(str(e)))
   log_in(analyst,'rafael.lima@nexo.com.br')
   analyst.locator('[data-action="assume"]').wait_for(timeout=12000)
   analyst.screenshot(path=str(OUT/'04-console-transferido.png'))
   analyst.locator('[data-action="assume"]').click()
   analyst.locator('#analyst-send').wait_for(timeout=10000)
   analyst.screenshot(path=str(OUT/'05-analista-assumiu.png'))
   results.append('analyst assumes and pauses agent')
   analyst.locator('[data-action="return"]').click()
   analyst.wait_for_timeout(300)
   assert employee.locator('.composer').count()==1
   results.append('return to agent')
   # Mobile screenshot for actual responsive layout.
   mobile,mobile_client=create_page(browser,port,width=390,height=844)
   log_in(mobile,'bruno.tavares@nexo.com.br')
   mobile.screenshot(path=str(OUT/'07-mobile-chat.png'))
   dims=mobile.evaluate('''({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth})''')
   assert dims['scrollWidth']<=dims['innerWidth']+1,dims
   results.append('mobile layout no horizontal overflow')
   assert not errors,errors
   browser.close()
  report={'status':'PASS','tests':results,'count':len(results),'browser':'Chromium (Playwright, HTTP bridge)','limitation':'Sandbox blocks browser localhost navigation; Python bridge forwards browser fetch calls to real HTTP service. Pencil raw .pen has no native rendered reference.','screenshots':[p.name for p in sorted(OUT.glob('*.png'))]}
  (ROOT/'artifacts/browser-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
  print(json.dumps(report,indent=2,ensure_ascii=False))
 finally:
  proc.terminate()
  try:proc.wait(timeout=4)
  except subprocess.TimeoutExpired:proc.kill()
