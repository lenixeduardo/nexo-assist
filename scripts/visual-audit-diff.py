#!/usr/bin/env python3
"""Compare the public production login screenshot with exported Pencil design."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

base=Path('artifacts/visual-audit')
design=Image.open(base/'pencil-login.png').convert('RGB')
production=Image.open(base/'production-login-desktop.jpg').convert('RGB')
if design.size != production.size:
 raise RuntimeError(f'Viewport size mismatch: Pencil={design.size}, production={production.size}')
a=np.asarray(design,dtype=np.int16)
b=np.asarray(production,dtype=np.int16)
delta=np.abs(a-b)
pixel_max=delta.max(axis=2)
mean_err=float(delta.mean())
within5=float(np.mean(pixel_max<=5)*100)
within10=float(np.mean(pixel_max<=10)*100)
within20=float(np.mean(pixel_max<=20)*100)
within40=float(np.mean(pixel_max<=40)*100)
regions={
 "login_left_panel":(0,0,800,900),
 "login_right_panel":(800,0,1440,900),
 "title_left":(50,90,740,345),
 "form_right":(870,30,1390,590),
}
region_stats={}
for name,(x0,y0,x1,y1) in regions.items():
 cut=delta[y0:y1,x0:x1]
 region_stats[name]={"mean_absolute_error":round(float(cut.mean()),2),"pixels_within_20_pct":round(float(np.mean(cut.max(axis=2)<=20)*100),2)}
metrics={"design_size":list(design.size),"production_size":list(production.size),"overall":{"channel_mae":round(mean_err,2),"pixel_max_difference_le_5_pct":round(within5,2),"pixel_max_difference_le_10_pct":round(within10,2),"pixel_max_difference_le_20_pct":round(within20,2),"pixel_max_difference_le_40_pct":round(within40,2)},"regions":region_stats,"limitations":"Pixel comparison uses a Pencil frame exported with OpenPencil and a Chromium screenshot in JPEG; text antialiasing, renderer differences, icon substitution, and image compression affect pixel values. This is not an authenticated full-app comparison."}
(base/'pixel-diff-metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2))
comparison=Image.new('RGB',(2880,940),'white')
comparison.paste(design,(0,40))
comparison.paste(production,(1440,40))
d=ImageDraw.Draw(comparison)
d.text((22,12),'ORIGINAL — Pencil',fill='#101828')
d.text((1462,12),'PRODUÇÃO — Vercel 1440 × 900',fill='#101828')
comparison.save(base/'comparison-login.jpg',quality=74,optimize=True)
# Highlight changed pixels red, stable pixels white
strong=(pixel_max>20)
diff=np.full((900,1440,3),255,dtype=np.uint8)
diff[strong]=[218,50,54]
Image.fromarray(diff).save(base/'difference-login.png')
print('VISUAL_DIFF_METRICS='+json.dumps(metrics,ensure_ascii=False))
