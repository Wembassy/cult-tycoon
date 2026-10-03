#!/usr/bin/env python3
"""First-party animation source, generated against the actual follower bind rig.

Authoring uses world-space limb targets and two-bone IK, not guessed local Euler
axes (the left/right limbs have different local axes). No external motion data.
The six looping clips share a complete pose so cross-fades cannot leave T-pose arms.
"""
from pathlib import Path
import json, math, struct
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/assets/models/followers/fantasy_wizard_01.glb'
OUT=ROOT/'public/assets/animations/followers/follower_animation_library.glb'
IDENT=(0.,0.,0.,1.)
def add(a,b):return tuple(x+y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def mul(v,s):return tuple(x*s for x in v)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def norm(v):return math.sqrt(dot(v,v))
def unit(v):return mul(v,1/max(1e-10,norm(v)))
def cross(a,b):return(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def qm(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return(w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z)
def qi(q):return(-q[0],-q[1],-q[2],q[3])
def qr(q,v):return qm(qm(q,(*v,0.)),qi(q))[:3]
def axis(v,angle):
 s=math.sin(angle/2);return(*mul(unit(v),s),math.cos(angle/2))
def align(a,b):
 a,b=unit(a),unit(b);d=dot(a,b)
 if d<-.999999:
  v=cross(a,(1,0,0))
  if norm(v)<1e-6:v=cross(a,(0,1,0))
  return axis(v,math.pi)
 q=(*cross(a,b),1+d);return mul(q,1/max(1e-10,norm(q)))
def glb_json(path):
 b=path.read_bytes();magic,version,length=struct.unpack_from('<III',b)
 assert magic==0x46546c67 and version==2 and length==len(b)
 n,t=struct.unpack_from('<II',b,12);assert t==0x4e4f534a
 return json.loads(b[20:20+n])

def main():
 src=glb_json(SOURCE);nodes=src['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
 joint=list(dict.fromkeys(i for s in src['skins'] for i in s['joints']))
 byname={n.get('name'):i for i,n in enumerate(nodes)};remap={old:i for i,old in enumerate(joint)}
 baseq={i:tuple(n.get('rotation',IDENT)) for i,n in enumerate(nodes)}
 basep={i:tuple(n.get('translation',(0.,0.,0.))) for i,n in enumerate(nodes)}
 for n in nodes:
  assert 'matrix' not in n, 'TRS rig required'
  assert max(abs(x-1) for x in n.get('scale',(1,1,1)))<1e-5,'Unit-scale rest rig required'
 def world(i,qs,ps):
  if i not in parents:return ps[i],qs[i]
  p,q=world(parents[i],qs,ps);return add(p,qr(q,ps[i])),qm(q,qs[i])
 rest={i:world(i,baseq,basep) for i in range(len(nodes))}
 def frame(state,t):
  qs=baseq.copy();ps=basep.copy()
  def orient(name,qworld):
   i=byname[name];pq=world(parents[i],qs,ps)[1] if i in parents else IDENT
   qs[i]=qm(qi(pq),qworld)
  def turn(name,vector,degrees):orient(name,qm(axis(vector,math.radians(degrees)),rest[byname[name]][1]))
  def limb(upper,lower,end,target,preferred):
   a,b,c=(byname[n] for n in (upper,lower,end));p=world(a,qs,ps)[0]
   L1=norm(basep[b]);L2=norm(basep[c]);v=sub(target,p)
   d=min(L1+L2-.001,max(abs(L1-L2)+.001,norm(v)));direction=unit(v)
   a1=(L1*L1-L2*L2+d*d)/(2*d);h=math.sqrt(max(0,L1*L1-a1*a1))
   bend=unit(sub(preferred,mul(direction,dot(preferred,direction))))
   knee=add(add(p,mul(direction,a1)),mul(bend,h));tip=add(p,mul(direction,d))
   orient(upper,qm(align(sub(rest[b][0],rest[a][0]),sub(knee,p)),rest[a][1]))
   orient(lower,qm(align(sub(rest[c][0],rest[b][0]),sub(tip,knee)),rest[b][1]))
  wave=math.sin(2*math.pi*t)
  pelvis=byname['pelvis'];lower=-.045 if state=='Walk' else 0
  ps[pelvis]=add(basep[pelvis],(0,lower+(.006 if state=='Sleep' else .01)*wave,0))
  turn('spine_02',(0,1,0),1.3*wave if state=='Idle' else 0)
  if state=='Walk':
   for side,phase in [('l',t%1),('r',(t+.5)%1)]:
    foot=rest[byname['foot_'+side]][0]
    if phase<.5:
     z=-.18+.72*phase;y=0
    else:
     u=(phase-.5)*2;z=.18-.36*u;y=.08*math.sin(math.pi*u)
    target=(foot[0],foot[1]+y,foot[2]+z)
    limb('thigh_'+side,'calf_'+side,'foot_'+side,target,(0,0,-1))
    orient('foot_'+side,rest[byname['foot_'+side]][1])
  # Arms relaxed alongside the body in every state unless intentionally posing.
  for side,sign in [('l',1),('r',-1)]:
   x=sign*.27;y=.56;z=-.06
   if state=='Walk':z+=.14*math.cos(2*math.pi*t)*(1 if side=='l' else -1)
   if state=='Work':
    x=sign*.22;y=.79+(.10*wave if side=='r' else 0);z=-.41
   elif state=='Pray':x=sign*.055;y=1.03+.012*wave;z=-.30
   elif state=='Eat' and side=='r':
    u=(1-math.cos(2*math.pi*t))/2;x=-.10;y=.80+.37*u;z=-.36+.10*u
   elif state=='Sleep':x=sign*.12;y=.82;z=-.24
   limb('upperarm_'+side,'lowerarm_'+side,'hand_'+side,(x,y,z),(sign*.25,-1,0))
  if state=='Pray':turn('head',(1,0,0),8+2*wave)
  if state=='Work':turn('head',(1,0,0),8)
  if state=='Eat':turn('head',(1,0,0),2+2*wave)
  if state=='Sleep':
   turn('root',(1,0,0),90)
   ps[byname['root']]=add(basep[byname['root']],(0,.28,-.70))
  return qs,ps
 binbuf=bytearray();views=[];access=[];anims=[]
 def floats(values,size):
  off=len(binbuf);binbuf.extend(struct.pack('<'+'f'*len(values),*values))
  vi=len(views);views.append({'buffer':0,'byteOffset':off,'byteLength':4*len(values)})
  ai=len(access);acc={'bufferView':vi,'componentType':5126,'count':len(values)//size,'type':{1:'SCALAR',3:'VEC3',4:'VEC4'}[size]}
  if size==1:acc.update(min=[min(values)],max=[max(values)])
  access.append(acc);return ai
 for state,duration in [('Idle',2.4),('Walk',.72),('Work',1.4),('Pray',2.8),('Eat',2.0),('Sleep',3.0)]:
  count=max(20,round(duration*24));times=[i*duration/count for i in range(count+1)]
  poses=[frame(state,i/count) for i in range(count+1)]
  timeid=floats(times,1);samplers=[];channels=[]
  for old in joint:
   # Full pose tracks stop partial clips from retaining a previous gesture.
   qvalues=[];last=None
   for qs,_ in poses:
    q=qs[old]
    if last is not None and dot(q,last)<0:q=mul(q,-1)
    qvalues.extend(q);last=q
   samplers.append({'input':timeid,'output':floats(qvalues,4),'interpolation':'LINEAR'})
   channels.append({'sampler':len(samplers)-1,'target':{'node':remap[old],'path':'rotation'}})
   if nodes[old].get('name') in ['root','pelvis']:
    samplers.append({'input':timeid,'output':floats([v for _,ps in poses for v in ps[old]],3),'interpolation':'LINEAR'})
    channels.append({'sampler':len(samplers)-1,'target':{'node':remap[old],'path':'translation'}})
  anims.append({'name':state,'samplers':samplers,'channels':channels})
 outnodes=[]
 for old in joint:
  n=nodes[old];o={k:v for k,v in n.items() if k in ['name','rotation','translation','scale']}
  children=[remap[c] for c in n.get('children',[]) if c in remap]
  if children:o['children']=children
  outnodes.append(o)
 children={c for n in outnodes for c in n.get('children',[])}
 doc={'asset':{'version':'2.0','generator':'Cult Tycoon first-party IK animator v2'},'scene':0,
   'scenes':[{'nodes':[i for i in range(len(outnodes)) if i not in children]}],
   'nodes':outnodes,'animations':anims,'buffers':[{'byteLength':len(binbuf)}],'bufferViews':views,'accessors':access}
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 body=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binbuf),0x004e4942)+binbuf
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
 print(f'Generated {len(anims)} full-pose IK clips / {len(outnodes)} joints / {OUT.stat().st_size} bytes')
if __name__=='__main__':main()
