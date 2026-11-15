"""Fill the official Apart DOCX template; only document body and new links change."""
import hashlib
import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

ROOT = Path(__file__).resolve().parent
NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
TEMPLATE = ROOT / 'official_template.docx'
EXPECTED = '966c76d93bc449591b71379841d75d4b539466d33ff72744d55b3574a770b568'

def w(tag):
    return '{%s}%s' % (NS, tag)

def text(node):
    return ''.join(node.itertext())

def old_text(node):
    return ''.join(t.text or '' for t in node.iter(w('t')))

def settext(p, value):
    ts = list(p.iter(w('t')))
    assert ts, old_text(p)
    ts[0].text = value
    for t in ts[1:]:
        t.text = None

def node(parent, tag, **attrs):
    return E.SubElement(parent, w(tag), {w(k): v for k,v in attrs.items()})

def new_run(paragraph, value, props=None):
    r = node(paragraph, 'r')
    if props is not None:
        r.append(deepcopy(props))
    t = node(r, 't')
    t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    t.text = value
    return r

def paragraph(prototype, value, relationships, page_break=False):
    p = deepcopy(prototype)
    rp = p.find('./'+w('r')+'/'+w('rPr'))
    for child in list(p):
        if child.tag != w('pPr'):
            p.remove(child)
    pp = p.find(w('pPr'))
    if page_break:
        if pp is None:
            pp = E.Element(w('pPr'))
            p.insert(0,pp)
        pp.insert(0,E.Element(w('pageBreakBefore')))
    for i, token in enumerate(re.split(r'(https://[^\s]+?)(?=[.,)]?(?:\s|$))',value)):
        if not token:
            continue
        if i%2:
            ids = {r.get('Id') for r in relationships}
            rid = 'rIdVeridrift%d'%len(ids)
            assert rid not in ids
            E.SubElement(relationships,'{%s}Relationship'%PKG,Id=rid,Type=RNS+'/hyperlink',Target=token,TargetMode='External')
            h = node(p,'hyperlink')
            h.set('{%s}id'%RNS,rid)
            r = new_run(h,token,rp)
            rpr = r.find(w('rPr'))
            if rpr is None:
                rpr=E.Element(w('rPr'))
                r.insert(0,rpr)
            node(rpr,'color',val='1155CC')
            node(rpr,'u',val='single')
        else:
            new_run(p,token,rp)
    return p

def table(lines, proto, rel):
    cells = [[x.strip() for x in l.strip().strip('|').split('|')] for l in lines]
    cells = [r for r in cells if not all(re.fullmatch(r'[-:]+', c) for c in r)]
    n=len(cells[0])
    assert all(len(r)==n for r in cells)
    widths=([740]+[(9360-740)//(n-1)]*(n-1)) if n>1 else [9360]
    t=E.Element(w('tbl'))
    pr=node(t,'tblPr')
    node(pr,'tblW',w='9360',type='dxa')
    borders=node(pr,'tblBorders')
    for edge in ['top','bottom','insideH']:
        node(borders,edge,val='single',sz='4',color='889097')
    grid=node(t,'tblGrid')
    for width in widths:
        node(grid,'gridCol',w=str(width))
    for i,row in enumerate(cells):
        tr=node(t,'tr')
        tp=node(tr,'trPr')
        node(tp,'cantSplit')
        if i==0:
            node(tp,'tblHeader')
        for val,width in zip(row,widths):
            tc=node(tr,'tc')
            cp=node(tc,'tcPr')
            node(cp,'tcW',w=str(width),type='dxa')
            if i==0:
                node(cp,'shd',fill='E8EDF0')
            p=paragraph(proto,val,rel)
            pp=p.find(w('pPr'))
            node(pp,'spacing',before='55',after='55')
            for r in p.iter(w('rPr')):
                node(r,'sz',val='19')
                if i==0: node(r,'b')
            tc.append(p)
    return t

def main():
    payload=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'verified_content.json'
    inserts=json.loads(payload.read_text(encoding='utf-8-sig'))
    manuscript=(ROOT/'manuscript.md').read_text(encoding='utf-8-sig')
    manuscript=re.sub(r'\{\{([A-Z_]+)\}\}',lambda m:inserts[m[1]],manuscript)
    blocks=re.split(r'\n\s*\n',manuscript.strip())
    title=blocks[0][2:]
    name, affiliation=[a.strip() for a in blocks[1].splitlines()]
    abstract=blocks[3]
    assert blocks[2]=='## Abstract'
    assert 150<=len(abstract.split())<=250, len(abstract.split())
    assert hashlib.sha256(TEMPLATE.read_bytes()).hexdigest()==EXPECTED
    with ZipFile(TEMPLATE) as original:
        entries={n:original.read(n) for n in original.namelist()}
    doc=E.fromstring(entries['word/document.xml'])
    rel=E.fromstring(entries['word/_rels/document.xml.rels'])
    body=doc.find(w('body'))
    heading,normal,sub=map(deepcopy,[body[4],body[5],body[49]])
    cover=body[1]
    settext(cover[2][1][2],title)
    lower=cover[3][1]
    author_grid=lower[2]
    first=next(p for p in author_grid.iter(w('p')) if 'Author name 1' in old_text(p))
    pp=deepcopy(first.find(w('pPr')))
    author=E.Element(w('p'))
    author.append(pp)
    rp=first.find('./'+w('r')+'/'+w('rPr'))
    new_run(author,name,rp)
    new_run(author,'',rp).append(E.Element(w('br')))
    new_run(author,affiliation,rp)
    aidx=lower.index(author_grid)
    lower.remove(author_grid)
    lower.insert(aidx,author)
    abstract_p=next(lower[4].iter(w('p')))
    settext(abstract_p,abstract)
    for prop in list(abstract_p.iter(w('u'))):
        prop.getparent().remove(prop)
    for el in list(body)[2:-1]:
        body.remove(el)
    for block in blocks[4:]:
        if block.startswith('### '):
            item=paragraph(sub,block[4:],rel)
        elif block.startswith('## '):
            item=paragraph(heading,block[3:],rel,page_break=block=='## References')
        elif block.startswith('|'):
            item=table(block.splitlines(),normal,rel)
        else:
            item=paragraph(normal,' '.join(line.strip() for line in block.splitlines()),rel)
        for element in item.iter():
            element.attrib.pop('{http://schemas.microsoft.com/office/word/2010/wordml}paraId',None)
        body.insert(len(body)-1,item)
    entries['word/document.xml']=E.tostring(doc,encoding='UTF-8',xml_declaration=True,standalone=True)
    entries['word/_rels/document.xml.rels']=E.tostring(rel,encoding='UTF-8',xml_declaration=True,standalone=True)
    dest=ROOT/'VERIDRIFT.docx'
    with ZipFile(dest,'w',ZIP_DEFLATED) as out:
        for n,data in entries.items():
            out.writestr(n,data)
    print(f'{dest}: {len(abstract.split())} abstract words')

if __name__=='__main__':
    main()
