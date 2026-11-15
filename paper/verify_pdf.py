"""Verify the delivered PDF's text, links, author, structure and checksum."""
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
pdf = ROOT/'output/final/VERIDRIFT_Apart_Research_Final.pdf'
reader = PdfReader(str(pdf),strict=True)
text_by_page = [p.extract_text() for p in reader.pages]
text=' '.join(' '.join(text_by_page).split())
source=json.loads((ROOT/'paper/verified_content.json').read_text(encoding='utf-8-sig'))
n=len(source['ABSTRACT'].split())
assert 150 <= n <=250
assert pdf.stat().st_size < 25_000_000
assert 'Ometere Joel Dele-Alufe' in text
assert 'Independent Researcher, Nigeria' in text
assert 'Limitations and Dual-Use / Ethical Considerations' in text
assert 'LLM Usage Statement' in text
assert 'PROJECT TITLE' not in text and 'How to use this template' not in text
assert all(len(page.split())>30 for page in text_by_page)
assert all(float(p.mediabox.width)==612 and float(p.mediabox.height)==792 for p in reader.pages)
ref_idx=next(i for i,p in enumerate(text_by_page) if 'References' in p)
assert 0 < ref_idx <= 8
link_urls = sorted(set(
    action.get('/URI') for page in reader.pages
    for item in page.get('/Annots',[]) 
    if (action:=item.get_object().get('/A')) is not None and action.get('/URI')
))
assert 'https://github.com/ometere123/veridrift' in link_urls, link_urls
assert len(link_urls)>=6,link_urls
print(json.dumps(dict(pdf_pages=len(reader.pages), main_pages=ref_idx, abstract_words=n,
    bytes=pdf.stat().st_size,sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),
    searchable=all(bool(p.strip()) for p in text_by_page),link_urls=link_urls),indent=2))
