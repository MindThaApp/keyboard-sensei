# PianoCoRe Fetch Mechanism Findings

## Summary/Recommendation

Shell-level internet access was not usable in this session: every quoted `curl` request to HuggingFace, HuggingFace Datasets Server, and Zenodo failed DNS resolution with `curl: (6) Could not resolve host`. Because of that, I could not produce a successful command-line `curl` response for the `/api/datasets/.../parquet` endpoint or the `/rows` endpoint.

The browser fetch path did load the live HuggingFace dataset page and Zenodo record. That live HuggingFace dataset viewer confirms the dataset is auto-converted to Parquet, has config `default`, splits `train` and `test`, and exposes byte-array columns including `score_xml_bytes`, `score_midi_bytes`, `performance_midi_bytes`, `refined_score_midi_bytes`, and `refined_performance_midi_bytes`. The visible sample rows show `performance_midi_bytes` as inline integer byte arrays beginning with the MIDI header bytes `[77, 84, 104, 100, ...]`.

Recommendation for the later ingest/import tasks: use the HuggingFace Datasets Server row API as the intended on-demand fetch mechanism, but treat this investigation as not fully complete until a normal network environment confirms the exact JSON shape from:

```bash
curl -sS -L 'https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=train&offset=0&length=1'
```

If that command returns the same data shown by the live dataset viewer, import-time fetch can reconstruct MIDI/MusicXML bytes directly from per-row byte arrays and does not require bulk download. If it does not, the fallback bulk source verified on Zenodo is `PianoCoRe-1.0-raw-midi.zip` at 2.9 GB for raw score/performance MIDI and MusicXML/MXL files.

## Confirmed Shard/Config/Split Layout

### Shell command evidence

Attempted command:

```bash
curl -sS -L --max-time 30 https://huggingface.co/datasets/SyMuPe/PianoCoRe/tree/main/data | head -c 2000
```

Observed output:

```text
curl: (6) Could not resolve host: huggingface.co
```

Attempted command:

```bash
curl -sS -L --max-time 30 'https://huggingface.co/api/datasets/SyMuPe/PianoCoRe/parquet' | head -c 2000
```

Observed output:

```text
curl: (6) Could not resolve host: huggingface.co
```

### Browser fetch evidence

Browser fetch of `https://huggingface.co/datasets/SyMuPe/PianoCoRe/tree/main` succeeded and showed:

```text
main
PianoCoRe
8.61 GB
data
.gitattributes
README.md
```

Browser fetch of `https://huggingface.co/datasets/SyMuPe/PianoCoRe/tree/main/data` failed with:

```text
Failed to fetch https://huggingface.co/datasets/SyMuPe/PianoCoRe/tree/main/data: Cache miss
```

Browser fetch of `https://huggingface.co/api/datasets/SyMuPe/PianoCoRe/parquet` failed with:

```text
Failed to fetch https://huggingface.co/api/datasets/SyMuPe/PianoCoRe/parquet: Cache miss
```

Browser fetch of `https://huggingface.co/datasets/SyMuPe/PianoCoRe` succeeded and showed the dataset viewer metadata:

```text
Dataset Viewer
Auto-converted to Parquet
Subset (1)
default · 250k rows
default (250k rows)
Split (2)
train · 225k rows
train (225k rows)test (25k rows)
```

The same page showed top-level dataset attributes:

```text
Formats: parquet
Size: 100K - 1M
License: cc-by-nc-sa-4.0
```

Confirmed from successful browser fetches:

- Repo root has a `data/` directory and reports 8.61 GB.
- Config/subset is `default`.
- Splits are `train` and `test`.
- HuggingFace viewer reports `train` as 225k rows and `test` as 25k rows.
- The direct `data/` listing and `/api/datasets/.../parquet` shard list could not be fetched by shell command or browser fetch in this session, so exact shard filenames/counts were not verified.

## Datasets Server API Test (exact request + real response evidence)

Attempted command:

```bash
curl -sS -L --max-time 30 'https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=train&offset=0&length=1' | head -c 2000
```

Observed output:

```text
curl: (6) Could not resolve host: datasets-server.huggingface.co
```

This means the exact `/rows` request could not be command-verified in this environment.

Browser fetch of the live HuggingFace dataset viewer did expose row data for the same dataset/config/split. The viewer listed these byte columns:

```text
score_xml_bytes
score_midi_bytes
performance_midi_bytes
raw_alignment_bytes
refined_score_midi_bytes
refined_performance_midi_bytes
refined_alignment_bytes
```

The visible first sample row evidence included:

```text
PianoCoRe_000009
Agnew,_Roy
Contrasts
Aria_436432_0
train
Aria-MIDI
Agnew,_Roy/Contrasts/Aria_436432_0.mid
758
155.330002
...
[ 77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 244, 77, 84, 114, 107, 0, 0, 22, 23, ... ]
```

The byte array starts with decimal bytes `77, 84, 104, 100`, which are ASCII `MThd`, the standard MIDI file header. The visible sample row had `score_xml_path`, `score_midi_path`, `score_xml_bytes`, and `score_midi_bytes` as `null`; it had `performance_midi_bytes` populated as an inline integer array. Later visible rows similarly showed inline byte arrays for performance MIDI bytes.

What this establishes:

- The HuggingFace-hosted table contains inline byte columns, not just file path references.
- At least the visible `performance_midi_bytes` values are usable MIDI byte arrays when present.
- The visible sample rows do not prove that `score_xml_bytes` is populated for aligned/scored rows, because the first shown rows had those score fields as `null`.
- The exact Datasets Server JSON encoding could not be verified by `curl` here. The viewer renders byte data as integer arrays; the `/rows` endpoint may return the same integer arrays or a closely related JSON representation, but that exact wire shape still needs command verification outside this DNS-restricted shell.

## metadata.csv Findings (location + actual columns, or confirmation it could not be found)

### Shell command evidence

Attempted command:

```bash
curl -sS -L --max-time 30 'https://zenodo.org/records/19186016/files/metadata.csv?download=1' | head -c 2000
```

Observed output:

```text
curl: (6) Could not resolve host: zenodo.org
```

Attempted command:

```bash
curl -sS -L --max-time 30 https://zenodo.org/records/19186016 | head -c 1000
```

Observed output:

```text
curl: (6) Could not resolve host: zenodo.org
```

### Browser fetch evidence

Browser fetch of `https://zenodo.org/records/19186016` succeeded and showed `metadata.csv` in the Zenodo file list:

```text
metadata.csv
md5:873f55178fc7343bcadcc1ef97305b93
205.8 MB
Preview
Download
```

The same Zenodo record describes the metadata entry point and fields. The fields listed there are:

```text
id
composer
composition
movement
performance_id
split
tier_b
tier_a
tier_a_star
score_dataset
score_id
score_xml_path
score_midi_path
score_note_count
score_duration
performance_dataset
performance_midi_path
performance_note_count
performance_duration
performer
is_transcription
capture_model
raw_alignment_path
raw_recall
raw_precision
raw_adjusted_alignment_ratio
is_duplicate
lead_performance
quality_label
prob_score
prob_high_quality
prob_low_quality
prob_corrupted
is_refined
refined_score_midi_path
refined_score_note_count
refined_score_duration
refined_performance_midi_path
refined_performance_note_count
refined_performance_interpolated_note_count
refined_performance_duration
refined_alignment_path
refined_recall
```

Browser fetch of the HuggingFace dataset viewer showed these same metadata fields as table columns, plus the added byte columns:

```text
score_xml_bytes
score_midi_bytes
performance_midi_bytes
raw_alignment_bytes
refined_score_midi_bytes
refined_performance_midi_bytes
refined_alignment_bytes
```

The actual `metadata.csv` header/sample rows were not command-fetched in this session because shell DNS resolution failed for Zenodo. The `metadata.csv` file location and size were verified from the live Zenodo record by browser fetch; its field list was verified from the live Zenodo record and cross-checked against the live HuggingFace viewer columns.

## Recommendation Detail (per-row on-demand fetch vs. one-time bulk/partial download)

Recommended architecture for later tasks:

1. Use metadata-only ingestion for archive search fields. The verified metadata fields cover composer, composition, movement, performance ID/path, split/tier flags, score path fields, duration/count fields, quality labels, duplicate flags, and refined-path fields.
2. Store enough row locator data to fetch bytes later: `config=default`, `split=train|test`, and either row offset or a stable lookup strategy keyed by `id`/path if the Datasets Server supports filtering/search in the later implementation.
3. At import time, fetch a single row through HuggingFace Datasets Server and reconstruct binary files from byte-array columns:

```bash
curl -sS -L 'https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=<train-or-test>&offset=<row-offset>&length=1'
```

Expected useful columns, based on the live viewer:

- `performance_midi_bytes` for raw performance MIDI.
- `score_xml_bytes` for MusicXML/MXL when the row has a score.
- `score_midi_bytes` for raw score MIDI when present.
- `refined_score_midi_bytes` and `refined_performance_midi_bytes` when refined data is present.

Residual risk:

- The exact `/rows` JSON response could not be observed by command here. Before implementation, rerun the exact `curl` command in a shell with working DNS and confirm whether byte columns arrive as JSON integer arrays, base64 strings, or another representation.
- The visible first rows prove performance MIDI bytes are inline, but they do not prove MusicXML bytes are populated on scored/aligned rows. A follow-up command should test an offset where `score_xml_path` is non-null.

Fallback if the `/rows` API cannot be used:

- Zenodo verified bulk files include `PianoCoRe-1.0-raw-midi.zip` at 2.9 GB, `PianoCoRe-1.0-raw-alignments.zip` at 5.2 GB, and `PianoCoRe-1.0-refined.zip` at 3.6 GB.
- For the app's searchable import use case, the smallest useful bulk fallback is likely `metadata.csv` (205.8 MB) plus `PianoCoRe-1.0-raw-midi.zip` (2.9 GB), roughly 3.1 GB compressed before extraction, if only raw score/performance MIDI and MusicXML/MXL are needed.
- If refined performance files are required locally, add `PianoCoRe-1.0-refined.zip` (3.6 GB), making the compressed staging download roughly 6.7 GB plus `metadata.csv`.
- The full Zenodo archive list visible in this session totals 11.9 GB compressed; the Zenodo record also states the complete extracted dataset takes around 16.43 GB.

## Additional verification (direct, working network access) — residual risk resolved

The prior investigation's shell environment had no DNS resolution. Re-ran the exact recommended command directly and got a real response:

```bash
curl -sS -L --max-time 20 'https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=train&offset=0&length=1'
```

**Confirmed: `performance_midi_bytes` (and by the same pattern, `score_xml_bytes` when present) is a plain base64-encoded string**, not an integer array — e.g. `performance_midi_bytes: "TVRoZAAAAAYAAAABAfRNVHJrAAAWFwD/UQMHoSAAwACMSpBAMgo8LQo0IwotI4EMsEB/gXCQOzeDLjw..."`. Decoded directly (`Buffer.from(str, "base64")` in Node, or Python's `base64.b64decode` for verification) and confirmed it produces genuine MIDI bytes: first 8 bytes are `MThd\x00\x00\x00\x06`, the exact standard MIDI header. **The per-row API is fully viable for on-demand fetch with no bulk download** — `fetch` the row via `https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=<train|test>&offset=<row-offset>&length=1`, take `.rows[0].row.performance_midi_bytes`, `Buffer.from(that, "base64")`.

**New finding, material to ingest/import design: `score_xml_bytes` is only populated for rows with `tier_a: true` (and a non-null `score_id`/`score_xml_path`)** — confirmed by sampling rows 100-104: `tier_a: false` rows had `score_xml_path: null` and no `score_xml_bytes`; `tier_a: true` rows (e.g. `PianoCoRe_000122`-`000125`, all sharing the same underlying piece "España, Op.165 — 2. Tango. Andantino" by Albéniz across multiple performances) had both populated. **Task 3's ingest script should prefer a `tier_a: true` (or `tier_a_star: true`) performance as the representative one per unique piece whenever one exists**, specifically so more pieces end up with real OSMD notation available (Task 8) rather than falling back to the falling-bars-only preview strip.

**New finding, material to Task 8 (OSMD): `score_xml_path` values end in `.mxl`** (e.g. `Albéniz,_Isaac/España,_Op.165/2._Tango._Andantino/score.mxl`) — `.mxl` is the **compressed** MusicXML container format (a zip archive wrapping the actual `.musicxml`/`.xml` file), not plain XML text. OSMD's `load()` API takes a string in the examples found during design research, which implies plain XML — Task 8 needs to verify whether OSMD's `load()` accepts a compressed `.mxl` `ArrayBuffer`/`Uint8Array` directly (some versions of OSMD do auto-detect and decompress `.mxl`), or whether an explicit unzip step (e.g. via a small JS zip library to extract the inner XML entry) is needed before calling `load()`. Confirm this as the very first sub-step of Task 8's "get static rendering working first" stage, before building anything else on top of it.

