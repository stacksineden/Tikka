# Synthesised sound effects for the WhatsApp status video (app/dev/status-video), mixed to its timeline.
# Usage: python3 scripts/status-video-sfx.py sfx.wav   (needs numpy). Cue times match the page; change both together.
import numpy as np, wave, sys
SR=48000; L=59.0
rng=np.random.default_rng(7)
t_=lambda d: np.arange(int(SR*d))/SR
def env(n,a=0.005,r=None,curve=4):
    t=np.arange(n)/SR; d=n/SR
    e=np.minimum(1,t/max(a,1e-4)); 
    e*=np.exp(-curve*t/d) if r is None else np.clip(1-(t-(d-r))/r,0,1)**2
    return e
def lp(x,k):  # simple moving-average low-pass
    if k<=1: return x
    return np.convolve(x,np.ones(k)/k,'same')
def pop(f=900):
    t=t_(0.09); fr=f*(1+1.6*np.exp(-t*60)); ph=2*np.pi*np.cumsum(fr)/SR
    return np.sin(ph)*env(len(t),0.002,curve=9)*0.55
def tap():
    t=t_(0.05); return (np.sin(2*np.pi*1800*t)*0.3+rng.normal(0,1,len(t))*0.15)*env(len(t),0.001,curve=14)
def tick():
    t=t_(0.03); return np.sin(2*np.pi*3200*t)*env(len(t),0.0005,curve=18)*0.35
def whoosh(d=0.6,up=False):
    n=int(SR*d); x=rng.normal(0,1,n)
    out=np.zeros(n); seg=n//24
    for i in range(24):
        k=int(40-34*(i/23)) if up else int(6+30*abs(i/23-0.5)*2)
        a=i*seg; b=n if i==23 else (i+1)*seg
        out[a:b]=lp(x,max(2,k))[a:b]
    t=np.arange(n)/n; e=np.sin(np.pi*t)**2
    return out*e*0.6
def rip():
    d=0.32; n=int(SR*d); x=rng.normal(0,1,n)
    crackle=(rng.random(n)<0.04)*rng.normal(0,1,n)*2
    y=lp(x,3)+crackle; t=np.arange(n)/n
    return y*np.clip(t*12,0,1)*np.exp(-t*2.5)*0.35
def bell(freqs,d=1.2,amp=0.35,curve=3.5):
    t=t_(d); y=sum(np.sin(2*np.pi*f*t)*w for f,w in freqs)
    return y*env(len(t),0.003,curve=curve)*amp
def ding(): return bell([(1318,1),(2637,0.35),(3951,0.12)],1.3,0.3)
def chime(): # success: two rising notes
    a=bell([(784,1),(1568,0.3)],0.7,0.28); b=bell([(1175,1),(2350,0.3)],1.1,0.28)
    out=np.zeros(int(SR*1.4)); out[:len(a)]+=a; o=int(SR*0.13); out[o:o+len(b)]+=b; return out
def door():
    a=bell([(988,1),(1976,0.25)],0.9,0.22); b=bell([(784,1),(1568,0.25)],1.2,0.22)
    out=np.zeros(int(SR*1.5)); out[:len(a)]+=a; o=int(SR*0.22); out[o:o+len(b)]+=b; return out
def sparkle():
    out=np.zeros(int(SR*1.0))
    for i in range(9):
        f=2400+rng.random()*2600; s=bell([(f,1)],0.35,0.09,6); o=int(SR*i*0.07); out[o:o+len(s)]+=s
    return out
def thud():
    t=t_(0.35); fr=110*(1+np.exp(-t*30)); return np.sin(2*np.pi*np.cumsum(fr)/SR)*env(len(t),0.002,curve=8)*0.5
def kaching():
    c=np.zeros(int(SR*1.3))
    cl=(rng.normal(0,1,int(SR*0.05))*env(int(SR*0.05),0.001,curve=12))*0.3; c[:len(cl)]+=cl
    b=bell([(2093,1),(3136,0.6),(4186,0.3)],1.1,0.26,3); o=int(SR*0.06); c[o:o+len(b)]+=b; return c
def swell(d=1.6):
    t=t_(d); y=sum(np.sin(2*np.pi*f*t) for f in (262,330,392,523))/4
    e=np.sin(np.pi*np.clip(t/d,0,1))**1.5; return y*e*0.16
def rattle():
    out=np.zeros(int(SR*0.45))
    for i in range(6):
        s=tap()*0.6; o=int(SR*i*0.07); out[o:o+len(s)]+=s
    return out

cues=[]
add=lambda at,snd,g=1.0: cues.append((at,snd,g))
# hook: views, no customers
for a in (0.35,0.75,1.15,1.55): add(a,pop(850+a*200))
add(2.3,tap(),0.8); add(2.95,thud(),0.9)
# hook: the no-show
add(4.95,whoosh(0.8),0.8); add(5.3,pop(1000))
for i in range(7): add(5.9+i*0.27,tick())
add(8.0,thud(),0.9)
# Tikka fixes both
add(8.85,whoosh(0.6,up=True),0.9); add(9.2,ding())
# chapter 01
add(11.9,whoosh(0.5),0.7); add(12.15,tap(),0.8)
# share, free to claim
add(13.5,whoosh(0.5),0.6); add(14.2,pop(1100),0.8); add(14.5,whoosh(0.6,up=True),0.7)
for i in range(4): add(15.0+i*0.13,pop(900+i*150),0.8)
# claim on WhatsApp
add(17.95,whoosh(0.5),0.6); add(18.6,rattle(),0.9); add(19.1,rip()); add(19.45,sparkle()); add(21.45,ding(),0.9)
# they come in; leads
add(22.95,door()); add(23.55,pop(1200),0.7); add(24.3,whoosh(0.45),0.6)
for i in range(3): add(25.7+i*0.18,pop(1000+i*80),0.6)
# chapter 02
add(26.9,whoosh(0.5),0.7); add(27.15,tap(),0.8)
# free website
add(28.6,pop(1000),0.8); add(28.75,whoosh(0.5),0.6); add(30.0,whoosh(1.2),0.4)
# booking and deposit
add(34.15,pop(1100),0.8); add(35.0,tap()); add(35.8,tap()); add(36.4,whoosh(0.45),0.6); add(37.7,tap()); add(38.75,chime())
# owner side: bookings, money
add(40.05,whoosh(0.45),0.6)
for i in range(3): add(40.3+i*0.2,pop(1000+i*90),0.6)
add(41.9,kaching(),0.9)
# more people in
add(45.05,whoosh(0.5),0.6)
for i in range(5): add(45.3+i*0.15,pop(1100+i*90),0.7)
for i in range(9): add(46.3+i*0.1,tick(),0.6)
# promise and end card
add(50.1,swell(2.2),0.9); add(55.6,whoosh(0.5,up=True),0.6); add(55.75,ding()); add(56.3,swell(2.0),0.8)

mix=np.zeros(int(SR*L))
for at,s,g in cues:
    o=int(at*SR); s=s[:len(mix)-o]; mix[o:o+len(s)]+=s*g
peak=np.abs(mix).max(); mix=mix/peak*0.7
st=np.stack([mix,mix],1)
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype(np.int16).tobytes())
print("cues",len(cues),"peak",peak)
