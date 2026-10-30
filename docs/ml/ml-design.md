# SocialGuard AI — ML Design (Phases 7-9)

> **All numbers below come from SYNTHETIC data written by the project author.** They show the pipeline works. They are not evidence of real-world detection performance.

## 1. Problem framing
Binary risk estimate: `0 = likely genuine`, `1 = suspicious/fake`. Output is a **probability** (a model signal), never "Fake = True". The API's risk engine (not this service) maps probability to LOW/MEDIUM/HIGH using configurable thresholds.

## 2. Files
| Path | Purpose |
|---|---|
| `ml-service/app/features.py` | Feature engineering, used by training AND serving (embedded in the saved pipeline) |
| `ml-service/training/generate_dataset.py` | Synthetic data generator (`default` and `shifted` profiles) |
| `ml-service/training/train.py` | Training, class-weight experiment, threshold suggestion, bundle writer |
| `ml-service/training/evaluate.py` | Evaluate a saved model on its test split or on a shifted dataset |
| `ml-service/training/predict.py` | Score one profile from the command line |
| `ml-service/app/main.py` | FastAPI: `/health`, `/model/info`, `/predict` |
| `ml-service/models/v1/` | `model.joblib`, `metrics.json`, `metadata.json`, `feature_schema.json`, `evaluation_*.json` |

Reproduce everything:
```bash
cd ml-service
python -m training.generate_dataset --name synthetic_v1
python -m training.generate_dataset --name synthetic_shift --profile shifted --seed 7
python -m training.train --dataset synthetic_v1 --version v1
python -m training.evaluate --version v1 --dataset synthetic_v1
python -m training.evaluate --version v1 --dataset synthetic_shift
MODEL_DIR=./models ACTIVE_MODEL_VERSION=v1 uvicorn app.main:app --port 8000
```

## 3. Pipeline
`raw record → engineer_features → SimpleImputer(median, add_indicator) → StandardScaler → LogisticRegression`, saved as **one** scikit-learn `Pipeline`. Serving calls the same object, so training/inference skew cannot occur. `model_store.load_model` verifies the file's SHA-256 against `metadata.json` before unpickling (joblib files are pickles).

## 4. Features (schema `fs-1`, 18 features)
Account age, followers, following, posts (log-scaled); followers-to-following ratio; posts per day; username length, digit ratio, special characters; **username similarity** (edit distance, leetspeak-normalised) and **username embeds official name**; image similarity (externally supplied perceptual-hash score); profile completeness; external link; verified; bio length; promotional-phrase count; repeated-content ratio.

- **Unavailable ≠ zero.** A field a provider can't supply is `NaN`, median-imputed *with an explicit missing-indicator column*, and reported as `UNAVAILABLE` in explanations and `unavailable_fields`.
- **Divide-by-zero safe** (tested): `log((followers+1)/(following+1))`, `log1p(posts / max(age, 1))`.
- **No TF-IDF in v1, deliberately.** Synthetic bios are generated from word lists, so a text model would only learn the generator. Bio contributes length and a spam-phrase count only. The phrase list is spam-style wording; a hit is one weak signal and never labels anyone.
- **No face recognition, no identity matching.** Image similarity compares a profile image to an organization's own official image; the hash itself is computed outside this service.

## 5. Why Logistic Regression
Each prediction decomposes exactly: `logit(p) = intercept + Σ coefficient × scaled value`. The service returns those terms as explanations, and a test asserts that the terms reproduce the model's own probability. It's a strong, calibrated baseline on small tabular data. Limits: assumes roughly linear log-odds (hence log transforms), and extrapolates linearly outside the training range (e.g. an extreme posts-per-day value produces an extreme contribution).

## 6. `class_weight`: measured, not assumed
Both options were tuned (5-fold CV on `C`, scored by PR-AUC) and compared on the validation split:

| | best C | CV PR-AUC | Validation PR-AUC | Validation Brier (lower = better calibrated) |
|---|---|---|---|---|
| `None` | 0.01 | 0.8718 | 0.8523 | **0.0456** |
| `balanced` | 0.03 | 0.8720 | 0.8512 | 0.0663 |

Ranking quality is equal. `balanced` inflates probabilities (Brier 45% worse), and the risk bands consume probabilities directly, so **unweighted was selected** (rule: highest validation PR-AUC; if within 0.005, lower Brier). Prevalence here is ~18%, which is mild imbalance. Note: best `C` sits at the lowest value in the grid, so the grid should be extended downward in the next iteration.

## 7. Evaluation (held-out test split, n = 3000, 17.8% positive)
ROC-AUC **0.921** (95% bootstrap CI 0.902-0.938), PR-AUC **0.874** (0.843-0.902), Brier 0.042. Accuracy is deliberately not reported as a headline.

| Threshold | Precision | Recall | F1 | False positives | False negatives |
|---|---|---|---|---|---|
| 0.30 (LOW/MEDIUM edge) | 0.917 | 0.811 | 0.861 | 39 | 101 |
| 0.50 | 0.960 | 0.771 | 0.855 | 17 | 122 |
| 0.70 (MEDIUM/HIGH edge) | 0.979 | 0.709 | 0.823 | 8 | 155 |

Calibration is reasonable: the middle bin predicted 0.46 vs 0.52 observed; the highest bin 0.965 vs 0.977.

### Threshold reasoning
A false positive means a real person gets flagged; a false negative means an impersonator stays up. Analysts and reviewers sit between a flag and any action, so a wrongly *escalated* profile is the harm the system must avoid most. Suggestions computed on **validation only**: HIGH ≥ ~0.26 gives validation precision ≥ 0.90; reaching 90% recall would need a LOW edge near 0.05 (at that cutoff precision is ~0.34). The configured **0.30 / 0.70 are prototype defaults**: 0.70 is more conservative than the precision target requires (precision 0.979, but 29% of suspicious profiles fall below HIGH). They must be re-validated on representative authorized data before any operational use.

### Distribution shift (`synthetic_shift`: older, more believable fakes)
| Threshold | Precision | Recall (same-dist → shifted) |
|---|---|---|
| 0.30 | 0.904 | 0.811 → 0.737 |
| 0.70 | 0.966 | 0.709 → **0.548** |

ROC-AUC barely moved (0.921 → 0.913) but recall at fixed thresholds dropped sharply: ranking survives, **threshold behaviour does not**. This is the practical argument for monitoring and re-tuning thresholds after deployment.

## 8. Things the numbers also reveal
- The largest coefficient is `username_digit_ratio` (+0.92). That reflects my generator (bots get digit-heavy names), not a real-world finding.
- `username_contains_official` has a *negative* coefficient: in the generator, genuine fan accounts embed the official name while impersonators use character edits. Real data may behave differently, which is exactly why explanations must be read as model signals.
- Missing image similarity carries a small positive weight even though missingness is generated independently of the label: noise the model fits at 14,000 rows. Worth watching.

## 9. Versioning
Every prediction returns `model_name`, `model_version`, `dataset_version`, `feature_schema_version`. Bundles are immutable: `train.py` refuses to overwrite an existing version directory.

## 10. Not implemented yet
Calibration post-processing (e.g. isotonic), drift/data-quality monitoring, retraining workflow, cross-validated threshold selection, the image-hash computation, any real-data validation.
