# Data Guide: what data the model needs, how to collect it, how to train on it

## 1. What one row is
One row = one social-media profile, observed at one time, with a human-confirmed label.

| Column | Type | Required | Meaning | Where it can legitimately come from |
|---|---|---|---|---|
| `username` | text | **yes** | profile handle | the profile URL the analyst submits |
| `label` | 0 / 1 | **yes** | 0 = likely genuine, 1 = suspicious/fake | human review (see section 3) |
| `official_username` | text | no | the legitimate account being impersonated, if any | the analyst / the organization |
| `account_age_days` | number | no | days since account creation | official API, or visible "joined" date |
| `followers`, `following`, `posts` | integers | no | public counts | official API, or visible on the public page |
| `bio` | text | no | public bio text | official API, or copied from the public page |
| `has_profile_image` | True/False | no | has a profile photo | public page |
| `external_link_present` | True/False | no | bio contains a link | public page |
| `verified` | True/False | no | verified badge shown | public page / API |
| `image_similarity` | 0 to 1 | no | perceptual-hash similarity between the profile image and the organization's official image | you compute it from the org's own logo + the public profile image |
| `repeated_content_ratio` | 0 to 1 | no | share of recent posts that are near-duplicates | computed from public posts, where permitted |

Leave a cell **empty** when the value was not available. Never type 0 for "unknown": 0 followers and "followers not visible" mean different things, and the pipeline treats them differently.

A ready-made example with 12 illustrative rows (hand-written, for format only): `ml-service/data/example_template.csv`. The 20,000-row synthetic datasets are `synthetic_v1` (training) and `synthetic_shift` (stress test), produced by `python -m training.generate_dataset`.

## 2. How much data
| Rows | What it supports |
|---|---|
| < 500 | smoke test only; metrics are noise |
| 1,000 to 5,000 | a rough baseline; wide confidence intervals |
| 10,000+ with at least a few hundred of each class | reasonably stable evaluation |

Both classes are needed. Real fakes are rarer than genuine accounts, so expect something like 5-20% positives. `register_dataset` warns about small or imbalanced data.

## 3. Where labels come from (the hardest part)
Features are easy; trustworthy labels are not. Acceptable sources, strongest first:
1. **Platform-confirmed outcomes**: reports your organization filed that the platform actioned (removed/suspended). Strong for label 1, but absence of action is not proof of genuine.
2. **Two-reviewer analyst labels**: two trained reviewers label independently; disagreements go to a third. Record the agreement rate.
3. **Known-genuine sets**: accounts you can verify through the organization itself (employees, official partners, verified customers who consented).
4. **Reviewer feedback from this app**: cases ending `FALSE_POSITIVE` (label 0) or `APPROVED_FOR_REPORTING` then platform-confirmed (label 1) feed back into the next training set. This is the long-term loop.

Do not label an account fake based on keywords or the model's own output alone. Training on the model's predictions only teaches it to agree with itself.

## 4. How to collect legitimately
- Official platform APIs under their terms (access usually requires app review, and many endpoints are restricted or paid).
- Data that people or organizations **give you** (an organization listing the accounts it has verified as genuine and the ones it reported).
- Publicly visible fields entered by an analyst through the app's manual-entry flow (`ManualEntryProvider`).
- Published research datasets (below), within their licenses.

Do **not** scrape behind logins, bypass rate limits or CAPTCHAs, collect private accounts, or store messages. Collect only the columns above (data minimisation). Keep a record of the source and the terms for each dataset; `register_dataset` requires both.

## 5. Public research datasets (verify availability and license yourself)
I could not check these live, so confirm current links and terms before use.
- **Twitter/X bot datasets** such as Cresci-2017 and TwiBot-20/22, and the Botometer bot repository. They include handles, descriptions, counts and creation dates, so most columns map. Image similarity, official-account comparison and repeated-content ratio would be empty. Their terms may restrict redistribution.
- **Instagram "fake / spammer / genuine" datasets on Kaggle**: many contain only derived numbers (username length, digit counts, bio length), **not** the username or bio text. This pipeline needs the raw `username`, so those files do not drop in. They would need a separate, smaller feature schema (`fs-2`) and a different model. I can build that adapter if you want it.

Expect lower scores than the synthetic data: real data is messier, and public datasets age quickly because spam tactics change.

## 6. Train on your data
```bash
cd ml-service
# 1. validate and register (writes data/labeled_v1.csv + data/labeled_v1.meta.json)
python -m training.register_dataset --csv my_labels.csv --name labeled_v1 \
    --kind REAL_AUTHORIZED --source "Analyst-reviewed, Jan-Mar 2027" --license "internal use"

# 2. train a new, separately versioned model (never overwrites v1)
python -m training.train --dataset labeled_v1 --version v2

# 3. check it on data it never saw
python -m training.evaluate --version v2 --dataset labeled_v1
python -m training.evaluate --version v2 --dataset synthetic_shift   # sanity check only

# 4. serve it
MODEL_DIR=./models ACTIVE_MODEL_VERSION=v2 uvicorn app.main:app --port 8000
```
`register_dataset` accepts `--kind REAL_AUTHORIZED | PUBLIC_RESEARCH | MANUAL_LABELED | SYNTHETIC`. The kind is saved with the model, and the "SYNTHETIC" warning appears in `metrics.json` only when it applies.

## 7. Pitfalls that make real-data metrics look better than they are
- **Duplicates / near-duplicates across splits** (same account twice, or the same impersonation campaign) inflate scores. De-duplicate by username before registering, and ideally split by campaign or organization rather than by row.
- **Time leakage**: train on older profiles, test on newer ones. A random split hides how fast spam tactics drift.
- **Label leakage**: do not add features derived from how the label was produced (e.g. "was reported").
- **Selection bias**: if you only collect accounts someone already found suspicious, the genuine class will look unlike real traffic.
- **One high AUC is not enough**: look at precision at the HIGH threshold and the false-positive count. Re-choose thresholds from the validation split of the new data (`metrics.json` > `suggested_thresholds`) instead of keeping 0.30/0.70.
