# Phase 6 acceptance guide

Hands-on checks for the four Phase 6 features (#26–#29) in version 1.5.5. Each step names the route, the action and the expected visible result. Use only synthetic data, a throwaway data directory and a development port, never the stable port or a private database. These checks do not deploy anything, and the app never writes to a calendar, sends messages or submits work.

Contracts and limits: [data contract](data-contract.md) (sections Phase 6A–6D) and [project state](project-state.md).

## Prepare synthetic data

The bundled `examples/snapshot.json` has fixed past dates and only two estimated assignments, so a small script writes dated variants relative to now. The commands below work in a POSIX shell and in Windows PowerShell 5.1 or PowerShell 7. The script writes each file itself as UTF-8; do not redirect its output with `>`, because Windows PowerShell 5.1 would save the file as UTF-16 and the import would fail.

**1. Create a throwaway data directory.** Keep this shell open: every later command uses the variable it sets.

POSIX shell:

```sh
export DAYWEAVE_DATA_DIR="$(mktemp -d)"
```

PowerShell:

```powershell
$env:DAYWEAVE_DATA_DIR = Join-Path ([IO.Path]::GetTempPath()) ("dayweave-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $env:DAYWEAVE_DATA_DIR | Out-Null
```

**2. Save this script as `make-fixture.cjs` in that directory** (outside the repository):

```js
// Usage, from the repository root: node make-fixture.cjs <weeksAgo> <outputPath> [failedSourceId]
const fs=require('node:fs');
const [weeksAgo,out,failed]=process.argv.slice(2);
if(!/^\d+$/.test(weeksAgo||'')||!out)throw Error('Usage: node make-fixture.cjs <weeksAgo> <outputPath> [failedSourceId]');
const d=JSON.parse(fs.readFileSync('examples/snapshot.json','utf8'));
if(failed&&!d.sources.some(s=>s.id===failed))throw Error('Unknown source id: '+failed);
const now=Date.now(),at=h=>new Date(now+h*3600000).toISOString();
d.generatedAt=at(-24*7*Number(weeksAgo));
const a=Object.fromEntries(d.assignments.map(x=>[x.id,x]));
Object.assign(a['brief-a'],{dueAt:at(20),estimateMinutes:90});
Object.assign(a['presentation-b'],{dueAt:at(120),estimateMinutes:180});
Object.assign(a['reflection-a'],{dueAt:at(30),estimateMinutes:60});
a['receipt-b'].dueAt=at(-48);
a['submitted-a'].status=Number(weeksAgo)>0?'not_submitted':'submitted';
d.assignments.push({...a['brief-a'],id:'lab-a',title:'Overdue lab note',dueAt:at(-5),estimateMinutes:45});
for(const s of d.sources){s.status=s.id===failed?'failed':'ok';if(s.id!==failed)s.lastSuccess=d.generatedAt;}
d.calendarCoverage={...d.calendarCoverage,start:at(-12),end:at(120)};
const role=d.career.roles[0],person=d.career.candidates[0];
d.career.roles=['A','B','C'].map(k=>({...role,id:'role-'+k,title:'Example analyst '+k,source:'https://example.com/jobs/'+k}));
d.career.candidates=['A','B'].map(k=>({...person,id:'person-'+k,name:'Example contact '+k,source:'https://example.com/people/'+k}));
delete d.career.profile.usSponsorshipRequired;
fs.writeFileSync(out,JSON.stringify(d,null,1),'utf8');
console.log('Wrote '+out);
```

**3. From the repository root, create last week's and this week's snapshots and the database.**

POSIX shell:

```sh
node "$DAYWEAVE_DATA_DIR/make-fixture.cjs" 1 "$DAYWEAVE_DATA_DIR/last-week.json"
node "$DAYWEAVE_DATA_DIR/make-fixture.cjs" 0 "$DAYWEAVE_DATA_DIR/this-week.json"
node scripts/db.cjs migrate "$DAYWEAVE_DATA_DIR/last-week.json"
node scripts/db.cjs import "$DAYWEAVE_DATA_DIR/this-week.json"
```

PowerShell:

```powershell
node "$env:DAYWEAVE_DATA_DIR\make-fixture.cjs" 1 "$env:DAYWEAVE_DATA_DIR\last-week.json"
node "$env:DAYWEAVE_DATA_DIR\make-fixture.cjs" 0 "$env:DAYWEAVE_DATA_DIR\this-week.json"
node scripts/db.cjs migrate "$env:DAYWEAVE_DATA_DIR\last-week.json"
node scripts/db.cjs import "$env:DAYWEAVE_DATA_DIR\this-week.json"
```

**4. Start the development server** on port 8768, never the stable port. POSIX shell: `PORT=8768 node scripts/serve.cjs`. PowerShell: `$env:PORT = "8768"; node scripts/serve.cjs`.

Open `http://127.0.0.1:8768/home`. Times display in the snapshot timezone (`America/New_York`).

**Optional failed source** (used in sections 2 and 4). Stop the server with Ctrl+C, import a snapshot in which Course B failed, then start the server again with the step 4 command.

POSIX shell:

```sh
node "$DAYWEAVE_DATA_DIR/make-fixture.cjs" 0 "$DAYWEAVE_DATA_DIR/failed.json" course-b
node scripts/db.cjs import "$DAYWEAVE_DATA_DIR/failed.json"
```

PowerShell:

```powershell
node "$env:DAYWEAVE_DATA_DIR\make-fixture.cjs" 0 "$env:DAYWEAVE_DATA_DIR\failed.json" course-b
node scripts/db.cjs import "$env:DAYWEAVE_DATA_DIR\failed.json"
```

**When finished**, stop the server with Ctrl+C and delete the throwaway directory. POSIX shell: `rm -rf "$DAYWEAVE_DATA_DIR"; unset DAYWEAVE_DATA_DIR`. PowerShell: `Remove-Item -LiteralPath $env:DAYWEAVE_DATA_DIR -Recurse -Force; Remove-Item Env:DAYWEAVE_DATA_DIR, Env:PORT`.

## 1. Effort calibration (#26) — Coursework and Settings

On `/coursework`, expand a card's **Requirements, source and checklist** to see **Actual minutes**. Type a value and leave the field (Tab) to save it.

| Action | Expected result |
| --- | --- |
| Open **Research brief** before typing | Field is blank with placeholder "Not recorded"; status "Actual minutes not recorded."; **Confirm effort** is disabled |
| Enter `90`, then **Confirm effort** | Notice "Effort confirmed as a calibration sample. This is not a submission record."; status "Effort confirmed …: 90 actual / 90 estimated minutes (frozen)."; buttons **Reconfirm effort** and **Clear confirmation** |
| Confirm **Group presentation** with `270` | Two samples |
| Open `/settings` | **Effort calibration** shows "Insufficient data · 2 of 3 confirmed samples needed." |
| Confirm **Additional reflection opportunity** (tagged "Selectable (choice)") with `120`, then open `/settings` | "1.5× median actual/estimate across 3 confirmed samples." (ratios 1, 1.5 and 2) |
| On **Overdue lab note** enter `0` | Status "Zero actual minutes are saved but cannot be a calibration sample."; Confirm stays disabled; Settings adds "Excluded: 1 zero actual minutes" and the ratio stays 1.5× |
| Change **Research brief** to `100` | Notice "Actual minutes changed: the earlier effort confirmation was removed. Reconfirm to include it."; Settings returns to "Insufficient data · 2 of 3" with "1 recorded but not confirmed" |
| **Confirm effort** on Research brief again | Frozen pair is now 100 / 90; Settings shows 3 samples again |
| Clear the **Overdue lab note** field | Status "Actual minutes not recorded."; after reload the field is still blank (deleted, not 0) |
| Reload `/settings` | Same result; nothing was adjusted in estimates or plans |

## 2. Workload modes (#27) — Home

| Action | Expected result |
| --- | --- |
| Open `/home` | Heading "Focus mode: Standard" with **Standard** pressed; overview cards, then **Needs verification & data health** |
| Click **Reduced** | Notice "Focus mode: Reduced. Advisory view only; nothing was scheduled, sent or approved." |
| Read **Urgent required work** | **Overdue lab note** ("Overdue") then **Research brief** ("Due within 72 h"), earliest deadline first |
| Read the other sections | **Other required work** lists Group presentation ("Required"); **Selectable opportunities** lists Additional reflection opportunity ("Selectable (choice)"); **Needs verification & data health** lists Verify group submission receipt ("Submission status unknown"); Reading response (submitted) is in none of the lists |
| Reload | Mode is still Reduced; the calendar coverage line still says blank time is never treated as available capacity |
| Click **Standard**, reload | Standard overview returns; Coursework was unchanged throughout |

Optional failed source: import the [failed-source snapshot](#prepare-synthetic-data) and restart. In both modes the source shows as `failed`, and the remaining Course B work moves to verification with "Source failed: retained record may be stale".

## 3. Career feedback ordering (#28) — Career

| Action | Expected result |
| --- | --- |
| Open `/career` (Roles tab) | Order note "Order: what you saved first, what you dismissed last, everything else in source order…"; roles in source order A, B, C; a banner tagged "Not assessed" reads "Profile facts missing: usSponsorshipRequired — eligibility for these is not assessed and is not shown as eligible."; each card is tagged "Eligibility not fully assessed" |
| **Save** on Example analyst C | C moves first, tagged "Saved by you" with "Listed first because you saved it." |
| **Dismiss** on Example analyst A | A moves last and stays visible, tagged "Dismissed by you", with a **Restore** button |
| Reload | Order stays C, B, A |
| **Restore** on A | Order returns to C, A, B (A back to source position) |
| Check the labels | The not-assessed banner and card tags are unchanged by saving or dismissing |
| Repeat on the **People** tab | Same ordering rules, independent of Roles |

## 4. Weekly evidence trends (#29) — Settings → Weekly trends

Open `/settings` and click the **Weekly trends** tab (`/settings?tab=trends`).

| Action | Expected result |
| --- | --- |
| Default view | Two cards: **Previous week** and **Selected week**, each titled with exact dates and "Monday 00:00 to Sunday 24:00 · America/New_York"; the current week is tagged "In progress · partial week through …" |
| Read a card | "Counts from the latest observation this week: collected … (source generatedAt), imported …"; for last week the collection time is about a week before the import time |
| Counts | Required-work rows by status (submitted/graded/excused, not submitted, submission status unknown, other); selectable and uncertain rows are separate and labelled as not required |
| **Source health** | Each source with its latest status and how many observations were OK, failed or unavailable, other status or not reported |
| **Comparison** | Tagged "Comparable", with the change between the latest observation of each week: +1 for submitted/graded/excused and -1 for not submitted (Reading response was submitted this week). A change "is not judged as better or worse" |
| Import the optional [failed-source snapshot](#prepare-synthetic-data), restart, reload | Comparison shows "Not comparable · coverage limited. No change is shown, and a lower count is not an improvement." with reasons naming the failed source |
| Click **← Earlier week** until a week has no imports | Every value reads "No observations", never 0 |
| Go five or more weeks back | "Coverage incomplete · on or before the retained window"; the text says evidence may have been pruned |
| **Retention limit** line | "snapshots are kept for 30 days and pruned only when a new import runs", with the retained import range |
| Reload, Back and Forward | The same weeks and counts; the URL keeps `week=` |

"No observations" is bounded: the page reads at most 500 snapshot rows and checks the 1,000 most recent imports, and only 30 days are retained. Outside those bounds an empty week means missing data, not zero.

## Every route

- After each action, reload and use Back/Forward; the result should persist.
- In the browser developer console, expect no errors from the app (a missing favicon is harmless).
- Expect nothing outside the app to change: no calendar event, message, approval or submission.
