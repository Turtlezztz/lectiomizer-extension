import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {tableModel,fieldKind} from '../src/page-data.js';
test('grouped grade headers retain the correct subject and year/exam associations',()=>{
 const dom=new JSDOM('<table><thead><tr><th rowspan="2">Fag</th><th colspan="2">Årskarakter</th><th colspan="2">Eksamenskarakter</th></tr><tr><th>Vægt</th><th>Karakter</th><th>Vægt</th><th>Karakter</th></tr></thead><tbody><tr><td>Dansk</td><td>2</td><td>10</td><td>2</td><td>12</td></tr></tbody></table>');
 const model=tableModel(dom.window.document.querySelector('table'));
 assert.deepEqual(model.rows[0].entries.map(e=>e.label),['Fag','Årskarakter · Vægt','Årskarakter · Karakter','Eksamenskarakter · Vægt','Eksamenskarakter · Karakter']);
 assert.equal(model.rows[0].entries[4].cell.textContent,'12');dom.window.close();
});
test('rowspanned dates do not shift later record field labels',()=>{
 const dom=new JSDOM('<table><tr><th>Uge</th><th>Aktivitet</th><th>Status</th></tr><tr><td rowspan="2">41</td><td>Dansk</td><td>Mangler</td></tr><tr><td>Matematik</td><td>Registreret</td></tr></table>');
 const model=tableModel(dom.window.document.querySelector('table'));
 assert.deepEqual(model.rows[1].entries.map(e=>e.label),['Aktivitet','Status']);dom.window.close();
});
test('semantic priority comes from source headings',()=>{
 assert.equal(fieldKind('Opgavetitel'),'title');assert.equal(fieldKind('Afleveringsfrist'),'deadline');assert.equal(fieldKind('Filnavn'),'title');assert.equal(fieldKind('Bemærkning'),'extra');
});
