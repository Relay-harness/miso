import {createHash,randomBytes} from 'node:crypto';

// Limit reports filed by visitors. Each network has one current report per provider, and the bar shows the typical one.
// These are what people say, not a measurement. The IP address is never stored, only a salted hash, deleted after 7 days.
export const VOTE_WINDOW=7*86400000;
export const MIN_REPORTS=5;
export const VOTE_CHOICES=[-30,-20,-10,0,10];
const PROVIDERS=['claude','codex'];
const median=v=>{const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export class VoteError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export class LimitVotes{
 constructor(db,clock=()=>Date.now()){
  this.db=db;this.clock=clock;
  db.exec('CREATE TABLE IF NOT EXISTS limit_votes(provider TEXT NOT NULL,voter TEXT NOT NULL,day INTEGER NOT NULL,percent INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(provider,voter,day));CREATE INDEX IF NOT EXISTS limit_votes_created ON limit_votes(created);CREATE TABLE IF NOT EXISTS limit_vote_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO limit_vote_meta VALUES(?,?)').run('salt',randomBytes(32).toString('hex'));
  this.salt=db.prepare('SELECT value FROM limit_vote_meta WHERE key=?').get('salt').value;
 }
 voter(ip){return createHash('sha256').update(`${this.salt}:${ip}`).digest('hex');}
 /** Same network, same provider, same UTC day: the new report replaces the old one. */
 submit(body,ip){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||!PROVIDERS.includes(body.provider)||!VOTE_CHOICES.includes(body.percent))throw new VoteError('Unknown provider or report');
  const now=this.clock();
  this.db.prepare('INSERT OR REPLACE INTO limit_votes VALUES(?,?,?,?,?)').run(body.provider,this.voter(ip),Math.floor(now/86400000),body.percent,now);
  return this.summary();
 }
 prune(){this.db.prepare('DELETE FROM limit_votes WHERE created < ?').run(this.clock()-VOTE_WINDOW);}
 summary(){
  this.prune();
  const now=this.clock(),providers={};
  for(const provider of PROVIDERS){
   // One network counts once, using its latest report, however many days it reported.
   const rows=this.db.prepare('SELECT voter,percent FROM limit_votes WHERE provider=? AND created >= ? ORDER BY created ASC').all(provider,now-VOTE_WINDOW);
   const latest=new Map(rows.map(r=>[r.voter,r.percent]));
   const reports=latest.size;
   providers[provider]={reports,percent:reports>=MIN_REPORTS?Math.round(median([...latest.values()])/10)*10:0};
  }
  return {schema:1,generatedAt:now,windowDays:7,minReports:MIN_REPORTS,providers};
 }
}
