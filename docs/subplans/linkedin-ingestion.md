# Sub-plan: LinkedIn Data Ingestion

**Owner:** Data Engineer
**Reviewers:** Backend, Lead

> Canonical names come from [`MASTER_PLAN.md`](../MASTER_PLAN.md) §4. Table DDL, RLS and Storage policies are in [`sections/data.md`](../sections/data.md) §3.6, §4 and §6. This document covers formats, the parsing pipeline, normalisation, company matching and the API contract.

---

## 1. Open questions, risks, assumptions

### 1.1 Open questions (defaults in bold are what we build)

| # | Question | Default | Needs |
|---|---|---|---|
| L1 | Are CSV **headers** localised in non-English exports? Our evidence says headers stay English and only some values (dates) are localised. | **Assume English headers, map by alias, and add any localised header we see to the alias table.** Before launch, collect real exports from 3+ non-English accounts (fr, de, es) and add them as fixtures. | Lead (recruit testers) |
| L2 | Re-upload of a single CSV: replace everything or merge per file? | **Replace all** (the task's rule). The new import becomes the whole dataset; datasets not in the new upload are removed. The UI warns before upload: "Your new upload doesn't include Positions.csv. Your current positions will be removed." | Frontend (warning copy) |
| L3 | If one file in a multi-file upload fails to parse, do we keep the others? | **No. The import is atomic.** Any fatal file error fails the whole import and the previous active import stays untouched. Non-fatal issues are warnings. | Backend |
| L4 | Fuzzy and prefix matches: show them? | **Show them in a separate, collapsed "Possible matches" group**, labelled as possible. Exact matches show as "Works at {Company}". | Frontend |
| L5 | Is Connections.csv required at onboarding? | **No.** Onboarding requires a **succeeded import with at least one recognised file** plus a parsed resume (product owner, MASTER_PLAN D-39). Within the import, Connections.csv (and any other single file) is optional; the consent copy explains why we ask. | Frontend, Backend |
| L6 | Is a 50 MB upload cap enough? LinkedIn's "larger data archive" (messages, media) can exceed it. | **Yes, with guidance:** the upload screen tells users to request the **specific data** export (Connections, Positions, Profile, Skills, Education), which is small and arrives in ~10 minutes, or to upload the five CSVs individually. | Frontend (help copy) |

### 1.2 Risks

- **The export format is unversioned** and changes without notice (brief §1). Mitigation: alias-based header mapping, preamble detection, tolerant date parsing, fixture tests per variant, and an `UNMAPPED_HEADER` warning logged (header names only, no values) so we notice drift in production.
- **Third-party PII** in Connections.csv. Mitigation: allowlist projection at parse time (email and URL never leave the parser), no row values in logs, events or Inngest step outputs, raw file deleted after parsing.
- **Inngest persists event payloads and step return values** in Inngest Cloud. Mitigation: events carry ids only; steps return counts and warning codes only; parsed rows are written to Postgres inside the step and never returned.
- **Zip bombs and malformed archives.** Mitigation: §2.3 limits, enforced on actual inflated bytes, not on header claims.
- **False-positive company matches** ("Meta" vs "Metal", "Apple" vs "Apple Leisure Group"). Mitigation: exact match on normalised names and aliases first; prefix and fuzzy matches only above length guards and shown as "possible".
- **Stale data.** Connections.csv is a snapshot. Mitigation: show "as of {parsed date}" and nudge a refresh after 180 days.

### 1.3 Assumptions

- LinkedIn's OIDC sign-in gives only name, email and picture; the Profile, Positions and Connections APIs need partner programs we do not have (brief §1). **That is why we use the member's own data export.**
- One active import per applicant (`applicant_profiles.active_linkedin_import_id`).
- At most 30,000 connections per member (LinkedIn's cap).
- Parsing runs in Node (Inngest functions served by Next.js on Vercel), using `fflate` and `papaparse` (brief §2).

---

## 2. Design

### 2.1 Why the export

| Source | What it gives | Usable? |
|---|---|---|
| Sign In with LinkedIn (OIDC, `openid profile email`) | name, email, picture | Yes, for auth only |
| Profile / Positions / Skills APIs | full profile | No: Marketing/Talent partner programs only |
| Connections API | connections | No: closed to third parties since 2015 |
| Scraping | anything | No: violates LinkedIn's User Agreement |
| **Member data export** (Settings → Data privacy → Get a copy of your data) | ZIP with Profile.csv, Positions.csv, Skills.csv, Education.csv, Connections.csv, and more | **Yes.** The member downloads it and gives it to us. |

### 2.2 Accepted inputs

| Input | Rule |
|---|---|
| **Full ZIP** | One `.zip` file, ≤ 50 MB. We read only the five allowlisted entries, matched by **basename, case-insensitive, at any depth** (exports are sometimes nested, e.g. `Basic_LinkedInDataExport_10-01-2026/Connections.csv`). Every other entry (messages.csv, Invitations.csv, media) is never inflated and is reported as `UNKNOWN_FILE_IGNORED` (count only). |
| **Individual CSVs** | 1–5 files in one upload, each ≤ 20 MB, from: `Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`, `Connections.csv`. If the user renamed a file (e.g. `Connections (1).csv`), we identify it by **header signature** (§2.5). Two files of the same kind in one upload → `DUPLICATE_FILE_KIND` (422 at init when names collide; fatal at parse when detected by signature). |

At least one recognised file must parse, or the import fails with `NO_RECOGNIZED_FILES`.

### 2.3 Validation limits

| Check | Limit | Error |
|---|---|---|
| Upload object size | ZIP ≤ 50 MB; CSV ≤ 20 MB | `FILE_TOO_LARGE` |
| Magic bytes | ZIP must start `PK\x03\x04`; CSV must decode as text and contain no NUL bytes in the first 64 KB | `UNSUPPORTED_FILE_TYPE` |
| ZIP central directory | parses; ≤ 2,000 entries | `ZIP_INVALID`, `ZIP_TOO_MANY_ENTRIES` |
| Encrypted entries | an allowlisted entry with the encryption flag set | `ZIP_ENCRYPTED` |
| Declared uncompressed size | each allowlisted entry ≤ 20 MB; total of allowlisted entries ≤ 60 MB | `ZIP_UNCOMPRESSED_TOO_LARGE` |
| Compression ratio | allowlisted entry ratio ≤ 100:1 | `ZIP_SUSPICIOUS_RATIO` |
| **Actual inflated bytes** | streaming `fflate.Inflate` with a byte counter that aborts at 20 MB per entry (headers can lie) | `ZIP_UNCOMPRESSED_TOO_LARGE` |
| Path traversal | not applicable: entries are matched by basename and inflated to memory only; nothing is written to disk | — |
| Nested archives | ignored | — |
| Row caps | Connections ≤ 35,000 (fatal above); Positions 300, Skills 300, Education 50 (truncate + `ROWS_TRUNCATED` warning) | `ROW_LIMIT_EXCEEDED` |
| Field length | truncated to the column caps in data.md §3.6 | warning `VALUE_TRUNCATED` |

### 2.4 Real-world format quirks

**Connections.csv** (current format) starts with a preamble before the header:

```
Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more here https://www.linkedin.com/help/linkedin/answer/261"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Ada,Quill,https://www.linkedin.com/in/ada-quill-1a2b3c,,"Acme Payments, Inc.",Staff Engineer,15 Jan 2024
```

| Quirk | Handling |
|---|---|
| "Notes:" preamble (2–4 lines, may contain commas and quotes) | Parse with `papaparse` `header: false`, then **scan the first 20 rows for the header row**: the first row in which at least 3 cells map to known aliases for that file kind, including the required ones. Rows before it are discarded. Older exports without a preamble work the same way (header is row 0). |
| Columns `First Name, Last Name, URL, Email Address, Company, Position, Connected On` | Mapped by alias (§2.5). **URL and Email Address are never projected** out of the parser. |
| Dates like `15 Jan 2024` | Date parser (§2.6). |
| UTF-8 BOM | Stripped before parsing (and from the first header cell). |
| UTF-16 (BOM `FF FE` / `FE FF`) | Decoded with `TextDecoder('utf-16le'/'utf-16be')`. |
| Not valid UTF-8 | Try `TextDecoder('utf-8', {fatal: true})`; on failure decode as `windows-1252` and add warning `ENCODING_FALLBACK`. If the result has > 1% replacement characters → `ENCODING_UNSUPPORTED` (fatal). |
| Quoted commas (`"Acme Payments, Inc."`), escaped quotes, multi-line quoted fields (Positions descriptions) | `papaparse` handles them; we never split lines ourselves. |
| CRLF / LF / CR line endings | `papaparse` auto-detects `newline`. |
| Empty Company | Row kept; `company_name` null; never matches. Counted in `counts.connections.no_company`. |
| Blank lines and trailing empty rows | Skipped silently. |
| Rows with a different cell count | Missing cells → empty; extra cells ignored; > 5% malformed rows in a file → `CSV_MALFORMED` (fatal). |
| Unicode names (`José Núñez`, `王伟`, `Zoë`) | Kept as-is after NFC normalisation and whitespace trimming. |
| Generic employers (`Self-employed`, `Freelance`, `Stealth`, `Retired`, `Confidential`) | Stored for display; `normalize_company_name` returns null, so they never match. |
| Duplicate rows | De-duplicated on `(lower(first), lower(last), company_name_normalized)`; warning `DUPLICATE_ROW` (count). |
| Spreadsheet formula prefixes (`=`, `+`, `-`, `@`) | Stored as text; we never write CSV back out, and the JSON export is not a spreadsheet. |
| **Positions with empty `Finished On`** | `ended_on = null` → `is_current = true`. Values `Present`, `Current`, `Aujourd'hui`, `Heute`, `Actualidad`, `Atual`, `Presente` also mean current. |
| Positions dates `Jan 2020` / `2019` | Stored as the first day of the month or year (precision loss accepted; display shows month/year). |
| Education dates are usually years (`2015`) | Same as above. |
| Profile.csv (one row) | Keep only Headline, Summary, Industry, Geo Location (data.md D9). First/Last Name, Maiden Name, Address, Birth Date, Zip Code, Twitter Handles, Websites and Instant Messengers are never projected. |
| **Header drift between export versions** | Alias map (§2.5); unknown headers are ignored with a warning listing header **names** only. |

### 2.5 Header alias map

Header keys are normalised before lookup: strip BOM, trim, lowercase, collapse runs of whitespace, `_` and `-` to a single space. `*` = required.

| Kind | Field | Aliases (normalised) |
|---|---|---|
| Connections | `first_name`* | `first name`, `firstname`, `given name` |
| | `last_name`* | `last name`, `lastname`, `surname`, `family name` |
| | `company_name`* | `company`, `company name`, `current company`, `organization` |
| | `position` | `position`, `title`, `job title`, `headline` |
| | `connected_on` | `connected on`, `connection date`, `connected` |
| | *(dropped)* | `url`, `profile url`, `email address`, `e mail address`, `email` (recognised so they count toward header detection, never projected) |
| Positions | `company_name`* | `company name`, `company`, `organization` |
| | `title`* | `title`, `position`, `job title` |
| | `description` | `description` |
| | `location` | `location` |
| | `started_on` | `started on`, `start date`, `from` |
| | `ended_on` | `finished on`, `end date`, `ended on`, `to` |
| Skills | `name`* | `name`, `skill`, `skill name`, `skills` |
| Education | `school`* | `school name`, `school`, `institution` |
| | `degree` | `degree name`, `degree` |
| | `notes` | `notes`, `field of study` (joined with "; " if both) |
| | `started_on` / `ended_on` | `start date`, `started on` / `end date`, `finished on` |
| | *(dropped)* | `activities` |
| Profile | `headline`, `summary`, `industry`, `geo_location` | `headline`; `summary`, `about`; `industry`; `geo location`, `location` |
| | *(dropped)* | `first name`, `last name`, `maiden name`, `address`, `birth date`, `zip code`, `twitter handles`, `websites`, `instant messengers` |

Connections requires `company_name` plus at least one of `first_name`/`last_name`. **File-kind signature** (for renamed CSVs): the kind whose required fields all map in the detected header row; ties go to the filename hint; no match → `UNKNOWN_FILE_IGNORED`.

### 2.6 Date parsing

Order of attempts (first success wins; result must be between 1950-01-01 and today + 1 day, else null + `DATE_UNPARSED`):

| Pattern | Example | Result |
|---|---|---|
| `d MMM yyyy` | `15 Jan 2024`, `5 janv. 2024`, `15. Jan. 2024`, `3 mrt 2023` | that day |
| ISO `yyyy-mm-dd` | `2024-01-15` | that day |
| `M/D/YY` or `M/D/YYYY` (legacy US exports) | `01/15/24`, `1/5/2024` | that day; if the first number > 12, read as `D/M` |
| `MMM yyyy` | `Jan 2020`, `févr. 2019`, `Okt 2021` | first of month |
| `yyyy` | `2015` | 1 January |
| empty / `Present`-like | — | null |

Month tokens are matched after lowercasing, removing dots and accents, and taking the token as-is, against a table covering en, fr, de, es, pt, it, nl (e.g. `jan janv janvier ene gen`, `feb fev fevr febr`, `mar mars marz maerz mrt`, `apr avr abr`, `may mai mag mei`, `jun juin juni giu`, `jul juil juli lug`, `aug aout ago`, `sep sept set`, `oct okt out ott`, `nov`, `dec dez dic`). The table lives in `lib/parsers/linkedin/months.ts`.

### 2.7 Pipeline

```
Browser                      Next.js /api/v1                    Storage (linkedin-exports)        Inngest: parse-linkedin-import
  │ 1 POST /linkedin-imports  │ create linkedin_imports(pending)  │                                  │
  │ ◄── importId + signed upload URLs per file                    │                                  │
  │ 2 PUT files ───────────────────────────────────────────────► {uid}/{importId}/{file}            │
  │ 3 POST /linkedin-imports/{id}/complete                        │                                  │
  │                           │ verify objects + sizes ─────────► │                                  │
  │                           │ send linkedin/import.uploaded {importId, applicantId} ─────────────► │
  │ ◄── 202 {status:pending}  │                                   │                                  │
  │ 4 poll GET /linkedin-imports/{id} every 2 s                    │  steps (each returns ids/counts only):
  │                                                                │   a mark-running
  │                                                                │   b validate        (size, magic, zip limits → manifest)
  │                                                                │   c parse-<kind> ×n (download, inflate one entry, decode,
  │                                                                │                      detect header, map, normalise,
  │                                                                │                      delete rows of this import+kind,
  │                                                                │                      insert in 1,000-row chunks)
  │                                                                │   d activate        (rpc activate_linkedin_import)
  │                                                                │   e delete-raw      (Storage remove; raw_deleted_at)
```

**Inngest configuration.** Trigger `linkedin/import.uploaded`. `concurrency: { key: 'event.data.applicantId', limit: 1 }`. `cancelOn: [{ event: 'linkedin/import.uploaded', if: 'async.data.applicantId == event.data.applicantId && async.data.importId != event.data.importId' }, { event: 'linkedin/import.deleted', match: 'data.applicantId' }]` so a newer upload supersedes an older run (the older import is marked `failed` with `SUPERSEDED` in the cancellation handler). Retries: 3 for infrastructure errors. Validation and parse errors throw `NonRetriableError`.

**Step details**

| Step | Does | Idempotency |
|---|---|---|
| a `mark-running` | Loads the import with the service role, checks `applicant_id` matches the event and `status = 'pending'`; sets `running`, `started_at`. | No-op if already `running`. |
| b `validate` | Lists objects under `{uid}/{importId}/`; checks sizes and magic bytes; for ZIPs reads the central directory and applies §2.3; returns a manifest `[{kind, objectPath, entryName}]`. | Pure. |
| c `parse-<kind>` | One step per kind. Downloads the object, inflates only that entry (streaming byte cap), decodes (§2.4), parses with `papaparse` (`header:false`, `skipEmptyLines:'greedy'`), detects the header row, maps by alias, **projects to the allowlisted fields only**, normalises (trim, NFC, dates, truncation, de-dupe), then deletes existing rows for this `import_id` in that kind's table and inserts in chunks of 1,000 via the service-role client. Profile updates the four columns on `linkedin_imports`. Returns `{kind, parsed, skipped, warnings:[{code, count, sampleRows:[row numbers]}]}`. | Delete-then-insert scoped to `import_id` makes retries safe. |
| d `activate` | `rpc('activate_linkedin_import', {p_import_id})`, below. | Function is idempotent (no-op when already `succeeded`). |
| e `delete-raw` | Removes all objects under the import prefix; sets `raw_deleted_at`. | Removing missing objects is a no-op. |
| `onFailure` | Sets `status='failed'`, `error` (code), `error_detail` (`{file, missing:[…], row}` — never cell values), deletes the rows inserted for this import (they are not active anyway) and the raw files. | — |

**Activation (single transaction, service role only)**

```sql
create or replace function public.activate_linkedin_import(p_import_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_applicant uuid; v_status public.evaluation_status;
begin
  select applicant_id, status into v_applicant, v_status
    from public.linkedin_imports where id = p_import_id for update;
  if not found then return; end if;                    -- deleted by the user mid-parse (MASTER_PLAN D-14)
  if v_status = 'succeeded' then return; end if;
  if v_status <> 'running' then
    raise exception 'import not running' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  -- a newer import exists: this one lost the race. An init-only newer row (pending, never
  -- completed) does not count, so an abandoned second tab cannot block a real upload (D-14).
  if exists (select 1 from public.linkedin_imports
             where applicant_id = v_applicant and created_at > (select created_at from public.linkedin_imports where id = p_import_id)
               and (status in ('running','succeeded') or (status = 'pending' and uploaded_at is not null))) then
    raise exception 'superseded' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  update public.linkedin_imports
     set status = 'succeeded', parsed_at = now(),
         counts = (select jsonb_build_object(
                     'positions',   (select count(*) from public.linkedin_positions  where import_id = p_import_id),
                     'skills',      (select count(*) from public.linkedin_skills     where import_id = p_import_id),
                     'education',   (select count(*) from public.linkedin_education  where import_id = p_import_id),
                     'connections', (select count(*) from public.connections         where import_id = p_import_id))
                   || counts)
   where id = p_import_id;
  update public.applicant_profiles
     set active_linkedin_import_id = p_import_id,
         headline = coalesce(headline, (select headline from public.linkedin_imports where id = p_import_id))
   where profile_id = v_applicant;
  -- replace-all: drop every older import (cascades to all row tables); raw files of older imports
  -- are already deleted or will be purged by the 7-day sweep
  delete from public.linkedin_imports where applicant_id = v_applicant and id <> p_import_id
    and status in ('succeeded', 'failed');
  insert into public.audit_log (actor_id, action, subject_type, subject_id)
  values (v_applicant, 'linkedin.import_replaced', 'linkedin_import', p_import_id);
end $$;
revoke execute on function public.activate_linkedin_import(uuid) from public, authenticated;
grant execute on function public.activate_linkedin_import(uuid) to service_role;
```

Because readers always go through `active_linkedin_import_id`, the switch from old data to new data is atomic: Check fit and `connections_at_company` never see a half-parsed import. Changing the active import also changes `input_hash` for Check fit (brief §3.1), so cached fit results are recomputed.

### 2.8 Re-upload semantics

- **Replace all.** A new import, once activated, is the applicant's entire LinkedIn dataset. Older imports and their rows are deleted in the same transaction.
- Until activation, the previous import stays active and visible. If the new import fails, nothing changes.
- A new upload while one is running cancels the older run (`SUPERSEDED`).
- Applications already submitted are unaffected: they snapshot `fit_evaluation_id`, and `fit_evaluations.linkedin_import_id` goes null when the old import is deleted (provenance only).
- Rate limit: 10 imports per applicant per day (Upstash).

### 2.9 Company-name normalisation

`public.normalize_company_name(text)` (SQL in data.md §3.2) is the single implementation; the TypeScript parser does **not** reimplement it (the DB computes it as a generated column). Steps:

1. null/blank → null.
2. `unaccent`, lowercase.
3. Drop a trailing web TLD in the name: `.com .io .ai .co .net .org` (`Booking.com` → `booking`).
4. `&` → ` and `; remove dots (`L.L.C.` → `llc`, `S.A.` → `sa`); any other non-alphanumeric run → one space; collapse spaces; trim.
5. Strip a leading `the `.
6. Repeatedly strip one trailing legal/organisational suffix token: `inc incorporated llc llp lp ltd limited corp corporation co company plc gmbh mbh ag kg se sa sas sarl srl spa bv nv pty pvt private oy oyj ab as asa aps kk ulc group holdings and`.
7. Generic employers (`self employed`, `freelance`, `stealth`, `retired`, `confidential`, …) → null.
8. If stripping left nothing, fall back to the punctuation-normalised original (so `Company` stays `company`).

**Test vectors** (pgTAP `07_normalize.test.sql` and Vitest via `rpc`):

| Input | Output |
|---|---|
| `Stripe, Inc.` | `stripe` |
| `STRIPE` | `stripe` |
| `Acme Payments, Inc.` | `acme payments` |
| `ACME PAYMENTS` | `acme payments` |
| `The Walt Disney Company` | `walt disney` |
| `JPMorgan Chase & Co.` | `jpmorgan chase` |
| `Ernst & Young LLP` | `ernst and young` |
| `Goldman Sachs Group, Inc.` | `goldman sachs` |
| `Booking.com` | `booking` |
| `Siemens AG` | `siemens` |
| `SAP SE` | `sap` |
| `Société Générale S.A.` | `societe generale` |
| `Acme Pty Ltd` | `acme` |
| `Globex GmbH` | `globex` |
| `Initech, L.L.C.` | `initech` |
| `3M Company` | `3m` |
| `AT&T Inc.` | `at and t` |
| `H&M` / `H & M` | `h and m` |
| `L'Oréal` | `l oreal` |
| `Meta Platforms, Inc.` | `meta platforms` (needs alias `Meta`) |
| `Self-employed` / `Stealth Startup` | null |
| `Company` / `Ltd` | `company` / `ltd` |
| `''` / `'   '` / null | null |

**Alias table** (`company_aliases`, data.md §3.4). Sources: `admin` (platform admin adds "Meta" for "Meta Platforms"), `domain` (trigger adds the first label of each verified domain, e.g. `acmepay.test` → `acmepay`), `seed`. Recruiter company admins may suggest aliases later; MVP is admin-only.

### 2.10 "Connections at this company"

Rules: only the applicant's **own** connections, only from the **active** import, and only those whose **current** Company (the Company column of Connections.csv, which LinkedIn fills with the connection's current employer at export time) matches the job's company. Positions history of connections is not in the export and is not inferred.

Match kinds, against `targets = {companies.name_normalized} ∪ {company_aliases.alias_normalized}`:

| Kind | Rule | UI |
|---|---|---|
| `exact` | `company_name_normalized = target` | "Works at {Company}" |
| `prefix` | target ≥ 6 chars and `company_name_normalized LIKE target || ' %'` (e.g. `oracle health` for `oracle`, `amazon web services` for `amazon`) | "Possible match" |
| `fuzzy` | target ≥ 5 chars, connection value ≥ 5 chars, `similarity() ≥ 0.6` (catches `acme paymnts` 0.69, `acme payment` 0.80; rejects `meta`/`metal` by length, `intel`/`intelsat` 0.50) | "Possible match" |

`targets` contain only `[a-z0-9 ]` after normalisation, so `LIKE` needs no escaping.

```sql
create or replace function public.connections_at_company(p_company_id uuid)
returns table (id uuid, first_name text, last_name text, "position" text,
               company_name text, connected_on date, match_kind text, match_score real)
language sql stable security invoker set search_path = '' as $$
  with targets as (
    select c.name_normalized as n from public.companies c
     where c.id = p_company_id and c.name_normalized is not null
    union
    select a.alias_normalized from public.company_aliases a
     where a.company_id = p_company_id and a.alias_normalized is not null
  ),
  mine as (
    select cn.* from public.connections cn
    join public.applicant_profiles ap
      on ap.profile_id = (select auth.uid()) and cn.import_id = ap.active_linkedin_import_id
    where cn.applicant_id = (select auth.uid()) and cn.company_name_normalized is not null
  ),
  matched as (
    select m.*,
      case
        when m.company_name_normalized in (select n from targets) then 'exact'
        when exists (select 1 from targets t where char_length(t.n) >= 6
                       and m.company_name_normalized like t.n || ' %') then 'prefix'
        when exists (select 1 from targets t where char_length(t.n) >= 5
                       and char_length(m.company_name_normalized) >= 5
                       and extensions.similarity(m.company_name_normalized, t.n) >= 0.6) then 'fuzzy'
      end as kind,
      (select max(extensions.similarity(m.company_name_normalized, t.n)) from targets t) as score
    from mine m
  )
  select id, first_name, last_name, position, company_name, connected_on, kind, score
  from matched where kind is not null
  order by case kind when 'exact' then 0 when 'prefix' then 1 else 2 end,
           connected_on desc nulls last, last_name, first_name
  limit 100;
$$;
grant execute on function public.connections_at_company(uuid) to authenticated;
```

Because the function is `security invoker` and filters on `auth.uid()`, a recruiter calling it gets zero rows (RLS on `connections` also returns nothing). Cost: the exact branch uses `connections_match_idx`; the fuzzy branch scans one applicant's active import (≤ 30k rows, a few ms). If profiling shows otherwise, switch the fuzzy branch to the `%` operator with `set pg_trgm.similarity_threshold = 0.6` in the function's `SET` clause to use the GIN index.

---

## 3. Data model changes

All DDL is in data.md. Ingestion-specific items:
- `linkedin_imports` columns `counts`, `warnings`, `error`, `error_detail`, `headline`, `summary`, `industry`, `geo_location`, `raw_deleted_at`, `uploaded_at` (D-14), `started_at`, `parsed_at` (data.md §3.6).
- `connections` without email/URL; `company_name_normalized` generated (data.md §3.6).
- NEW `company_aliases` and the domain-alias trigger (data.md §3.4).
- Functions `activate_linkedin_import` (service role) and `connections_at_company` (authenticated), above.
- pg_cron hourly: imports in `pending` older than 24 h → `failed` / `ABANDONED`. Inngest daily cron `purge-linkedin-raw`: remove Storage objects for imports with `raw_deleted_at is null` that are terminal or older than 7 days.

`counts` shape:
```json
{ "connections": { "parsed": 1428, "skipped": 3, "no_company": 41, "duplicates": 2 },
  "positions": { "parsed": 7, "current": 1 }, "skills": { "parsed": 48 }, "education": { "parsed": 2 },
  "files_ignored": 37 }
```

`warnings` shape (max 50 entries, never cell values):
```json
[{ "file": "Connections.csv", "code": "DATE_UNPARSED", "count": 4, "rows": [12, 88, 301, 977] }]
```

---

## 4. API endpoints

Route handlers (Backend implements; contract owned here). All require `requireRole('applicant')`, camelCase JSON, error shape per MASTER_PLAN §5.

### `POST /api/v1/linkedin-imports` (init)
Request:
```json
{ "source": "zip", "files": [{ "name": "Complete_LinkedInDataExport_10-01-2026.zip", "size": 812345 }] }
```
or `{ "source": "csv", "files": [{ "name": "Connections.csv", "size": 90211 }, { "name": "Positions.csv", "size": 4100 }] }`.
Validation: `zip` → exactly one `.zip` ≤ 50 MB; `csv` → 1–5 `.csv` files ≤ 20 MB each, no two with the same known basename. Rate limit 10/day.
Response `201`:
```json
{ "importId": "uuid", "uploads": [{ "name": "Connections.csv", "path": "<uid>/<importId>/Connections.csv", "signedUrl": "...", "token": "..." }], "expiresAt": "..." }
```
Errors: `VALIDATION_FAILED` (422, `details.fields`), `FILE_TOO_LARGE` → mapped to `VALIDATION_FAILED` with `details.code`, `RATE_LIMITED` (429), `FORBIDDEN` (not an applicant).

### `POST /api/v1/linkedin-imports/{id}/complete`
Checks the import is own and `pending`, lists Storage objects and compares names and sizes with init, sets `uploaded_at = now()` (D-14), then sends `linkedin/import.uploaded`. Response `202 { "importId": "uuid", "status": "pending" }`. Errors: `NOT_FOUND`, `CONFLICT` (not pending), `VALIDATION_FAILED` (`details.code = "UPLOAD_MISSING"`).

### `GET /api/v1/linkedin-imports/{id}` (poll every 2 s until terminal)
```json
{ "id": "uuid", "status": "succeeded", "source": "zip",
  "filesPresent": ["Profile.csv","Positions.csv","Skills.csv","Connections.csv"],
  "counts": { "...": "..." }, "warnings": [ { "file": "Connections.csv", "code": "DATE_UNPARSED", "count": 4, "rows": [12,88,301,977] } ],
  "error": null, "parsedAt": "2026-10-02T10:00:00Z", "isActive": true }
```
On failure: `"status": "failed", "error": { "code": "CSV_MISSING_REQUIRED_COLUMNS", "message": "Connections.csv is missing the Company column.", "file": "Connections.csv", "missing": ["company_name"] }`. Errors: `NOT_FOUND`.

### `GET /api/v1/linkedin-imports/active`
Summary of the active import (same shape) or `404 NOT_FOUND` if none. Used by onboarding and Settings, and by the "will be removed" warning (L2).

### `DELETE /api/v1/linkedin-imports/active?scope=all|connections`
`all`: sends `linkedin/import.deleted` (in `parse-linkedin-import`'s `cancelOn`, D-14), then deletes every import of the applicant (cascade) and raw files; a run that is already past cancellation finds its row gone and `activate_linkedin_import` returns without effect. `connections`: deletes `connections` rows of the active import only and sets `counts.connections.parsed = 0`. `204`. Logs `linkedin.import_deleted`.

### `GET /api/v1/jobs/{jobId}/connections`
Calls `rpc('connections_at_company', { p_company_id: job.company_id })` with the user client. Backend may embed the same payload in the Check-fit response (brief §3.1).
```json
{ "data": [{ "id": "uuid", "firstName": "Ada", "lastName": "Quill", "position": "Staff Engineer",
             "companyName": "Acme Payments, Inc.", "connectedOn": "2024-01-15", "matchKind": "exact" }],
  "exactCount": 6, "possibleCount": 1, "asOf": "2026-09-30T12:00:00Z" }
```
Errors: `NOT_FOUND` (job not visible), `FORBIDDEN` (not applicant). No active import → `200` with empty `data` and `asOf: null`.

### Error code → UI message

| Code | Fatal | Message shown to the user |
|---|---|---|
| `FILE_TOO_LARGE` | yes | "That file is larger than 50 MB. Request only Connections, Positions, Profile, Skills and Education from LinkedIn, or upload the CSVs one by one." |
| `UNSUPPORTED_FILE_TYPE` | yes | "That doesn't look like a LinkedIn export. Upload the .zip from LinkedIn or the CSV files inside it." |
| `ZIP_INVALID` / `ZIP_ENCRYPTED` | yes | "We couldn't open this ZIP. Download it again from LinkedIn and upload it without changes." |
| `ZIP_TOO_MANY_ENTRIES` / `ZIP_UNCOMPRESSED_TOO_LARGE` / `ZIP_SUSPICIOUS_RATIO` | yes | "This archive is too large to process. Upload the individual CSV files instead." |
| `NO_RECOGNIZED_FILES` | yes | "We didn't find Profile, Positions, Skills, Education or Connections in this upload." |
| `DUPLICATE_FILE_KIND` | yes | "You uploaded two {kind} files. Remove one and try again." |
| `ENCODING_UNSUPPORTED` | yes | "{file} uses a text encoding we can't read. Export it again from LinkedIn." |
| `CSV_HEADER_NOT_FOUND` | yes | "We couldn't find the column headers in {file}." |
| `CSV_MISSING_REQUIRED_COLUMNS` | yes | "{file} is missing these columns: {missing}." |
| `CSV_MALFORMED` | yes | "{file} looks damaged (from row {row}). Export it again from LinkedIn." |
| `ROW_LIMIT_EXCEEDED` | yes | "{file} has more rows than we support ({limit})." |
| `SUPERSEDED` | yes | (silent; the newer upload is shown) |
| `ABANDONED` | yes | "Upload didn't finish. Please try again." |
| `INTERNAL` | yes | "Something went wrong on our side. Please try again." |
| `DATE_UNPARSED`, `VALUE_TRUNCATED`, `DUPLICATE_ROW`, `ROWS_TRUNCATED`, `ENCODING_FALLBACK`, `UNKNOWN_FILE_IGNORED`, `UNMAPPED_HEADER` | no | Shown in a collapsed "Imported with notes" panel, e.g. "4 connection dates couldn't be read (rows 12, 88, 301, 977)." |

---

## 5. Edge cases

- Upload init succeeded but the browser never uploaded → `ABANDONED` after 24 h, prefix purged.
- `complete` called twice → second call returns `409 CONFLICT` (status no longer `pending`); the Inngest event is sent once (event id = `importId` for dedupe).
- Two tabs upload at once → the later import wins; the earlier is `SUPERSEDED`; `activate` also refuses to activate an import older than another live one.
- Tab B calls init and is abandoned; tab A (older) completes → A activates, because B has `uploaded_at` null (D-14). Integration test required.
- User deletes LinkedIn data while a parse runs → `linkedin/import.deleted` cancels the run; if activation already started, it finds no row and returns (D-14).
- ZIP containing both `Connections.csv` and `connections.csv` (case variants) → `DUPLICATE_FILE_KIND`.
- Connections.csv with header only, or 0 data rows → succeeds with `parsed: 0` (a member with no connections is valid).
- Connections.csv where every Company is empty (privacy settings) → succeeds; UI says "Your export has no company information for your connections."
- Excel-resaved CSV (semicolon delimiter in some locales) → `papaparse` delimiter auto-detection among `, ; \t`; header detection still applies.
- A connection works at the applicant's target company under a brand name ("Instagram" for Meta) → no match unless an admin alias exists. Accepted for MVP.
- Applicant deletes their account during parsing → steps fail on the FK / missing import; `onFailure` treats "import not found" as done; the account-deletion flow removes Storage objects.
- Job's company has no normalised name (blank after normalisation) → `targets` empty → no matches.
- Company renamed by admin → generated column recomputes on update; matches change on next call (no stored match table to refresh).
- Normalisation function changed in a migration → the migration must touch rows to recompute generated columns (data.md §1.2).

---

## 6. Testing approach

**Fixtures** in `supabase/tests/fixtures/linkedin/` (fictional people only; shared by Vitest and seed):

| File | Covers |
|---|---|
| `connections_current.csv` | "Notes:" preamble with quoted URL text, blank line, header, 40 rows; quoted commas (`"Acme Payments, Inc."`); empty Company; empty Email; Unicode names; `15 Jan 2024` dates |
| `connections_legacy_no_preamble.csv` | header on row 0; `01/15/24` dates |
| `connections_bom_crlf.csv` | UTF-8 BOM + CRLF |
| `connections_utf16le.csv` | UTF-16LE with BOM |
| `connections_cp1252.csv` | Windows-1252 accents → `ENCODING_FALLBACK` |
| `connections_renamed_headers.csv` | `Company Name`, `Title`, `Connected on` aliases; extra unknown column → `UNMAPPED_HEADER` |
| `connections_localized_dates.csv` | `5 janv. 2024`, `15. Jan. 2024`, `3 mrt 2023`, garbage date → `DATE_UNPARSED` |
| `connections_missing_company.csv` | no Company column → `CSV_MISSING_REQUIRED_COLUMNS` |
| `connections_semicolon.csv` | `;` delimiter |
| `connections_duplicates.csv` | duplicate rows → `DUPLICATE_ROW` |
| `connections_generic_employers.csv` | Self-employed, Stealth, Freelance → never match |
| `positions_current.csv` | empty `Finished On` → `is_current`; `Present`; multi-line quoted description; `Jan 2020` |
| `skills.csv`, `skills_dupes.csv` | case-insensitive duplicate skills |
| `education_years.csv` | year-only dates; `Activities` dropped |
| `profile_full.csv` | Address, Birth Date, Zip, Twitter present → asserted **not** stored |
| `export_full.zip` | five files + `messages.csv`, `Invitations.csv`, an image → only five inflated |
| `export_nested.zip` | files under `Basic_LinkedInDataExport_10-01-2026/` |
| `export_case_dupes.zip` | `Connections.csv` + `connections.csv` → `DUPLICATE_FILE_KIND` |
| generated in test: `zip_bomb.zip` (1 GB of zeros), `zip_lying_header.zip` (declared size 1 KB, real 50 MB), `zip_encrypted.zip`, `zip_traversal.zip` (`../../Connections.csv`), `not_a_zip.zip` (PDF bytes), `connections_40k.csv` | limits and errors |

**Vitest (unit, `lib/parsers/linkedin/*.test.ts`)**: header detection index per fixture; alias mapping; date parser table (§2.6) as a parameterised test; encoding detection; projection never includes `url`/`email` keys (assert on object keys of every parsed row); row and field caps; ZIP limits including the lying header (asserts abort at 20 MB inflated, measured).

**Integration (Vitest + local Supabase + Inngest dev server)**: run `parse-linkedin-import` end to end on `export_full.zip`; assert row counts, `status='succeeded'`, Storage prefix empty, `raw_deleted_at` set, previous import deleted; failure path leaves the previous import active; retry of a `parse-connections` step does not duplicate rows; event payloads and step outputs contain no names (snapshot of Inngest dev server run output, grep for fixture names).

**pgTAP**: `07_normalize.test.sql` (all vectors in §2.9); `03_connections_privacy.test.sql` (data.md §11); `connections_at_company` returns the expected exact/prefix/fuzzy sets for the seed applicant (6 exact for Acme, 1 fuzzy `Acme Paymnts`, 0 for `Metal Works` against an alias `Meta`); returns only the active import's rows; returns 0 rows for a recruiter; `activate_linkedin_import` refuses a superseded import and is not executable by `authenticated`.

**E2E (Playwright)**: upload `export_full.zip` in onboarding → success summary with counts; upload `connections_missing_company.csv` → inline error message from the table above; Check fit on an Acme job lists the matched connections.

## Review notes

### Backend review

**Agree. I have adopted these in my docs** (backend.md §2.4, §2.5, §4.2):
- **Pipeline and Inngest config:** adopted in backend.md as the spec for `parse-linkedin-import`: per-kind steps, delete-then-insert by `import_id`, `activate_linkedin_import` doing an atomic replace-all, concurrency 1 per `applicantId`, `cancelOn` superseding uploads, and `NonRetriableError` for validation errors. The event payload is now `{importId, applicantId}`, with event id = `importId`.
- **API contract:** I switched my request and response shapes to yours: `{name, size}`, `uploads[].signedUrl`, and `matchKind/exactCount/possibleCount/asOf` on `/jobs/{jobId}/connections`. I also aligned the resume upload init to `{name, size, mimeType}` → `signedUrl` for consistency. I added `GET /linkedin-imports/active` and `DELETE /linkedin-imports/active?scope=`, which replace my `deleteLinkedInData` server action.
- **Limits:** I now cite your §2.3 (Connections ≤ 35,000 fatal, other files truncated) instead of my own caps. I also replaced my raw-file purge with your `purge-linkedin-raw`.
- **L5 onboarding gate:** "resume + import with ≥1 recognised file" adopted. My `completeApplicantOnboarding` calls `mark_onboarded()`.
- **L3 atomic import:** agreed.

**Issues:**
1. **`activate_linkedin_import` supersede check includes `pending`.** A newer import that was only *initialised* (init called, upload abandoned, or a second tab opened the dialog) has status `pending`. It would block the older, fully uploaded import from activating, which fails as `SUPERSEDED`, until the newer one is marked `ABANDONED` 24 h later. `cancelOn` only fires on `linkedin/import.uploaded`, so it handles real supersession. **Proposal:** count only newer imports with status `running` or `succeeded`, or `pending` ones whose `complete` was called (add `uploaded_at` and check `uploaded_at is not null`). Please add the edge case "init in tab B, abandon; tab A completes → A activates" to the integration tests.
2. **`complete` request with an Inngest event-id dedupe of `importId`:** fine. My sweeper (`sweep-stuck-work`) re-emits for `pending` imports whose `complete` succeeded but that never reached `running` after 10 min. It needs the same `uploaded_at` marker to tell "completed" apart from "init only". This is the same request as (1).
3. **Service-role inserts in step c:** the 1,000-row chunks go through PostgREST with the service role. Please make sure `connections` has no trigger that calls `auth.uid()`, because it is null under the service role. Also make sure the generated `company_name_normalized` (with `unaccent`) is fast enough for 35k rows: about 35 requests, which is fine within the 120 s step timeout.
4. **`DELETE …/active?scope=all` while a parse is running:** please define this. My suggestion: the handler also cancels the run by sending `linkedin/import.deleted`, which is added to `cancelOn`, and marks running imports `failed` (`DELETED`). Otherwise `activate` could resurrect data the user just deleted.
5. **Rate limit placement:** 10 imports/day is enforced on init (`uploads.init` policy in backend.md §2.6). `complete` is not limited separately.
6. **Fit cache interplay:** confirmed. `fit_evaluations.linkedin_import_id` is part of my `input_hash` (ai-evaluation.md A2), so activation invalidates cached fits automatically. The deleted old import nulls the provenance FK only.

## Resolution

_Lead, pass 2. IDs refer to the [MASTER_PLAN Decision log](../MASTER_PLAN.md#13-decision-log)._

| Item | Outcome |
|---|---|
| L1 localized headers | **Accepted.** The Lead recruits three or more testers with non-English exports in Phase 0 (MASTER_PLAN §11), and their exports become fixtures before Phase 1 exits. |
| L2 replace-all, L3 atomic import, L4 possible matches shown separately, L6 50 MB cap with guidance | **Accepted.** |
| L5 onboarding gate | **LinkedIn import required (product owner, D-39).** Onboarding needs a succeeded import (≥ 1 recognised file) and a parsed resume. Partial exports remain valid. If the applicant later deletes their data, Check fit and Apply return `CONFLICT linkedin_required` until a new import succeeds. |
| Backend 1–2: init-only imports blocking activation | **Fixed (D-14).** New column `linkedin_imports.uploaded_at`, set by `complete`. The supersede check counts newer imports only when they are `running` or `succeeded`, or `pending` with `uploaded_at` set. The sweeper uses `uploaded_at` to tell a completed upload from an init-only one. §2.7, §3, §4 and §5 have been updated. |
| Backend 3: service-role inserts | **Confirmed.** No trigger on `connections` reads `auth.uid()`. The generated `company_name_normalized` cost at 35k rows is acceptable. Re-measure in Phase 1. |
| Backend 4: delete during parse | **Fixed (D-14).** `DELETE …/active` sends `linkedin/import.deleted`, which is in `cancelOn`. `activate_linkedin_import` returns quietly when the row is gone. |
| Backend 5–6 | **Accepted.** |
