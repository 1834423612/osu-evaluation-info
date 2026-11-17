"""Adapters for inspected paired-year HTML tables and year/season lists."""
import re
from html.parser import HTMLParser
from grid_adapter import credits

class Node:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def text(self, omit=()):
        if self.tag in omit: return ''
        return ' '.join(' '.join(c.text(omit) if isinstance(c,Node) else c for c in self.children).split())
    def lines(self):
        def raw(n):
            if isinstance(n,str):return n
            if n.tag=='br':return '\n'
            return ''.join(raw(c) for c in n.children)
        return [' '.join(t.split()) for t in raw(self).splitlines() if t.strip()]
    def walk(self):
        if self.tag in ('nav', 'aside', 'footer', 'script', 'style') or 'sidebar' in self.attrs.get('class', ''): return
        yield self
        for child in self.children:
            if isinstance(child,Node): yield from child.walk()

class Document(HTMLParser):
    def __init__(self,data):
        super().__init__(); self.root=Node('root'); self.stack=[self.root];self.feed(data.decode('utf-8'))
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):self.stack.append(n)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,data): self.stack[-1].children.append(data)


def entry(value):
    value=' '.join(value.split())
    if not value:return None
    amount=credits(value)
    # A choice with separately stated values is not a sum of both alternatives.
    if re.search(r'\bor\b',value,re.I) and len(re.findall(r'\d+\s*(?:cr|hr)',value,re.I))>1:amount=None
    if not amount:
        m=re.search(r'[,–-]\s*(\d+(?:\.\d+)?)\s*$',value)
        if m:amount={'min':float(m[1]),'max':float(m[1])}
    if len(value)>500:raise ValueError('Course cell requires a dedicated adapter')
    return {'evidence':value,'credits':amount}


def candidate(semesters,record,source,ordinal,label):
    return {'schemaVersion':1,'id':source['id']+'-'+record['sha256'][:24]+'-'+str(ordinal),
      'source':{'url':record['url'],'sha256':record['sha256'],'fetchedAt':record['fetchedAt'],'validatedAt':None,'mediaType':'text/html'},
      'documentKind':'sample-plan','program':source['program'],'specialization':label or None,
      'campus':source.get('campus'),'geSystem':source.get('geSystem'),'version':record['sha256'][:16]+'-html-v1',
      'applicableFrom':source.get('applicableFrom'),'applicableUntil':None,'publicationStatus':'unknown',
      'planScope':'multi-program' if 'double major' in source['program'] else 'single-program',
      'academicYear':source.get('academicYear'),'evidence':[source['structure']]+([label] if label else []),
      'semesters':semesters,'reviewStatus':'pending','reviewedAt':None,'reviewer':None}


def structure_html(data,record,source):
    root=Document(data).root
    root=next((n for n in root.walk() if n.tag=='article'),root)
    nodes=list(root.walk()); found=[]; semesters=[]; year=0; label=''; current=None; active=False
    def finish():
        nonlocal semesters
        if semesters:
            expected=[f'Year {y}: {season}' for y in range(1,max(int(s['label'].split()[1][:-1]) for s in semesters)+1) for season in ('Autumn','Spring')]
            actual=[s['label'] for s in semesters if not s['label'].endswith('Summer')]
            if actual not in (expected,expected[:-1]) or len(actual)<8 or not all(s['entries'] for s in semesters):raise ValueError('Incomplete semester sequence: '+source['id'])
            found.append(candidate(semesters,record,source,len(found),label));semesters=[]
    for n in nodes:
        title=n.text()
        if source['adapter']=='year-lists' and n.tag=='h2' and 'Year ' not in title and 'Schedule' not in title and current is not None:
            finish();current=None;active=False;year=0
        heading=n.tag in ('h1','h2','h3','h4','h5','h6','summary','caption') or (n.tag=='div' and any(x in n.attrs.get('class','') for x in ('accordion-title','accordion-header','tab-header')))
        variant=(heading or n.tag in ('p','strong')) and len(title)<150 and re.match(r'^(?:Students (?:starting|Starting)|Pre-Med Sample|.*CURRICULUM\s*\||Sample Four Year Schedule.*(?:Physics|Chemistry))',title)
        if variant and title!=label:
            if semesters:finish()
            label=title;year=0;current=None
        m=re.fullmatch(re.escape(source.get('yearPrefix',''))+r'Year\s+([1-6]|One|Two|Three|Four|Five|Six)',title,re.I) if heading or n.tag in ('strong','p') else None
        if m:
            number=int(m[1]) if m[1].isdigit() else ('one','two','three','four','five','six').index(m[1].lower())+1
            if number==1 and year>1:finish()
            year=number;current=None;active=True
        combined=re.fullmatch(r'Year\s+([1-6]):\s*(Autumn|Fall|Spring|Summer)',title,re.I) if heading else None
        if combined and source['adapter']=='year-lists':
            year=int(combined[1]); active=True
            season=combined[2].title(); season='Autumn' if season=='Fall' else season
            current={'label':f'Year {year}: {season}','credits':None,'entries':[]};semesters.append(current)
        if source['adapter']=='paired-years' and n.tag=='table':
            rows=[[c for c in row.children if isinstance(c,Node) and c.tag in ('td','th')] for row in n.walk() if row.tag=='tr']
            if not rows:continue
            headers=[c.text() for c in rows[0]]
            if not headers or not re.match(r'^(Autumn|Fall)',headers[0],re.I) or (len(headers)>1 and not re.match(r'^Spring',headers[1],re.I)):continue
            if len(headers)>3:raise ValueError('Unexpected semester columns')
            captions=[c.text() for c in n.walk() if c.tag=='caption']
            if captions and re.fullmatch(r'Year [1-6]',captions[0],re.I):
                number=int(captions[0][-1])
                if number==1 and year>1:finish()
                year=number
            if not year:raise ValueError('Missing explicit year')
            pair=[{'label':f'Year {year}: {season}','credits':credits(header),'entries':[]} for season,header in zip(('Autumn','Spring','Summer'),headers)]
            for row in rows[1:]:
                if len(row)!=len(pair):raise ValueError('Unexpected table span')
                for cell,term in zip(row,pair):
                    value=cell.text(omit=('sup',))
                    # Inline annotation paragraphs can be outside superscripts.
                    parts=[c.text(omit=('sup',)) for c in cell.children if isinstance(c,Node) and c.tag=='p']
                    if parts:value=' '.join(re.split(r'\bPrereq(?:uisite)?\b',part,flags=re.I)[0].strip() for part in parts)
                    if re.match(r'^(Total|Semester Total)\b',value,re.I):term['credits']=credits(value);continue
                    item=entry(value)
                    if item:term['entries'].append(item)
            semesters.extend(pair)
        elif source['adapter']=='year-lists':
            season_match=re.fullmatch(r'(Autumn|Fall|Spring|Summer)(?: Semester)?',title,re.I) if heading or n.tag=='strong' else None
            embedded=next((c.text() for c in n.walk() if c.tag=='strong' and re.fullmatch(r'(Autumn|Fall|Spring|Summer)(?: Semester)?',c.text(),re.I)),None) if n.tag=='p' else None
            if embedded:season_match=re.match(r'(Autumn|Fall|Spring|Summer)',embedded,re.I)
            if season_match and active:
                season=season_match[1].title();season='Autumn' if season=='Fall' else season
                if not current or current['label']!=f'Year {year}: {season}':
                    current={'label':f'Year {year}: {season}','credits':None,'entries':[]};semesters.append(current)
            if n.tag in ('li','p') and current is not None:
                if title.startswith('[pdf]'):
                    active=False;current=None;continue
                if len(title)>500 or (n.tag=='li' and any(c.tag in ('ul','ol') for c in n.walk())):continue
                for line in n.lines():
                    line=re.sub(r'^(Autumn|Fall|Spring|Summer)(?: Semester)?\s*','',line,flags=re.I) if embedded else line
                    if re.match(r'^(?:Year|Degree) Total\b',line,re.I):continue
                    if re.match(r'^(Total|Semester Total)\b',line,re.I):current['credits']=credits(line);continue
                    if line.startswith('*') or re.search(r'\bprerequisite\b',line,re.I):continue
                    if not re.search(r'\b(?:\d{4}|GE|electives?|major|language)\b',line,re.I) and credits(line) is None:continue
                    item=entry(line)
                    if item and item not in current['entries']:current['entries'].append(item)
    finish()
    return found
