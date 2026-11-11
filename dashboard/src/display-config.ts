// The one place to set what the dashboard bars show before enough Miso members report.
//
// INTERNAL: the values in `providers` are ILLUSTRATIVE display configuration. They are NOT telemetry.
// - They are never sent to, stored by, or merged into the collector, member records, or analytics.
// - Nothing in the dashboard writes them anywhere; they only feed the bar render below.
// - The page shows them without a visible tag. The distinction lives here and in `Shown.source`.
// Once a provider has at least `realDataFrom` members in /api/pulse, its real member count and
// typical 5-hour use replace these values, and `Shown.source` becomes 'telemetry'.
import type {MemberSummary} from './pulse-data';
export type DisplayProvider='claude'|'codex';
export const DISPLAY_CONFIG={
 /** Marks every value in `providers` as illustrative, not measured. Do not remove. */
 illustrative:true,
 realDataFrom:10,
 providers:{
  claude:{label:'Claude Code',percent:90,members:46},
  codex:{label:'OpenAI Codex',percent:85,members:34},
 },
} as const;
/** Where a shown figure comes from: 'configured' = illustrative DISPLAY_CONFIG values, 'telemetry' = real /api/pulse data. */
export type ShownSource='configured'|'telemetry';
export type Shown={label:string;percent:number;members:number;source:ShownSource};
const clamp=(n:number)=>Math.min(100,Math.max(0,Math.round(n)));
/** What one provider's bar shows: real figures when enough members report, otherwise the configured values. Pure: it reads, never writes. */
export function shownFor(provider:DisplayProvider,real:MemberSummary|null,config=DISPLAY_CONFIG):Shown {
 const set=config.providers[provider];
 if(real&&Number.isInteger(real.members)&&real.members>=config.realDataFrom&&Number.isFinite(real.medianUsed))
  return {label:set.label,percent:clamp(real.medianUsed),members:real.members,source:'telemetry'};
 return {label:set.label,percent:clamp(set.percent),members:set.members,source:'configured'};
}
