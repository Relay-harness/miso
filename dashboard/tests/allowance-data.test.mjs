import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/allowance-data.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isAllowanceCommunity}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const empty=()=>({schema:1,method:'paired-controlled-workload-v1',generatedAt:1800000000000,freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]});
test('allowance schema accepts empty evidence but rejects usage data and unsafe numeric results',()=>{
 assert.equal(isAllowanceCommunity(empty()),true);
 assert.equal(isAllowanceCommunity({...empty(),method:'signed-installation-reports'}),false);
 const cohort={provider:'claude',plan:'pro',kind:'five_hour',model:'sonnet-4-5',contextBand:'short',protocol:'controlled-v1',status:'decreased',index:50,interval:[40,60],contributors:10,baselineIntervals:30,currentIntervals:30,latestAt:1800000000000};
 assert.equal(isAllowanceCommunity({...empty(),reportingInstallations:10,cohorts:[cohort]}),true);
 for(const changes of [{index:NaN},{index:Infinity},{contributors:2},{interval:[60,40]},{baselineIntervals:2},{status:'increased'},{latestAt:1800000000000-2*86400000}])assert.equal(isAllowanceCommunity({...empty(),cohorts:[{...cohort,...changes}]}),false);
});
