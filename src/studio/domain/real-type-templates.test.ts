import { describe, it, expect } from 'vitest';
import { MysqlDataType } from '../../lib/data_types/mysql_data_types';
import { fixture, rule } from '../../../tests/helpers/workspace-fixture';
import { withDraftMutations } from '../state/workspace-state';
import { createTemplate, publishTemplateVersion } from './templates';
import { previewTemplateApplication } from './template-preview';
import { applyTemplatePreview } from './template-application';
import { validateRule, validateFieldTypeChange } from './rule-validation';
import { typeCategory } from './type-category';
function realFixture() {
 const x = fixture();
 const decimal = MysqlDataType.find(d => d.name === 'decimal')!;
 const varchar = MysqlDataType.find(d => d.name === 'varchar')!;
 const s = withDraftMutations(x.s, d => {
   d.catalog.dataTypes = [decimal, varchar].map(t => ({id:t.id!, name:t.name!, type:t.type!, dialect:'mysql', modifiers:JSON.stringify(t.modifiers), synonyms:null}));
   d.catalog.fields.forEach(f => {f.typeId=f.id===x.ft?varchar.id!:decimal.id!;});
 });
 return {...x,s,decimal:decimal.id!,varchar:varchar.id!};
}
describe('real seeded type rows (name=decimal, type=numeric)', () => {
 it('creates reusable money defaults using the actual MySQL type definition', () => {
   const x=realFixture();const r=createTemplate(x.s,{name:'金额',kind:'money',typeId:x.decimal});
   expect(r.ok).toBe(true);if(!r.ok)return;
   expect(r.state.draft.business!.templates[0].versions[0]).toMatchObject({typeId:x.decimal,precision:18,scale:2,maxLength:null});
 });
 it('requires preview and confirmation; a new version does not silently change fields', () => {
   const x=realFixture();const made=createTemplate(x.s,{name:'金额',kind:'money',typeId:x.decimal});if(!made.ok)throw Error('create');
   const published=publishTemplateVersion(made.state,{templateId:made.templateId,typeId:x.decimal,precision:20,scale:2});if(!published.ok)throw Error('publish');
   expect(published.state.draft.catalog.fields.find(f=>f.id===x.fa)?.precision).toBe(18);
   const preview=previewTemplateApplication(published.state,{templateId:made.templateId,version:2,fieldIds:[x.fa,x.fb]});expect(preview.ok).toBe(true);if(!preview.ok)return;
   expect(preview.preview.issues).toEqual([]);expect(preview.preview.changes).toHaveLength(2);
   const applied=applyTemplatePreview(published.state,{preview:preview.preview});expect(applied.ok).toBe(true);if(!applied.ok)return;
   expect(applied.state.draft.catalog.fields.find(f=>f.id===x.fa)?.precision).toBe(20);
   expect(applied.state.draft.business!.assignments).toHaveLength(2);
   expect(published.state.draft.catalog.fields.find(f=>f.id===x.fa)?.precision).toBe(18);
 });
 it('validates formulas against real numeric categories and still rejects incompatible changes atomically', () => {
   const x=realFixture();const r=rule(x);r.mappings[0].expr.push({kind:'op',value:'*'},{kind:'num',value:'2'});
   const s=withDraftMutations(x.s,d=>{d.business!.rules.push(r);});const before=JSON.stringify(s);
   expect(validateRule(r,s.draft.business!,s.draft.catalog)).toEqual([]);
   expect(validateFieldTypeChange(s.draft,{fieldId:x.fa,typeId:x.varchar})).not.toEqual([]);
   expect(JSON.stringify(s)).toBe(before);
 });
 it('keeps known SQL-name compatibility without guessing unsupported categories', () => {
   expect(typeCategory('DECIMAL')).toBe('numeric');expect(typeCategory('integer')).toBe('numeric');expect(typeCategory('time')).toBe('temporal');expect(typeCategory('geometric')).toBeUndefined();
 });
});
