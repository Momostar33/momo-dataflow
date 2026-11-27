import {emptyCatalog,emptyMetadata,createInitialWorkspace,withDraftMutations,catalogFingerprint} from '../../src/studio/state/workspace-state';
import {emptyBusinessDocument} from '../../src/studio/contracts/business';
import type {Rule} from '../../src/studio/contracts/business';
import {addTable} from '../../src/studio/domain/catalog-tables';
import {addField} from '../../src/studio/domain/catalog-fields';
export function fixture(){
 let s=createInitialWorkspace({catalog:emptyCatalog(),metadata:emptyMetadata(),business:emptyBusinessDocument()},{revision:0,fingerprint:''});
 s=withDraftMutations(s,d=>{d.catalog.databases.push({id:'00000000-0000-4000-8000-000000000001',name:'controller',dialect:'mysql',numOfTables:0,createdAt:null});
 for(const [id,type] of [['money','DECIMAL'],['text','VARCHAR'],['int','INT']])d.catalog.dataTypes.push({id,name:type,type,dialect:'mysql',modifiers:null,synonyms:null});});
 const db=s.draft.catalog.databases[0].id;
 const a=addTable(s,{databaseId:db,name:'orders'});if(!a.ok)throw Error('table fixture');s=a.state;
 const b=addTable(s,{databaseId:db,name:'ledger'});if(!b.ok)throw Error('table fixture');s=b.state;
 const f=addField(s,{tableId:a.tableId,name:'fee',typeId:'money',precision:18,scale:2});if(!f.ok)throw Error('field fixture');s=f.state;
 const g=addField(s,{tableId:b.tableId,name:'total',typeId:'money',precision:18,scale:2});if(!g.ok)throw Error('field fixture');s=g.state;
 const h=addField(s,{tableId:a.tableId,name:'description',typeId:'text'});if(!h.ok)throw Error('field fixture');s=h.state;
 const flow='00000000-0000-4000-8000-000000000002',step='00000000-0000-4000-8000-000000000003',ra='00000000-0000-4000-8000-000000000004',rb='00000000-0000-4000-8000-000000000005';
 s=withDraftMutations(s,d=>{d.business!.flows.push({flowId:flow,databaseId:db,name:'采购',note:'controller-flow',steps:[{stepId:step,name:'下单',note:'',x:0,y:0,w:600,h:400}]});d.business!.refs.push({refId:ra,flowId:flow,stepId:step,tableId:a.tableId,x:0,y:0,collapsed:false},{refId:rb,flowId:flow,stepId:step,tableId:b.tableId,x:200,y:0,collapsed:false});});
 s=createInitialWorkspace(s.draft,{revision:0,fingerprint:catalogFingerprint(s.draft.catalog)});
 return {s,db,ta:a.tableId,tb:b.tableId,fa:f.fieldId,fb:g.fieldId,ft:h.fieldId,flow,step,ra,rb};
}
export function rule(x:ReturnType<typeof fixture>):Rule{return {ruleId:'00000000-0000-4000-8000-000000000006',flowId:x.flow,name:'金额映射',note:'rule-note',logic:'ALL',conditions:[],mappings:[{id:'map1',target:{refId:x.rb,fieldId:x.fb},expr:[{kind:'field',refId:x.ra,fieldId:x.fa}],note:'map-note'}]};}
export function accepted<T extends {ok:boolean,state?:unknown}>(r:T){if(!r.ok||!r.state)throw Error('expected successful operation '+JSON.stringify(r));return r.state as ReturnType<typeof fixture>['s'];}
