"""Step 7 warm-up: multinomial logistic regression (L1) on pbmc68k_reduced.

Goal is understanding, not a final model:
  * stratified train/test split
  * 5-fold CV over the regularization strength C  (C = 1/lambda)
  * held-out accuracy, confusion matrix, per-class report
  * top-weight genes per class -> do they match known markers?
  * a first look at calibration (confidence vs. actual accuracy)
Outputs go to results/warmup_*.
"""
from __future__ import annotations

import json
from pathlib import Path

import anndata as ad
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    log_loss,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).parent
OUT = HERE / "results"
SEED = 0
C_GRID = np.logspace(-2, 1, 7)  # 0.01 ... 10  (smaller C = stronger L1 = fewer genes)

# ---------- data ----------
a = ad.read_h5ad(HERE / "data" / "pbmc68k_reduced.h5ad")
X = a.raw.X  # log1p-normalized counts (not the z-scored .X) - what a user's file will look like
X = X.toarray() if sparse.issparse(X) else np.asarray(X)
genes = np.asarray(a.raw.var_names)
y = a.obs["bulk_labels"].astype(str).to_numpy()
classes = np.unique(y)
print(f"cells {X.shape[0]}, genes {X.shape[1]}, classes {len(classes)}")

X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, stratify=y, random_state=SEED)
scaler = StandardScaler().fit(X_tr)  # fit on train only - no leakage
Z_tr, Z_te = scaler.transform(X_tr), scaler.transform(X_te)


def model(C: float) -> LogisticRegression:
    return LogisticRegression(penalty="l1", solver="saga", C=C, max_iter=5000, tol=1e-3, random_state=SEED)


# ---------- CV over C ----------
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
cv_rows = []
for C in C_GRID:
    accs, losses, nz = [], [], []
    for tr, va in cv.split(Z_tr, y_tr):
        m = model(C).fit(Z_tr[tr], y_tr[tr])
        p = m.predict_proba(Z_tr[va])
        accs.append(accuracy_score(y_tr[va], m.classes_[p.argmax(1)]))
        losses.append(log_loss(y_tr[va], p, labels=m.classes_))
        nz.append(int((np.abs(m.coef_) > 1e-6).any(0).sum()))
    cv_rows.append(dict(C=float(C), acc=float(np.mean(accs)), acc_sd=float(np.std(accs)),
                        logloss=float(np.mean(losses)), genes_used=float(np.mean(nz))))
    print(f"C={C:6.3f}  cv acc {np.mean(accs):.3f}±{np.std(accs):.3f}  logloss {np.mean(losses):.3f}  genes used {np.mean(nz):.0f}")

best = min(cv_rows, key=lambda r: r["logloss"])  # log-loss rewards good probabilities, not just argmax
C_best = best["C"]
print(f"best C by CV log-loss: {C_best}")

fig, ax1 = plt.subplots(figsize=(6, 4))
ax1.errorbar([r["C"] for r in cv_rows], [r["acc"] for r in cv_rows], [r["acc_sd"] for r in cv_rows], marker="o", label="CV accuracy")
ax1.set_xscale("log"); ax1.set_xlabel("C = 1/lambda  (right = weaker L1)"); ax1.set_ylabel("accuracy")
ax2 = ax1.twinx()
ax2.plot([r["C"] for r in cv_rows], [r["logloss"] for r in cv_rows], "s--", color="tab:red", label="CV log-loss")
ax2.set_ylabel("log-loss", color="tab:red")
ax1.axvline(C_best, color="gray", ls=":")
fig.legend(loc="upper center", ncol=2); fig.tight_layout(); fig.savefig(OUT / "warmup_cv_curve.png", dpi=130); plt.close(fig)

# ---------- final fit + held-out evaluation ----------
m = model(C_best).fit(Z_tr, y_tr)
P_te = m.predict_proba(Z_te)
pred = m.classes_[P_te.argmax(1)]
acc = accuracy_score(y_te, pred)
bacc = balanced_accuracy_score(y_te, pred)
ll = log_loss(y_te, P_te, labels=m.classes_)
print(f"\nHELD-OUT ({len(y_te)} cells): accuracy {acc:.3f}, balanced accuracy {bacc:.3f}, log-loss {ll:.3f}")
report = classification_report(y_te, pred, labels=m.classes_, zero_division=0)
print(report)

cm = confusion_matrix(y_te, pred, labels=m.classes_)
fig, ax = plt.subplots(figsize=(8, 7))
im = ax.imshow(cm, cmap="Blues")
ax.set_xticks(range(len(m.classes_))); ax.set_xticklabels(m.classes_, rotation=60, ha="right", fontsize=8)
ax.set_yticks(range(len(m.classes_))); ax.set_yticklabels(m.classes_, fontsize=8)
ax.set_xlabel("predicted"); ax.set_ylabel("true")
for i in range(cm.shape[0]):
    for j in range(cm.shape[1]):
        if cm[i, j]:
            ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=8, color="white" if cm[i, j] > cm.max() / 2 else "black")
fig.colorbar(im); fig.tight_layout(); fig.savefig(OUT / "warmup_confusion.png", dpi=130); plt.close(fig)

# ---------- explainability: top-weight genes per class ----------
n_used = int((np.abs(m.coef_) > 1e-6).any(0).sum())
print(f"genes with any non-zero weight: {n_used} / {len(genes)}")
top = {}
for k, cls in enumerate(m.classes_):
    w = m.coef_[k]
    idx = np.argsort(-w)[:8]
    top[cls] = [(str(genes[i]), float(w[i])) for i in idx if w[i] > 0]
    print(f"{cls:32s} " + ", ".join(f"{g}({v:.2f})" for g, v in top[cls]))

# ---------- first look at calibration ----------
conf = P_te.max(1)
correct = (pred == y_te).astype(float)
bins = np.array([0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.01])
calib = []
print("\nconfidence bin -> n, actual accuracy (if calibrated, accuracy ~ confidence)")
for lo, hi in zip(bins[:-1], bins[1:]):
    sel = (conf >= lo) & (conf < hi)
    if sel.sum():
        calib.append(dict(lo=float(lo), hi=float(min(hi, 1.0)), n=int(sel.sum()), mean_conf=float(conf[sel].mean()), acc=float(correct[sel].mean())))
        print(f"  [{lo:.2f},{min(hi,1):.2f})  n={sel.sum():3d}  mean conf {conf[sel].mean():.3f}  acc {correct[sel].mean():.3f}")

# ---------- save ----------
(OUT / "warmup_metrics.json").write_text(json.dumps(dict(
    n_train=int(len(y_tr)), n_test=int(len(y_te)), C_best=C_best, cv=cv_rows,
    heldout=dict(accuracy=acc, balanced_accuracy=bacc, log_loss=ll),
    genes_used=n_used, top_genes=top, calibration=calib,
    confusion=dict(labels=list(map(str, m.classes_)), matrix=cm.tolist()),
), indent=2))
(OUT / "warmup_report.txt").write_text(report)
# prototype of the step-9 export: everything the browser needs for  softmax(W z + b), z = (x - mean)/std
(OUT / "warmup_model.json").write_text(json.dumps(dict(
    classes=list(map(str, m.classes_)), genes=list(map(str, genes)),
    mean=scaler.mean_.tolist(), std=scaler.scale_.tolist(),
    W=m.coef_.tolist(), b=m.intercept_.tolist(),
)))
print(f"\nwrote {OUT}/warmup_*.png|json|txt")
