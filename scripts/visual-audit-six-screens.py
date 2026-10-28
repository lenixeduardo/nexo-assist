#!/usr/bin/env python3
"""Compare available production screenshots with their Pencil frames; never grade missing states."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
base=Path('artifacts/visual-audit')
pairs=[
 ('01-login','pencil-login.png','production-login-desktop.jpg'),
 ('02-employee-chat','pencil-new-ticket.png','authenticated/02-employee-chat.png'),
 ('03-employee-ticket-query','pencil-ticket-status.png','authenticated/03-employee-ticket-query.png'),
 ('04-analyst-queue','pencil-analyst-queue.png','authenticated/04-analyst-queue.png'),
 ('05-analyst-active','pencil-analyst-active.png','authenticated/05-analyst-active.png'),
 ('06-employee-profile','pencil-profile.png','authenticated/06-employee-profile.png'),
]
results=[]
for name,design_name,actual_name in pairs:
 dp=base/design_name;ap=base/actual_name
 if not dp.exists() or not ap.exists():
  results.append({'screen':name,'status':'not_tested','reason':'Missing Pencil export or actual production screenshot','design_exists':dp.exists(),'production_exists':ap.exists()})
  continue
 try:
  design=Image.open(dp).convert('RGB');actual=Image.open(ap).convert('RGB')
  if design.size!=actual.size:
   results.append({'screen':name,'status':'not_comparable','design_size':design.size,'production_size':actual.size});continue
  d=np.abs(np.asarray(design,dtype=np.int16)-np.asarray(actual,dtype=np.int16))
  maxd=d.max(axis=2)
  metric={'screen':name,'status':'compared','size':list(design.size),'channel_mae':round(float(d.mean()),2),'pixels_within_20_pct':round(float(np.mean(maxd<=20)*100),2),'pixels_within_40_pct':round(float(np.mean(maxd<=40)*100),2)}
  results.append(metric)
  side=Image.new('RGB',(design.width*2,design.height+40),'white')
  side.paste(design,(0,40));side.paste(actual,(design.width,40))
  draw=ImageDraw.Draw(side);draw.text((16,12),'PENCIL — '+name,fill='black');draw.text((design.width+16,12),'PRODUCTION — '+name,fill='black')
  side.save(base/('comparison-'+name+'.jpg'),quality=80)
 except Exception as e:
  results.append({'screen':name,'status':'error','reason':str(e)[:180]})
summary={'screens':results,'compared_count':sum(x['status']=='compared' for x in results),'total':len(pairs),'limitations':'Pixel differences do not independently verify semantic screen-state equivalence. The active analyst screen requires an assigned active ticket. Screenshots may show different data than Pencil mockups; raw pixel similarity is not a UX acceptance score.'}
(base/'six-screen-comparison.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print('SIX_SCREEN_COMPARISON='+json.dumps(summary,ensure_ascii=False))
if any(x['status']=='error' for x in results):raise SystemExit(1)
