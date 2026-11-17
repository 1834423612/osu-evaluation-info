"""Geometry adapters for manually inspected OSU Engineering and Music grids.

Only registered layouts are accepted. Superscripts cannot become course digits;
semester totals, conditional credit alternatives and year boundaries stay distinct.
"""
import re
from html_schedule_adapter import candidate
from pdf_adapter import numeric
from grid_adapter import credits


def clean(cells, minimum=0):
    return ' '.join(c['text'].strip() for c in cells if c.get('height',99)>=minimum).strip().lstrip('_ ').strip()


def structure_music(evidence, record, source):
    blocks=[b for b in evidence['blocks'] if b['page']==1]
    semesters=[]; pair=None; credit_x=[]; closed=False; total_parts=['','']; body_height=0
    for block in blocks:
        cells=block.get('cells',[])
        if 'Autumn Semester' in block['text'] and 'Spring Semester' in block['text']:
            cr=[c for c in cells if c['text'].strip()=='Cr']
            if len(cr)!=2:raise ValueError('Music credit columns changed')
            year=len(semesters)//2+1
            if year>4:raise ValueError('Unexpected music year')
            if pair:
                for side in range(2):pair[side]['credits']=numeric(total_parts[side])
            credit_x=[c['x'] for c in cr];body_height=min(c['height'] for c in cr)
            pair=[{'label':f'Year {year}: {season}','credits':None,'entries':[]} for season in ('Autumn','Spring')]
            semesters.extend(pair);closed=False;total_parts=['',''];continue
        if pair is None:continue
        if 'Total Hours' in block['text']:closed=True
        for side in range(2):
            low=0 if side==0 else credit_x[0]+12
            high=credit_x[side]-8
            text=clean([c for c in cells if low<=c['x']<high],body_height*.8)
            amount=clean([c for c in cells if abs(c['x']-credit_x[side])<8],body_height*.8).replace(' ','')
            if closed:
                if re.fullmatch(r'\d{1,2}(?:[-–]\d{0,2})?',amount):total_parts[side]+=amount
                continue
            if not text and not amount:continue
            if text:
                if text=='Total Hours':continue
                # Wrapped course names continue the preceding row; all other rows
                # retain generic GE/ensemble/language placeholders verbatim.
                if not amount and pair[side]['entries'] and not re.match(r'^(?:Music|GENED|ASC|Ensemble|Large|World|Foundational|Natural|Writing|Citizenship|Second|University|PSYCH|EDUTL|CSE|GE)',text,re.I):
                    pair[side]['entries'][-1]['evidence']+=' '+text
                else:
                    pair[side]['entries'].append({'evidence':text+(' ['+amount+' credits]' if amount else ''),'credits':numeric(amount)})
            elif amount and pair[side]['entries']:
                pair[side]['entries'][-1]['evidence']+=' [alternative credits: '+amount+']'
                pair[side]['entries'][-1]['credits']=None
    if pair:
        for side in range(2):pair[side]['credits']=numeric(total_parts[side])
    if len(semesters)!=8 or not all(s['entries'] for s in semesters):raise ValueError('Music grid incomplete')
    result=candidate(semesters,record,source,0,None);result['source']['mediaType']='application/pdf'
    return [result]


def structure_engineering(evidence,record,source):
    blocks=[b for b in evidence['blocks'] if b['page']==1]
    header=next((i for i,b in enumerate(blocks) if re.fullmatch(r'Year Autumn Spring',b['text'])),None)
    end=next((i for i,b in enumerate(blocks) if re.match(r'Total [Hh]ours to complete',b['text'])),None)
    if header is None or end is None:raise ValueError('Engineering table boundary changed')
    width=blocks[header]['width']; split=width*.55; year_x=next(c['x'] for c in blocks[header]['cells'] if c['text']=='Year')
    starts=source['yearStarts'];bounds=[];markers=[]
    for i in range(header+1,end):
        cells=blocks[i]['cells']
        markers.extend(int(c['text']) for c in cells if abs(c['x']-year_x)<20 and re.fullmatch('[1-4]',c['text']) and c['height']>9)
        left=clean([c for c in cells if year_x+35<c['x']<split],8)
        if len(bounds)<4 and re.match(re.escape(starts[len(bounds)])+r'\b',left,re.I):bounds.append(i)
    if len(bounds)!=4 or markers!=[1,2,3,4]:raise ValueError('Engineering year anchors changed')
    semesters=[]
    for year,(start,stop) in enumerate(zip(bounds,bounds[1:]+[end]),1):
        pair=[{'label':f'Year {year}: {season}','credits':None,'entries':[]} for season in ('Autumn','Spring')]
        for block in blocks[start:stop]:
            for side in range(2):
                value=clean([c for c in block['cells'] if c['x']>year_x+35 and (c['x']<split)==(side==0)],8)
                if not value or re.search(r'Exit Survey|via email',value,re.I):continue
                if re.fullmatch(r'\d+(?:\.\d+)?\s*hr',value):pair[side]['credits']=credits(value);continue
                if re.search(r'\bhrs?\s*$',value):pair[side]['entries'].append({'evidence':value,'credits':credits(value)})
                elif value.startswith('(') and pair[side]['entries']:pair[side]['entries'][-1]['evidence']+=' '+value
        semesters.extend(pair)
    result=candidate(semesters,record,source,0,None);result['source']['mediaType']='application/pdf'
    return [result]

def checked_pdf(semesters, record, source):
    if len(semesters)!=8 or not all(s['entries'] for s in semesters):
        raise ValueError('Inspected PDF semester structure changed')
    expected=source.get('expectedEntries')
    if expected and [len(s['entries']) for s in semesters]!=expected:
        raise ValueError('Inspected PDF row counts changed')
    result=candidate(semesters,record,source,0,None)
    result['source']['mediaType']='application/pdf'
    return [result]


def structure_nursing(evidence,record,source):
    semesters=[];pair=None
    for block in evidence['blocks']:
        cells=block.get('cells',[])
        heading=re.match(r'Year ([1-4]): Fall Semester Coursework',block['text'])
        if heading:
            year=int(heading[1])
            if year!=len(semesters)//2+1 or f'Year {year}: Spring Semester Coursework' not in block['text']:
                raise ValueError('Nursing year headers changed')
            pair=[{'label':f'Year {year}: {season}','credits':None,'entries':[]} for season in ('Autumn','Spring')]
            semesters.extend(pair);continue
        if 'Fulfills a General Education requirement' in block['text']:break
        if pair is None:continue
        for side in range(2):
            left=49 if side==0 else 337
            value=clean([c for c in cells if left-1<=c['x']<(310 if side==0 else 605) and c['height']>=7])
            amount=clean([c for c in cells if (25<=c['x']<=35 if side==0 else 314<=c['x']<330)])
            value=re.sub(r'^N(?=\d{4})','NURSING ',value).rstrip('*#^+')
            starts=re.match(r'^(?:NURSING \d|Nursing \d|Human Nutrition \d|Microbiology \d|Statistics \d|General Education|Elective Support|.* Prerequisite)',value)
            if value and starts:pair[side]['entries'].append({'evidence':value,'credits':numeric(amount)})
            elif value and pair[side]['entries']:pair[side]['entries'][-1]['evidence']+=' '+value
            elif amount and pair[side]['entries']:pair[side]['entries'][-1]['credits']=numeric(amount)
    return checked_pdf(semesters,record,source)


def structure_knowlton(evidence,record,source):
    semesters=[];pair=None;closed=[False,False]
    for block in evidence['blocks']:
        cells=block.get('cells',[])
        heading=re.fullmatch(r'Year ([1-4])',block['text'])
        if heading:
            year=int(heading[1])
            if year!=len(semesters)//2+1:raise ValueError('Knowlton year sequence changed')
            pair=[{'label':f'Year {year}: {season}','credits':None,'entries':[]} for season in ('Autumn','Spring')]
            semesters.extend(pair);closed=[False,False];continue
        if pair is None or re.fullmatch(r'Autumn Spring',block['text']):continue
        for side in range(2):
            if closed[side]:continue
            low=0 if side==0 else 310; high=280 if side==0 else 565
            value=clean([c for c in cells if low<=c['x']<high]).replace('*','')
            amount=clean([c for c in cells if high<=c['x']<(310 if side==0 else 610)])
            if not value and numeric(amount):pair[side]['credits']=numeric(amount);closed[side]=True;continue
            if value and numeric(amount):pair[side]['entries'].append({'evidence':value,'credits':numeric(amount)})
            elif value and pair[side]['entries']:pair[side]['entries'][-1]['evidence']+=' '+value
    return checked_pdf(semesters,record,source)


def structure_public_health(evidence,record,source):
    semesters=[];current=None
    for block in evidence['blocks']:
        if block['page']!=source['samplePage']:continue
        if 'Total Minimum Credit Hours' in block['text']:break
        cells=block.get('cells',[])
        label=clean([c for c in cells if c['x']<120])
        heading=re.fullmatch(r'(Autumn|Spring) ([1-4])',label)
        if heading:
            current={'label':f'Year {heading[2]}: {heading[1]}','credits':None,'entries':[]};semesters.append(current)
        if current is None:continue
        total=re.search(r'\((\d+(?:-\d+)?)',label)
        if total:current['credits']=numeric(total[1])
        value=clean([c for c in cells if 120<=c['x']<465])
        amount=clean([c for c in cells if 465<=c['x']<500])
        if value:current['entries'].append({'evidence':value,'credits':numeric(amount)})
    return checked_pdf(semesters,record,source)
