// Read structure and labels, never infer academic values or save page records.
export const text = node => (node?.textContent || '').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
export function fieldKind(label) {
 const s=label.toLocaleLowerCase('da');
 if(/opgavetitel|filnavn|emne|bogtitel|aktivitet|^fag$|^opgave$|^navn$|^titel$/.test(s))return 'title';
 if(/^hold$|^niveau$/.test(s))return 'subject';
 if(/frist/.test(s))return 'deadline';
 if(/^status$|^fravær$/.test(s))return 'status';
 if(/vægt|ects/.test(s))return 'extra';
 if(/karakter|mundtlig|skriftlig/.test(s))return 'grade';
 if(/seneste besked|afsender/.test(s))return 'sender';
 if(/^dato$|^ændret$|^uge$|^registreret$|udlånt/.test(s))return 'date';
 return 'extra';
}
export function tableModel(table) {
 const rows=Array.from(table.rows); const labels=[];const occupied=[];const result=[];
 let inHeaders=true;
 for(const row of rows) {
   const cells=Array.from(row.cells);const isHeader=cells.length>0&&cells.every(c=>c.tagName==='TH');
   if(!isHeader)inHeaders=false;
   let col=0;const entries=[];
   for(const cell of cells) {
     while(occupied[col]>0)col++;
     const span=cell.colSpan||1;const start=col;
     if(inHeaders&&isHeader)for(let j=0;j<span;j++){const name=text(cell);labels[start+j]=[labels[start+j],name].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');}
     const label=labels[start]||'';
     entries.push({cell,column:start,span,label,kind:fieldKind(label)});
     if(cell.rowSpan>1)for(let j=0;j<span;j++)occupied[start+j]=cell.rowSpan;
     col+=span;
   }
   for(let j=0;j<occupied.length;j++)if(occupied[j]>0)occupied[j]--;
   if(!isHeader)result.push({row,entries});
 }
 return {labels,rows:result};
}
