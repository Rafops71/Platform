import json,subprocess,sys
S='/tmp/claude-0/-home-user-Platform/6d85c191-109d-5bd7-98dd-3952a76f5104/scratchpad'
OM=S+'/om/OpenMontage/remotion-composer'; D=S+'/films/en5'
lead,gap,tail=0.6,0.45,1.4
d=[float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'{D}/line{i}.wav']).decode()) for i in range(1,6)]
st=[];t=lead
for x in d: st.append(t); t+=x+gap
total=t-gap+tail
sr=subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=sample_rate','-of','csv=p=0',f'{D}/line1.wav']).decode().strip()
args=['ffmpeg','-v','error','-y']; parts=[]
def sil(s): args.extend(['-f','lavfi','-t',str(s),'-i',f'anullsrc=r={sr}:cl=mono'])
sil(lead)
for i in range(1,6):
  args.extend(['-i',f'{D}/line{i}.wav']); sil(gap if i<5 else tail)
n=11
args+=['-filter_complex',''.join(f'[{k}]' for k in range(n))+f'concat=n={n}:v=0:a=1',OM+'/public/mp/narration-en5.wav']
subprocess.check_call(args)
b=[0,st[1]-0.2,st[2]-0.2,st[3]-0.2,st[4]-0.2,total]
L4=d[3]
cuts=[
 dict(id='s1',source='',type='mp_scene',mpKind='globe',mpLabels={'title':'The Platform','caption':'A private market for physical commodities. By invitation only.'},in_seconds=b[0],out_seconds=b[1]),
 dict(id='s2',source='',type='mp_scene',mpKind='port',mpLabels={'producer':'Supply side','buyer':'Demand side','caption':'How legitimate is the counterparty?'},in_seconds=b[1],out_seconds=b[2]),
 dict(id='s3',source='',type='mp_scene',mpKind='broker',mpLabels={'memberA':'Supply side','memberB':'Demand side','operator':'Operator','caption':'All communications are channelled through the operator','agreed':'Introductions follow agreement on terms, procedures, and document protocol'},in_seconds=b[2],out_seconds=b[3]),
 dict(id='s4',source='',type='mp_scene',mpKind='benefits',mpLabels={'b1':'Discretion','b1line':'Your identity remains confidential until introduction','b2':'Clear offers','b2line':"The submitter's stated role and declared documentation.",'b3':'Facilitated Communication','b3line':'All messages are relayed through the operator, who arranges introductions.'},mpAt=[0.4,0.30*L4+0.2,0.62*L4+0.2],in_seconds=b[3],out_seconds=b[4]),
 dict(id='s5',source='',type='mp_scene',mpKind='tagline',mpLabels={'title':'Where opportunity meets discretion'},in_seconds=b[4],out_seconds=b[5])]
json.dump(dict(theme='flat-motion-graphics',cuts=cuts,overlays=[],captions=[],audio=dict(narration=dict(src='mp/narration-en5.wav',volume=1),music=dict(src='mp/music.mp3',volume=0.13,fadeInSeconds=1.5,fadeOutSeconds=2.5,loop=False))),open(OM+'/public/mp/trailer-en5.json','w'),ensure_ascii=False)
print('durations',[round(x,2) for x in d],'total',round(total,2),'bounds',[round(x,2) for x in b])
