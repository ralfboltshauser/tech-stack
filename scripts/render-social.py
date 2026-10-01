#!/usr/bin/env python3
"""Render social artwork. Run: uv run --with pillow --with fonttools --with brotli python scripts/render-social.py
Requires ImageMagick for the local SVG icons. Outputs are committed; deployment does not need these dependencies.
"""
from pathlib import Path
from io import BytesIO
import json, subprocess
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parents[1]
S=2
INK='#202124'; MUTED='#74747e'; PAPER='#fafafa'; LINE='#e2e2e7'; ACCENT='#6664b4'

def font(size,weight='Regular'):
    f=TTFont(ROOT/f'assets/fonts/Geist-{weight}.woff2'); f.flavor=None
    stream=BytesIO(); f.save(stream); stream.seek(0)
    return ImageFont.truetype(stream,round(size*S))
F={size:font(size) for size in [18,22,24,28,30]}
B={size:font(size,'SemiBold') for size in [24,26,74,82]}
tools={t['id']:t for t in json.loads((ROOT/'ecosystem.json').read_text())['tools']}

def render(height,name,square=False):
    im=Image.new('RGB',(1200*S,height*S),PAPER);draw=ImageDraw.Draw(im)
    def text(x,y,value,f,color=INK):draw.text((x*S,y*S),value,font=f,fill=color,anchor='lt')
    def line(points,color=LINE,width=1):draw.line([(x*S,y*S) for x,y in points],fill=color,width=width*S)
    def box(x,y,w,h,r=12,fill='white',outline=LINE):draw.rounded_rectangle((x*S,y*S,(x+w)*S,(y+h)*S),r*S,fill=fill,outline=outline,width=S)
    def centered(y,value,f,color=INK):text((1200-draw.textlength(value,font=f)/S)/2,y,value,f,color)
    for x in range(24,1200,24):
        for y in range(24,height,24):draw.ellipse((x*S,y*S,x*S+1,y*S+1),fill='#dedee4')
    # Solid header field keeps the title exceptionally clear at thumbnail size.
    draw.rectangle((0,0,1200*S,(300 if not square else 410)*S),fill=PAPER)
    if square:
        centered(80,'tech.ralfboltshauser.com',F[22],MUTED)
        centered(150,'Ralf’s',B[82]);centered(248,'Tech Stack+',B[82])
        centered(363,'The tools, people, and ideas behind what I build.',F[28],MUTED)
    else:
        text(72,58,'tech.ralfboltshauser.com',F[22],MUTED)
        text(72,114,'Ralf’s Tech Stack+',B[74])
        text(74,218,'The tools, people, and ideas behind what I build.',F[28],MUTED)
    groups=[('BUILD',['next','shadcn'],'#347e6b'),('SHIP',['vercel','cloudflare'],'#416fc1'),('WORK',['codex','github'],'#8963ac')]
    # Use actual labels and icons from the collection, not invented product UI.
    groups[0][1][0]=next(t['id'] for t in tools.values() if t['name']=='Next.js')
    for index,(label,ids,color) in enumerate(groups):
        x,y,w=(180,462+index*204,840) if square else (72+index*362,330,332)
        box(x,y,w,174)
        draw.rounded_rectangle(( (x+20)*S,(y+24)*S,(x+27)*S,(y+31)*S),2*S,fill=color)
        text(x+38,y+17,label,F[18],MUTED)
        for j,tid in enumerate(ids):
            t=tools[tid];cw=(w-54)/2;cx=x+18+j*(cw+18);cy=y+57
            box(cx,cy,cw,94,8,fill='#fdfdfd')
            path=ROOT/t['icon']
            if path.suffix=='.svg':
                content=subprocess.check_output(['magick','-background','none',str(path),'-resize','80x80','png:-'])
                icon=Image.open(BytesIO(content)).convert('RGBA')
            else:icon=Image.open(path).convert('RGBA')
            icon_size=42 if square else 32
            icon.thumbnail((icon_size*S,icon_size*S),Image.Resampling.LANCZOS)
            ix=cx+20 if square else cx+16;iy=cy+26 if square else cy+16
            im.paste(icon,(round(ix*S),round(iy*S)),icon)
            text(cx+82,cy+32,t['name'],F[28]) if square else text(cx+16,cy+58,t['name'],F[18])
        if index<2 and not square:
            line([(x+w,y+88),(x+w+30,y+88)],'#b9b7ce',2)
    if square:centered(1124,'An interactive map of my everyday stack.',F[22],MUTED)
    else:text(74,height-62,'Software, workspace & sources worth knowing.',F[18],MUTED)
    im.resize((1200,height),Image.Resampling.LANCZOS).save(ROOT/'assets'/name,optimize=True)

render(630,'social-card-v2.png')
render(600,'social-card-x-v2.png')
render(1200,'social-card-square-v2.png',True)
