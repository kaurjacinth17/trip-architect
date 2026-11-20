// Illustrated destination scenes, ported verbatim from the reference `scene()`. Output is static SVG built
// only from curated colours in DESTS (the name is escaped), so it is safe to inject.
/* eslint-disable prefer-const */
import type { Dest } from '../engine/types';
import { esc } from '../engine/util';

export function sceneSVG(d: Pick<Dest, 'scene' | 'name'>, h = 240, id = 's'): string {const[type,c1,c2,c3]=d.scene;const W=400,H=h;
 const sky=`<defs><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity=".55"/><stop offset="1" stop-color="${c1}"/></linearGradient><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id}k)"/>`;
 const sun=(x: number,y: number,r: number)=>`<circle cx="${x}" cy="${y}" r="${r+14}" fill="#fff" opacity=".18"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fff6dc" opacity=".9"/>`;
 const hills=(y: number,col: string,op=1,amp=18)=>{let p=`M0 ${H} L0 ${y}`;for(let x=0;x<=W;x+=40)p+=` Q${x+20} ${y-amp*(((x/40)%3)?1:.4)} ${x+40} ${y}`;return `<path d="${p} L${W} ${H}Z" fill="${col}" opacity="${op}"/>`};
 let g=sky;
 if(type==='fort'){g+=sun(300,70,26)+hills(130,c3,.35,26)+`<path d="M40 ${H} L40 128 L120 104 L220 112 L330 96 L400 104 L400 ${H}Z" fill="${c3}" opacity=".7"/>`;
  for(let x=120;x<=320;x+=40)g+=`<rect x="${x}" y="${92+(x%80?6:0)}" width="16" height="30" fill="${c2}"/><rect x="${x-2}" y="${88+(x%80?6:0)}" width="20" height="5" fill="${c2}"/>`;
  g+=`<rect x="118" y="108" width="220" height="16" fill="${c2}"/>`;
  for(let x=0;x<W;x+=58){const hh=50+(x*7)%30;g+=`<rect x="${x}" y="${H-hh}" width="52" height="${hh}" fill="${c2}" opacity=".95"/><circle cx="${x+26}" cy="${H-hh}" r="14" fill="${c2}"/>`;for(let r=0;r<3;r++)g+=`<rect x="${x+8+r*14}" y="${H-hh+12}" width="8" height="12" rx="4" fill="${c3}" opacity=".55"/>`}
  g+=`<rect y="${H-6}" width="${W}" height="6" fill="${c3}"/>`}
 else if(type==='lake'){g+=sun(90,72,22)+hills(120,c3,.3,22)+`<rect y="${H*.62}" width="${W}" height="${H}" fill="url(#${id}w)"/>`;
  g+=`<rect x="150" y="${H*.62-46}" width="200" height="46" fill="#fbf3e6"/><rect x="150" y="${H*.62-50}" width="200" height="6" fill="${c3}" opacity=".5"/>`;
  for(let x=160;x<350;x+=24)g+=`<rect x="${x}" y="${H*.62-34}" width="10" height="16" rx="5" fill="${c3}" opacity=".45"/>`;
  for(const x of[170,250,330])g+=`<circle cx="${x}" cy="${H*.62-56}" r="10" fill="#fbf3e6"/><rect x="${x-1}" y="${H*.62-72}" width="2" height="8" fill="#fbf3e6"/>`;
  g+=`<rect x="150" y="${H*.62}" width="200" height="30" fill="#fbf3e6" opacity=".25"/>`;for(let i=0;i<6;i++)g+=`<rect x="${30+i*60}" y="${H*.75+i%3*12}" width="${40+i%2*30}" height="2" rx="1" fill="#fff" opacity=".35"/>`;
  g+=`<path d="M40 ${H*.86} q30 -12 60 0 l-8 8 h-44z" fill="${c3}"/>`}
 else if(type==='beach'){g+=sun(250,96,30)+`<rect y="${H*.5}" width="${W}" height="${H*.25}" fill="url(#${id}w)"/>`;for(let i=0;i<5;i++)g+=`<rect x="${20+i*80}" y="${H*.56+i%2*14}" width="50" height="2" fill="#fff" opacity=".4"/>`;
  g+=`<path d="M0 ${H*.75} Q200 ${H*.68} ${W} ${H*.76} L${W} ${H} L0 ${H}Z" fill="#f2dcae"/><path d="M0 ${H*.75} Q200 ${H*.68} ${W} ${H*.76}" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`;
  const palm=(x: number,lean: number)=>{const top=H*.24;let s=`<path d="M${x} ${H*.86} Q${x+lean*.4} ${H*.5} ${x+lean} ${top}" stroke="${c3}" stroke-width="7" fill="none" stroke-linecap="round"/>`;for(const a of[-70,-30,10,50,90,140])s+=`<path d="M${x+lean} ${top} q${Math.cos(a*Math.PI/180)*30} ${-18+Math.abs(a)/4} ${Math.cos(a*Math.PI/180)*62} ${Math.sin(a*Math.PI/180)*30+22}" stroke="${c3}" stroke-width="6" fill="none" stroke-linecap="round"/>`;return s};
  g+=palm(70,22)+palm(118,-12)+`<path d="M300 ${H*.84} h50 l-6 8 h-38z" fill="${c3}"/><path d="M325 ${H*.84} v-26 l18 22z" fill="#fff"/>`}
 else if(type==='backwater'){g+=sun(200,70,20)+hills(H*.5,c2,.35,12)+`<rect y="${H*.58}" width="${W}" height="${H}" fill="url(#${id}w)" opacity=".9"/>`;
  const palm=(x: number,lean: number,s=1)=>{const top=H*.18;let o=`<path d="M${x} ${H*.62} Q${x+lean*.3} ${H*.4} ${x+lean} ${top}" stroke="${c3}" stroke-width="${6*s}" fill="none" stroke-linecap="round"/>`;for(const a of[-60,-20,20,60,110,150])o+=`<path d="M${x+lean} ${top} q${Math.cos(a*Math.PI/180)*26*s} ${-14} ${Math.cos(a*Math.PI/180)*54*s} ${Math.sin(a*Math.PI/180)*24*s+20}" stroke="${c3}" stroke-width="${5*s}" fill="none" stroke-linecap="round"/>`;return o};
  g+=palm(30,30)+palm(80,10,.8)+palm(370,-30)+palm(330,-8,.8);
  g+=`<path d="M150 ${H*.74} Q230 ${H*.8} 300 ${H*.72} L290 ${H*.78} Q230 ${H*.84} 160 ${H*.79}Z" fill="#5b3a22"/><path d="M175 ${H*.75} Q225 ${H*.58} 275 ${H*.74}" fill="#d9b779" stroke="#8a6534" stroke-width="2"/>`;
  for(let i=0;i<5;i++)g+=`<rect x="${40+i*70}" y="${H*.86+i%2*8}" width="44" height="2" fill="#fff" opacity=".3"/>`}
 else if(type==='mountain'){g+=sun(320,60,18);const peak=(x: number,w: number,y: number,col: string,snow: number)=>`<path d="M${x-w} ${H*.78} L${x} ${y} L${x+w} ${H*.78}Z" fill="${col}"/>`+(snow?`<path d="M${x-w*.28} ${y+(H*.78-y)*.28} L${x} ${y} L${x+w*.28} ${y+(H*.78-y)*.28} l-${w*.1} 10 l-${w*.09} -8 l-${w*.09} 9z" fill="#fff"/>`:'');
  g+=peak(110,130,40,c2,1)+peak(270,150,26,c3,1)+peak(380,110,70,c2,1)+`<rect y="${H*.76}" width="${W}" height="${H}" fill="${c3}"/>`;
  for(let x=-10;x<W;x+=26){const hh=40+(x*13)%28;g+=`<path d="M${x} ${H} L${x+13} ${H-hh} L${x+26} ${H}Z" fill="#1d3b2c"/>`}}
 else if(type==='ghat'){g+=sun(90,74,26)+`<rect y="${H*.68}" width="${W}" height="${H}" fill="url(#${id}w)"/>`;for(let i=0;i<5;i++)g+=`<rect x="${20+i*76}" y="${H*.78+i%2*10}" width="40" height="2" fill="#fff" opacity=".35"/>`;
  for(let i=0;i<6;i++)g+=`<rect x="${120-i*6}" y="${H*.68-8-i*8}" width="${W-120+i*12}" height="8" fill="${c2}" opacity="${.65+i*.05}"/>`;
  const tmp=(x: number,s: number)=>`<path d="M${x-22*s} ${H*.68-56} L${x-14*s} ${H*.68-56-50*s} Q${x} ${H*.68-62-80*s} ${x+14*s} ${H*.68-56-50*s} L${x+22*s} ${H*.68-56}Z" fill="${c3}"/><rect x="${x-1}" y="${H*.68-66-82*s}" width="2" height="12" fill="${c3}"/><path d="M${x+1} ${H*.68-66-82*s} l10 4 l-10 4z" fill="#ff9d3b"/>`;
  g+=tmp(210,1)+tmp(300,.75)+tmp(360,.6)+`<rect x="150" y="${H*.68-60}" width="250" height="10" fill="${c3}"/>`;
  for(let i=0;i<9;i++)g+=`<circle cx="${30+i*42}" cy="${H*.9-i%2*6}" r="3" fill="#ffcf6b"/>`;g+=`<path d="M40 ${H*.82} q40 -10 80 0 l-10 8 h-60z" fill="#3a1f14"/>`}
 else if(type==='river'){g+=sun(200,56,18)+`<path d="M0 ${H*.3} L150 ${H*.85} L0 ${H}Z" fill="${c3}"/><path d="M${W} ${H*.26} L250 ${H*.85} L${W} ${H}Z" fill="${c3}"/><path d="M0 ${H*.5} L130 ${H*.88} L0 ${H}Z" fill="#1d3b2c"/><path d="M${W} ${H*.46} L270 ${H*.88} L${W} ${H}Z" fill="#1d3b2c"/>`;
  g+=`<path d="M150 ${H*.85} Q200 ${H*.82} 250 ${H*.85} L${W} ${H} L0 ${H}Z" fill="url(#${id}w)"/><path d="M40 ${H*.42} Q200 ${H*.6} 360 ${H*.4}" stroke="#fbf3e6" stroke-width="3" fill="none"/><rect x="36" y="${H*.32}" width="8" height="${H*.14}" fill="#fbf3e6"/><rect x="356" y="${H*.3}" width="8" height="${H*.14}" fill="#fbf3e6"/>`;
  for(let x=60;x<350;x+=20){const y=H*.42+Math.sin((x-40)/320*Math.PI)*H*.09;g+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${H*.52}" stroke="#fbf3e6" stroke-width="1.5" opacity=".8"/>`}
  g+=`<rect x="40" y="${H*.52}" width="320" height="4" fill="#fbf3e6"/><path d="M185 ${H*.92} q15 -8 30 0 l-4 5 h-22z" fill="#e8915f"/>`}
 else if(type==='colonial'){g+=`<rect y="${H*.86}" width="${W}" height="${H*.14}" fill="${c3}"/>`;const cols=['#fbe39a','#f6f0e4','#f3c9b0','#fbe39a'];
  for(let i=0;i<4;i++){const x=i*102,hh=130+(i%2)*24;g+=`<rect x="${x}" y="${H*.86-hh}" width="100" height="${hh}" fill="${cols[i]}"/><rect x="${x}" y="${H*.86-hh}" width="100" height="8" fill="#fff" opacity=".7"/><rect x="${x}" y="${H*.86-hh+8}" width="6" height="${hh-8}" fill="#000" opacity=".06"/>`;
   for(let r=0;r<2;r++)for(let c=0;c<3;c++)g+=`<rect x="${x+14+c*28}" y="${H*.86-hh+26+r*46}" width="16" height="30" fill="${c3}" opacity=".85"/><rect x="${x+12+c*28}" y="${H*.86-hh+56+r*46}" width="20" height="3" fill="#fff"/>`}
  for(let i=0;i<26;i++)g+=`<circle cx="${(i*37)%400}" cy="${H*.86-30-(i*17)%60}" r="${5+(i%3)*2}" fill="${c2}" opacity=".85"/>`;g+=`<path d="M0 ${H*.86} h${W}" stroke="#fff" stroke-width="2" opacity=".5"/>`}
 return `<svg class="scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of ${esc(d.name)}">${g}</svg>`}
